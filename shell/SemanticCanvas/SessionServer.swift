import FlyingFox
import UIKit
import WebKit

/// The Session server (spec #24, issue #27): FlyingFox on one port.
///
/// - `GET /`     → the bundled single-file Canvas, so a Guest's Mac browser
///                 loads the exact bundle the iPad runs (no version skew).
/// - `WS /sync`  → Guest connections. This ticket accepts and holds them;
///                 the frame relay to the room lands in #28.
/// - `WS /host`  → the loopback channel the Canvas page opens; the relay
///                 hub #28 shuttles Guest frames through.
///
/// The Shell stays thin: no product logic here — only serving, the relay
/// plumbing, and hosting lifecycle (screen kept awake while live, teardown
/// on stop and on scene background, since listeners die on suspension).
@MainActor
final class SessionServer {
    static let shared = SessionServer()
    static let port: UInt16 = 8787

    /// Set by CanvasHostView so background teardown can report
    /// sessionStopped over the Bridge.
    weak var webView: WKWebView?

    private var server: HTTPServer?
    private var serverTask: Task<Void, Never>?
    private let relay = SessionRelay()

    var isRunning: Bool { server != nil }

    enum StartError: LocalizedError {
        case bundleMissing

        var errorDescription: String? {
            switch self {
            case .bundleMissing: return "The Canvas bundle is missing."
            }
        }
    }

    /// Starts hosting and returns the device's bare mDNS hostname for the
    /// join panel. Idempotent while already hosting.
    func start() async throws -> String {
        if isRunning { return Self.hostname() }

        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html"),
            let indexData = try? Data(contentsOf: indexURL)
        else { throw StartError.bundleMissing }

        let server = HTTPServer(port: Self.port)
        await server.appendRoute("GET /") { _ in
            HTTPResponse(
                statusCode: .ok,
                headers: [.contentType: "text/html; charset=utf-8"],
                body: indexData
            )
        }
        await server.appendRoute("GET /sync", to: .webSocket(GuestSocketHandler(relay: relay)))
        await server.appendRoute("GET /host", to: .webSocket(HostChannelHandler(relay: relay)))

        let task = Task { _ = try? await server.run() }
        do {
            try await server.waitUntilListening()
        } catch {
            task.cancel()
            throw error
        }

        self.server = server
        self.serverTask = task
        // Hosting pins the meeting: the screen must not lock mid-Session.
        UIApplication.shared.isIdleTimerDisabled = true
        return Self.hostname()
    }

    func stop() async {
        guard let server else { return }
        self.server = nil
        UIApplication.shared.isIdleTimerDisabled = false
        await relay.closeAll()
        await server.stop(timeout: 1)
        serverTask?.cancel()
        serverTask = nil
    }

    /// Scene-background teardown: stop the server and tell the Canvas, so
    /// the join panel is gone when the app foregrounds again.
    func stopForBackground() async {
        guard isRunning else { return }
        await stop()
        if let webView {
            Bridge.send(["v": 1, "event": "sessionStopped"], to: webView)
        }
    }

    /// The device's bare mDNS name ("Farazs-iPad") — no ".local" suffix, no
    /// scheme; the Canvas composes the join URL. `ProcessInfo.hostName` is
    /// the name mDNS actually answers for; when it degenerates (simulator,
    /// "localhost"), fall back to the user-visible device name sanitized to
    /// its mDNS form.
    static func hostname() -> String {
        let raw = ProcessInfo.processInfo.hostName
        let bare = raw.hasSuffix(".local") ? String(raw.dropLast(".local".count)) : raw
        if !bare.isEmpty, bare.lowercased() != "localhost" {
            return bare
        }
        return sanitizedDeviceName()
    }

    private static func sanitizedDeviceName() -> String {
        // "Faraz's iPad" → "Farazs-iPad": drop apostrophes, hyphenate the
        // rest of the non-alphanumerics, collapse and trim the hyphens.
        let dropped = UIDevice.current.name.filter { $0 != "'" && $0 != "\u{2019}" }
        let hyphenated = String(dropped.map { $0.isLetter || $0.isNumber ? $0 : "-" })
        let collapsed = hyphenated
            .split(separator: "-", omittingEmptySubsequences: true)
            .joined(separator: "-")
        return collapsed.isEmpty ? "ipad" : collapsed
    }
}

/// The relay hub between Guest sockets (`/sync`) and the Canvas's loopback
/// channel (`/host`). This ticket only tracks the live connections and
/// closes them on teardown; #28 adds the actual shuttling — each Guest frame
/// wrapped in a `{sid, ev, data}` envelope onto the host channel, and
/// envelope frames from the host fanned back out to the matching Guest.
actor SessionRelay {
    private var host: AsyncStream<WSMessage>.Continuation?
    private var guests: [UUID: AsyncStream<WSMessage>.Continuation] = [:]

    // MARK: Host channel (the Canvas page)

    func hostConnected(outbound: AsyncStream<WSMessage>.Continuation) {
        // One host channel: a reconnecting Canvas replaces the old one.
        host?.finish()
        host = outbound
    }

    func hostFrame(_ message: WSMessage) {
        // #28: parse the envelope, forward data to guests[sid].
    }

    func hostDisconnected() {
        host = nil
    }

    // MARK: Guest sockets (browsers on the LAN)

    func guestConnected(_ id: UUID, outbound: AsyncStream<WSMessage>.Continuation) {
        guests[id] = outbound
        // #28: envelope {sid, ev: "open"} onto the host channel.
    }

    func guestFrame(_ id: UUID, _ message: WSMessage) {
        // #28: envelope {sid, ev: "msg", data} onto the host channel.
    }

    func guestDisconnected(_ id: UUID) {
        guests.removeValue(forKey: id)
        // #28: envelope {sid, ev: "close"} onto the host channel.
    }

    func closeAll() {
        host?.finish()
        host = nil
        for continuation in guests.values {
            continuation.finish()
        }
        guests.removeAll()
    }
}

/// Accepts a Guest's WebSocket upgrade and holds the connection open,
/// registering it with the relay for the lifetime of the socket.
private struct GuestSocketHandler: WSMessageHandler {
    let relay: SessionRelay

    func makeMessages(for client: AsyncStream<WSMessage>) async throws
        -> AsyncStream<WSMessage>
    {
        AsyncStream { continuation in
            let id = UUID()
            let task = Task {
                await relay.guestConnected(id, outbound: continuation)
                for await message in client {
                    await relay.guestFrame(id, message)
                }
                await relay.guestDisconnected(id)
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

/// Accepts the Canvas page's loopback connection — the single host channel.
private struct HostChannelHandler: WSMessageHandler {
    let relay: SessionRelay

    func makeMessages(for client: AsyncStream<WSMessage>) async throws
        -> AsyncStream<WSMessage>
    {
        AsyncStream { continuation in
            let task = Task {
                await relay.hostConnected(outbound: continuation)
                for await message in client {
                    await relay.hostFrame(message)
                }
                await relay.hostDisconnected()
                continuation.finish()
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }
}

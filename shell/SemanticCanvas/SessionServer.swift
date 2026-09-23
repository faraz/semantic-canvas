import FlyingFox
import UIKit
import WebKit

/// The Session server (spec #24, issue #27): FlyingFox on one port.
///
/// - `GET /`     → the bundled single-file Canvas, so a Guest's Mac browser
///                 loads the exact bundle the iPad runs (no version skew).
/// - `WS /sync`  → Guest connections, relayed to the room as envelopes.
/// - `WS /host`  → the loopback channel the Canvas page opens (#28); the
///                 relay shuttles Guest frames through it, loopback-only.
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
        // The host channel is the Canvas page's private door: only loopback
        // peers may upgrade — a LAN client on /host could otherwise puppet
        // every Guest.
        let hostUpgrade = WebSocketHTTPHandler.webSocket(HostChannelHandler(relay: relay))
        await server.appendRoute("GET /host") { request in
            guard Self.isLoopback(request.remoteAddress) else {
                return HTTPResponse(statusCode: .forbidden)
            }
            return try await hostUpgrade.handleRequest(request)
        }

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

    /// True only for loopback peers, judged by the socket's own address —
    /// never by spoofable headers.
    nonisolated static func isLoopback(_ address: HTTPRequest.Address?) -> Bool {
        switch address {
        case let .ip4(ip, port: _):
            return ip.hasPrefix("127.")
        case let .ip6(ip, port: _):
            return ip == "::1" || ip == "0:0:0:0:0:0:0:1" || ip.hasPrefix("::ffff:127.")
        case .unix:
            return true  // Same-process by definition.
        case .none:
            return false
        }
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
/// channel (`/host`). Pure shuttling, no product logic: each Guest event
/// rides to the Canvas as one JSON envelope — `{sid, ev: "open"}` on
/// connect, `{sid, ev: "frame", data}` per frame, `{sid, ev: "close"}` on
/// disconnect — and the Canvas addresses envelopes back: `frame` to deliver
/// a wire frame to that Guest, `close` to drop the Guest's socket. The
/// envelope grammar is mirrored (by hand — Swift can't import it) from the
/// Canvas's canvas/src/session/envelope.ts.
///
/// A Guest connecting before the Canvas has dialed `/host` loses its "open"
/// envelope; its sync client notices the missing pongs, reconnects, and the
/// fresh socket announces itself again — self-healing by design.
actor SessionRelay {
    private var host: AsyncStream<WSMessage>.Continuation?
    private var guests: [String: AsyncStream<WSMessage>.Continuation] = [:]

    // MARK: Host channel (the Canvas page)

    func hostConnected(outbound: AsyncStream<WSMessage>.Continuation) {
        // One host channel: a reconnecting Canvas replaces the old one.
        host?.finish()
        host = outbound
    }

    func hostFrame(_ message: WSMessage) {
        // tldraw sync frames are text; anything else is not an envelope.
        guard case let .text(text) = message,
            let object = try? JSONSerialization.jsonObject(with: Data(text.utf8)),
            let envelope = object as? [String: Any],
            let sid = envelope["sid"] as? String,
            let ev = envelope["ev"] as? String
        else { return }

        switch ev {
        case "frame":
            guard let data = envelope["data"] as? String else { return }
            guests[sid]?.yield(.text(data))
        case "close":
            // The room dropped this Guest (e.g. an incompatible client).
            if let guest = guests.removeValue(forKey: sid) {
                guest.yield(.close(.normalClosure))
                guest.finish()
            }
        default:
            break  // Unknown envelope kinds drop silently, like the Bridge.
        }
    }

    func hostDisconnected() {
        host = nil
    }

    // MARK: Guest sockets (browsers on the LAN)

    func guestConnected(_ id: UUID, outbound: AsyncStream<WSMessage>.Continuation) {
        guests[id.uuidString] = outbound
        sendToHost(["sid": id.uuidString, "ev": "open"])
    }

    func guestFrame(_ id: UUID, _ message: WSMessage) {
        guard case let .text(text) = message else { return }
        sendToHost(["sid": id.uuidString, "ev": "frame", "data": text])
    }

    func guestDisconnected(_ id: UUID) {
        guests.removeValue(forKey: id.uuidString)
        sendToHost(["sid": id.uuidString, "ev": "close"])
    }

    private func sendToHost(_ envelope: [String: Any]) {
        guard let host,
            let data = try? JSONSerialization.data(withJSONObject: envelope),
            let text = String(data: data, encoding: .utf8)
        else { return }
        host.yield(.text(text))
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

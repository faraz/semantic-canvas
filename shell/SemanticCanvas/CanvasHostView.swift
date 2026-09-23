import SwiftUI
import WebKit

struct CanvasHostView: UIViewRepresentable {
    func makeCoordinator() -> BridgeCoordinator { BridgeCoordinator() }

    func makeUIView(context: Context) -> UIView {
        let config = WKWebViewConfiguration()
        // Persistent store: the Board's local persistence (tldraw IndexedDB)
        // must survive relaunch.
        config.websiteDataStore = .default()
        // The Bridge: the Canvas posts versioned messages to the "bridge"
        // script message handler. WKUserContentController retains the handler
        // strongly; the coordinator holds no reference back to the web view
        // (it uses the message's own webView), so there is no cycle.
        config.userContentController.add(context.coordinator, name: "bridge")

        let webView = WKWebView(frame: .zero, configuration: config)
        // The Canvas owns all gestures; the scroll view must never intercept.
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
            if #available(iOS 16.4, *) {
                webView.isInspectable = true
            }
        #endif

        // Lets scene-background teardown report sessionStopped (weak; the
        // server never keeps the web view alive).
        SessionServer.shared.webView = webView

        #if DEBUG
            // Test seam: navigation delegate for the launch-argument
            // auto-start below (simulator probes can't tap the menu).
            webView.navigationDelegate = context.coordinator
        #endif

        let url = Bundle.main.url(forResource: "index", withExtension: "html")!
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())

        // The pen palette host wraps the webview: Apple's PKToolPicker picks
        // the pen, the Canvas renders (#30).
        return PenPaletteHost(webView: webView)
    }

    func updateUIView(_ uiView: UIView, context: Context) {}
}

// The Bridge's Shell→Canvas leg: versioned { v, event } messages delivered
// by evaluating window.__bridgeReceive(...) in the page (the Canvas installs
// that global and drops anything malformed).
@MainActor
enum Bridge {
    static func send(_ message: [String: Any], to webView: WKWebView) {
        guard let data = try? JSONSerialization.data(withJSONObject: message),
            let json = String(data: data, encoding: .utf8)
        else { return }
        webView.evaluateJavaScript(
            "window.__bridgeReceive && window.__bridgeReceive(\(json));",
            completionHandler: nil
        )
    }
}

// Receives Bridge messages from the Canvas. The Shell stays logic-free: the
// behaviors are answering a Shape Snap with the canvas-feedback haptic and
// forwarding Session requests to the SessionServer, reporting the outcome
// back. Unknown or malformed messages are ignored silently.
final class BridgeCoordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
    #if DEBUG
        /// DEBUG-only test seam: `simctl launch <udid> dev.frwd.SemanticCanvas
        /// -SCStartSessionOnLaunch` starts a Session the moment the Canvas
        /// loads, exactly as if the menu action had been tapped — so the
        /// serve/relay loop can be probed from the Mac side without UI
        /// automation. Absent the argument this does nothing.
        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            guard ProcessInfo.processInfo.arguments.contains("-SCStartSessionOnLaunch")
            else { return }
            Task { @MainActor in
                do {
                    let hostname = try await SessionServer.shared.start()
                    Bridge.send(
                        [
                            "v": 1,
                            "event": "sessionStarted",
                            "port": Int(SessionServer.port),
                            "hostname": hostname,
                            "ip": SessionServer.wifiIPv4() ?? NSNull(),
                        ],
                        to: webView
                    )
                } catch {
                    Bridge.send(
                        ["v": 1, "event": "sessionError", "message": error.localizedDescription],
                        to: webView
                    )
                }
            }
        }
    #endif

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
            body["v"] as? Int == 1,
            let event = body["event"] as? String
        else { return }

        switch event {
        case "shapeSnapped":
            // Canvas feedback (the Pencil Pro click) requires iOS 17.5; on
            // older systems the snap simply lands silently.
            if #available(iOS 17.5, *), let webView = message.webView {
                let generator = UICanvasFeedbackGenerator(view: webView)
                // The view center stands in for the snap location in the MVP.
                generator.pathCompleted(
                    at: CGPoint(x: webView.bounds.midX, y: webView.bounds.midY))
            }

        case "startSessionRequested":
            guard let webView = message.webView else { return }
            Task { @MainActor in
                do {
                    let hostname = try await SessionServer.shared.start()
                    Bridge.send(
                        [
                            "v": 1,
                            "event": "sessionStarted",
                            "port": Int(SessionServer.port),
                            "hostname": hostname,
                            "ip": SessionServer.wifiIPv4() ?? NSNull(),
                        ],
                        to: webView
                    )
                } catch {
                    Bridge.send(
                        [
                            "v": 1,
                            "event": "sessionError",
                            "message": error.localizedDescription,
                        ],
                        to: webView
                    )
                }
            }

        case "setPenPaletteVisible":
            guard let visible = body["visible"] as? Bool else { return }
            Task { @MainActor in
                PenPaletteHost.current?.setPaletteVisible(visible)
            }

        case "stopSessionRequested":
            guard let webView = message.webView else { return }
            Task { @MainActor in
                await SessionServer.shared.stop()
                Bridge.send(["v": 1, "event": "sessionStopped"], to: webView)
            }

        default:
            return
        }
    }
}

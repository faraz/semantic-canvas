import SwiftUI
import WebKit

struct CanvasHostView: UIViewRepresentable {
    func makeCoordinator() -> BridgeCoordinator { BridgeCoordinator() }

    func makeUIView(context: Context) -> WKWebView {
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

        let url = Bundle.main.url(forResource: "index", withExtension: "html")!
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
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
final class BridgeCoordinator: NSObject, WKScriptMessageHandler {
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

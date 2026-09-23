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

        #if DEBUG
            // SPIKE (#25): loopback WS echo the Canvas probes on load.
            SpikeLoopbackServer.shared.start()
        #endif

        let url = Bundle.main.url(forResource: "index", withExtension: "html")!
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// Receives Bridge messages from the Canvas. The Shell stays logic-free: the
// only behavior is answering a Shape Snap with the canvas-feedback haptic.
// Unknown or malformed messages are ignored silently.
final class BridgeCoordinator: NSObject, WKScriptMessageHandler {
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any],
            body["v"] as? Int == 1,
            body["event"] as? String == "shapeSnapped"
        else { return }

        // Canvas feedback (the Pencil Pro click) requires iOS 17.5; on older
        // systems the snap simply lands silently.
        if #available(iOS 17.5, *), let webView = message.webView {
            let generator = UICanvasFeedbackGenerator(view: webView)
            // The view center stands in for the snap location in the MVP.
            generator.pathCompleted(at: CGPoint(x: webView.bounds.midX, y: webView.bounds.midY))
        }
    }
}

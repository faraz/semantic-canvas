import SwiftUI
import WebKit

struct CanvasHostView: UIViewRepresentable {
    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        // Persistent store: the Board's local persistence (tldraw IndexedDB)
        // must survive relaunch.
        config.websiteDataStore = .default()

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

        let url = Bundle.main.url(forResource: "index", withExtension: "html")!
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

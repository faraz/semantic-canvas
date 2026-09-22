// PROTOTYPE — pencil-probe. Throwaway shell answering one question:
// does Apple Pencil ink through a WKWebView-hosted tldraw canvas meet the
// whiteboard bar (pressure, palm rejection, latency)?
import SwiftUI

@main
struct PencilProbeApp: App {
    var body: some Scene {
        WindowGroup {
            CanvasWebView()
                .ignoresSafeArea()
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
        }
    }
}

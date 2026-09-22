import SwiftUI

@main
struct SemanticCanvasApp: App {
    var body: some Scene {
        WindowGroup {
            CanvasWebView()
                .ignoresSafeArea()
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
        }
    }
}

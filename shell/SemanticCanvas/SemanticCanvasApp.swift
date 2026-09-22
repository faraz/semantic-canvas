import SwiftUI

@main
struct SemanticCanvasApp: App {
    var body: some Scene {
        WindowGroup {
            CanvasHostView()
                .ignoresSafeArea()
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
        }
    }
}

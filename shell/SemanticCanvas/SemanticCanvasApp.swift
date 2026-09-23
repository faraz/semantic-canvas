import SwiftUI

@main
struct SemanticCanvasApp: App {
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            CanvasHostView()
                .ignoresSafeArea()
                .statusBarHidden(true)
                .persistentSystemOverlays(.hidden)
                .onChange(of: scenePhase) { _, phase in
                    // Listeners die on suspension (Apple DTS guidance), so a
                    // Session never outlives the foreground: tear the server
                    // down when the scene backgrounds.
                    if phase == .background {
                        Task { await SessionServer.shared.stopForBackground() }
                    }
                }
        }
    }
}

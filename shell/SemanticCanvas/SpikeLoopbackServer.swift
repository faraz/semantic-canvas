// SPIKE (#25) — throwaway: proves the loopback WebSocket leg for Local
// Sessions. A DEBUG-only FlyingFox server with one WS echo route; the Canvas
// connects to ws://127.0.0.1:8787/spike and logs the round trip. Replaced by
// the real Session server in the Shell-server ticket (#27).
#if DEBUG
    import FlyingFox

    final class SpikeLoopbackServer {
        static let shared = SpikeLoopbackServer()
        private var task: Task<Void, Never>?

        func start() {
            guard task == nil else { return }
            task = Task {
                let server = HTTPServer(port: 8787)
                await server.appendRoute(
                    "GET /spike",
                    to: .webSocket(SpikeEchoHandler())
                )
                try? await server.run()
            }
        }
    }

    private struct SpikeEchoHandler: WSMessageHandler {
        func makeMessages(for client: AsyncStream<WSMessage>) async throws
            -> AsyncStream<WSMessage>
        {
            AsyncStream { continuation in
                let task = Task {
                    print("[spike #25] WS client connected")
                    for await message in client {
                        if case .text(let text) = message {
                            print("[spike #25] received: \(text) — echoing")
                            continuation.yield(.text("echo:\(text)"))
                        }
                    }
                    print("[spike #25] WS client closed")
                    continuation.finish()
                }
                continuation.onTermination = { _ in task.cancel() }
            }
        }
    }
#endif

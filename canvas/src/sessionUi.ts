// Session-UI store: the hosting state the join panel and the main-menu
// action render, driven purely by the Shell's Bridge session events
// (sessionStarted / sessionStopped / sessionError).
//
// Deliberately NOT the Session lifecycle module (canvas/src/session/, issue
// #26 — room hosting, snapshot migration, window.__session): this store only
// mirrors what the Shell reports so the UI can render. The menu action posts
// Bridge requests and nothing else; #28 wires the Shell's answers into the
// session module proper and merges these seams.
//
// Framework-free; React subscribes via useSyncExternalStore. The store
// self-wires to the Bridge on first subscription, which also installs
// window.__bridgeReceive before the Shell could ever answer a request.

import { onBridgeMessage, type BridgeReceiveMessage } from './bridge'

export type SessionUiState =
  | { hosting: false; error: string | null }
  | { hosting: true; port: number; hostname: string; error: null }

const IDLE: SessionUiState = { hosting: false, error: null }

let state: SessionUiState = IDLE
const listeners = new Set<() => void>()
let wiredToBridge = false

export function getSessionUiState(): SessionUiState {
  return state
}

export function subscribeSessionUi(listener: () => void): () => void {
  if (!wiredToBridge) {
    wiredToBridge = true
    onBridgeMessage(applyBridgeSessionMessage)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// The join URL Guests open; hostname is the bare mDNS name from the Shell.
export function joinUrl(session: { hostname: string; port: number }): string {
  return `http://${session.hostname}.local:${session.port}`
}

// Exported for tests (and as the single reducer entry point).
export function applyBridgeSessionMessage(message: BridgeReceiveMessage): void {
  switch (message.event) {
    case 'sessionStarted':
      state = {
        hosting: true,
        port: message.port,
        hostname: message.hostname,
        error: null,
      }
      break
    case 'sessionStopped':
      state = IDLE
      break
    case 'sessionError':
      state = { hosting: false, error: message.message }
      break
  }
  for (const listener of [...listeners]) listener()
}

// Test-only: restores the initial state between cases.
export function resetSessionUiStateForTest(): void {
  state = IDLE
}

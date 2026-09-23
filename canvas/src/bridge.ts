// The Bridge: the typed, versioned message channel between Canvas and Shell.
//
// Canvas→Shell rides webkit.messageHandlers.bridge.postMessage. Shell→Canvas
// rides evaluateJavaScript into window.__bridgeReceive, a global this module
// installs — the Session state events below are the Bridge's first
// Shell→Canvas messages. Both directions reuse the versioned { v, event }
// scheme; unknown or malformed messages are dropped silently on both sides.

// Canvas→Shell.
export type BridgeMessage =
  | { v: 1; event: 'shapeSnapped' }
  | { v: 1; event: 'startSessionRequested' }
  | { v: 1; event: 'stopSessionRequested' }
  | { v: 1; event: 'setPenPaletteVisible'; visible: boolean }

// Shell→Canvas. Session state as the Shell's server reports it; `hostname`
// is the device's bare mDNS name (no ".local" suffix, no scheme).
export type BridgeReceiveMessage =
  | { v: 1; event: 'sessionStarted'; port: number; hostname: string; ip?: string | null }
  | { v: 1; event: 'sessionStopped' }
  | { v: 1; event: 'sessionError'; message: string }
  | {
      v: 1
      event: 'penToolChanged'
      kind: 'ink'
      inkType: string
      colorHex: string
      width: number
    }
  | { v: 1; event: 'penToolChanged'; kind: 'eraser' | 'lasso' | 'other' }

// The webkit surface the Shell's WKWebView injects; absent in browsers and
// tests, hence optional at every level. __bridgeReceive is the Canvas-owned
// entry point the Shell calls via evaluateJavaScript.
declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        bridge?: { postMessage(message: BridgeMessage): void }
      }
    }
    __bridgeReceive?: (message: unknown) => void
  }
}

// Posts to the Shell; a silent no-op outside it (browser dev, tests).
function post(message: BridgeMessage): void {
  if (typeof window === 'undefined') return
  window.webkit?.messageHandlers?.bridge?.postMessage(message)
}

// Tells the Shell a Shape Snap landed, so it can answer with the haptic.
export function postShapeSnapped(): void {
  post({ v: 1, event: 'shapeSnapped' })
}

// Asks the Shell to start hosting a Session (start the server); the Shell
// answers with sessionStarted or sessionError.
export function postStartSessionRequested(): void {
  post({ v: 1, event: 'startSessionRequested' })
}

// Asks the Shell to stop hosting; the Shell answers with sessionStopped.
export function postStopSessionRequested(): void {
  post({ v: 1, event: 'stopSessionRequested' })
}

// Shows or hides the system pen palette (PKToolPicker) the Shell hosts.
export function postSetPenPaletteVisible(visible: boolean): void {
  post({ v: 1, event: 'setPenPaletteVisible', visible })
}

// ---- Shell→Canvas receive path -----------------------------------------

const receivers = new Set<(message: BridgeReceiveMessage) => void>()

// The Shell sends plain JSON; validate the whole shape before dispatch so a
// version bump or malformed payload degrades to a dropped message.
function isBridgeReceiveMessage(message: unknown): message is BridgeReceiveMessage {
  if (typeof message !== 'object' || message === null) return false
  const m = message as Record<string, unknown>
  if (m.v !== 1) return false
  switch (m.event) {
    case 'sessionStarted':
      return (
        typeof m.port === 'number' &&
        typeof m.hostname === 'string' &&
        (typeof m.ip === 'string' || m.ip === null || m.ip === undefined)
      )
    case 'sessionStopped':
      return true
    case 'sessionError':
      return typeof m.message === 'string'
    case 'penToolChanged':
      if (m.kind === 'ink') {
        return (
          typeof m.inkType === 'string' &&
          typeof m.colorHex === 'string' &&
          typeof m.width === 'number'
        )
      }
      return m.kind === 'eraser' || m.kind === 'lasso' || m.kind === 'other'
    default:
      return false
  }
}

function installReceiveGlobal(): void {
  if (typeof window === 'undefined' || window.__bridgeReceive) return
  window.__bridgeReceive = (message: unknown) => {
    if (!isBridgeReceiveMessage(message)) return
    for (const receiver of [...receivers]) receiver(message)
  }
}

// Subscribes to Shell→Canvas messages; installs window.__bridgeReceive on
// first use. Returns the unsubscriber.
export function onBridgeMessage(
  receiver: (message: BridgeReceiveMessage) => void
): () => void {
  installReceiveGlobal()
  receivers.add(receiver)
  return () => {
    receivers.delete(receiver)
  }
}

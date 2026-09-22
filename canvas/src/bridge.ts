// The Bridge: the typed, versioned message channel between Canvas and Shell.
// Canvas→Shell only in MVP. The designated first future Shell→Canvas message
// is the tldraw license key (see the licensing research); it will reuse this
// versioned { v, event } scheme.

export type BridgeMessage = { v: 1; event: 'shapeSnapped' }

// The webkit surface the Shell's WKWebView injects; absent in browsers and
// tests, hence optional at every level.
declare global {
  interface Window {
    webkit?: {
      messageHandlers?: {
        bridge?: { postMessage(message: BridgeMessage): void }
      }
    }
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

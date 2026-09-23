// Boot-mode decision (#28): one bundle, two roles. Loaded from the app
// bundle (file:// in the Shell's WKWebView) it boots as the Host app; served
// by the Shell's Session server over http:// it boots as a Guest editor.
export type BootMode = 'host' | 'guest'

export function bootMode(url: string): BootMode {
  try {
    return new URL(url).protocol.startsWith('http') ? 'guest' : 'host'
  } catch {
    return 'host'
  }
}

// The sync endpoint for a Guest: the page's own origin, ws(s)-flavored, at
// the Shell's /sync route (useSync appends sessionId/storeId itself).
export function guestSyncUri(pageUrl: string): string {
  const url = new URL(pageUrl)
  const scheme = url.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${scheme}//${url.host}/sync`
}

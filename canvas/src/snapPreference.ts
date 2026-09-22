// The Snap preference: one persisted on/off switch covering both Shape Snap
// and Illustration Snap. Off means Ink stays Ink — no geometric swap, no
// grouping. Framework-free: the snap wirings read it at stroke-completion
// time (so toggling needs no re-wiring), and React subscribes via
// useSyncExternalStore in App.tsx.
//
// localStorage is the source of truth — reads go to storage every time, so
// the value survives relaunch and stays correct across contexts without a
// cache to invalidate. Reads happen once per completed stroke and per
// render; that's cheap.

const STORAGE_KEY = 'semantic-canvas.snap-enabled'

const listeners = new Set<() => void>()

// Covers storage-less contexts (denied localStorage): session-only, still
// defaults to on.
let fallback = true

export function isSnapEnabled(): boolean {
  try {
    // Absent key (fresh install) defaults to on.
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return fallback
  }
}

export function setSnapEnabled(enabled: boolean): void {
  fallback = enabled
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Session-only fallback already updated.
  }
  for (const listener of [...listeners]) listener()
}

export function subscribeSnapEnabled(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

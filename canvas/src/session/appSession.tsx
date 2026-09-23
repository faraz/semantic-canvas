// App-facing Session wiring (#26): one lifecycle singleton, the
// session-backed <Tldraw> (the Host's own editor joining the in-Canvas room
// through the in-process transport), and Board hand-off across the editor
// remount at Session boundaries.
import { useCallback, useSyncExternalStore } from 'react'
import { useSync } from '@tldraw/sync'
import {
  Tldraw,
  inlineBase64AssetStore,
  loadSnapshot,
  type Editor,
  type TLStoreSnapshot,
  type TldrawProps,
} from 'tldraw'
import { createSessionLifecycle, type SessionPhase } from './lifecycle'
import { createInProcessSocket } from './transport'

const lifecycle = createSessionLifecycle()

// The live editor (solo or session mode) — the start boundary snapshots it,
// registered from the App's mount wiring.
let liveEditor: Editor | null = null
// The Session's final Board, waiting for the solo editor to remount.
let pendingRestore: TLStoreSnapshot | null = null

// Called from the App's onMount in both modes. In solo mode this also folds
// a just-stopped Session's Board back into the persistenceKey store.
export function registerSessionEditor(editor: Editor): () => void {
  liveEditor = editor
  if (pendingRestore && lifecycle.getPhase() === 'solo') {
    const snapshot = pendingRestore
    pendingRestore = null
    loadSnapshot(editor.store, snapshot)
  }
  return () => {
    if (liveEditor === editor) liveEditor = null
  }
}

export function startSession(): void {
  if (!liveEditor) throw new Error('Session: no live editor to host from')
  lifecycle.start(liveEditor.store.getStoreSnapshot())
}

export function stopSession(): void {
  pendingRestore = lifecycle.stop()
}

export function useSessionPhase(): SessionPhase {
  return useSyncExternalStore(lifecycle.subscribe, lifecycle.getPhase)
}

// The Host's editor in a live Session: a useSync store joined to the
// in-Canvas room over the in-process pipe. Assets ride inline as base64 for
// MVP (useSync requires an asset store; ink-first Boards make this fine).
export function SessionCanvas(
  props: Pick<TldrawProps, 'assetUrls' | 'components' | 'onMount'>
) {
  const connect = useCallback((query: { sessionId: string }) => {
    const room = lifecycle.getRoom()
    if (!room) throw new Error('Session: no room to join')
    return createInProcessSocket(room, query.sessionId)
  }, [])
  const store = useSync({ connect, assets: inlineBase64AssetStore })
  return <Tldraw store={store} {...props} />
}

// TEMPORARY dev trigger (#26): drive the Session from the Web Inspector
// console. Replaced by #27's main-menu action + Bridge messages.
declare global {
  interface Window {
    __session?: {
      start(): void
      stop(): void
      readonly phase: SessionPhase
    }
  }
}

if (typeof window !== 'undefined') {
  window.__session = {
    start: startSession,
    stop: stopSession,
    get phase() {
      return lifecycle.getPhase()
    },
  }
}

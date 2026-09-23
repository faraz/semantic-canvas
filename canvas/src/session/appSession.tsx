// App-facing Session wiring (#26, merged with the Shell's answers in #28):
// one lifecycle singleton, the session-backed <Tldraw> (the Host's own editor
// joining the in-Canvas room through the in-process transport), Board
// hand-off across the editor remount at Session boundaries, and the Bridge
// seam — the Shell's session events drive the lifecycle and the Guest relay
// hub here, while sessionUi.ts mirrors the same events for rendering.
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
import { onBridgeMessage, postStopSessionRequested } from '../bridge'
import { connectSessionHub, type SessionHub, type SessionHubOptions } from './hub'
import { createSessionLifecycle, type SessionPhase } from './lifecycle'
import { storeSnapshotFromRoomSnapshot } from './migration'
import { createInProcessSocket } from './transport'

const lifecycle = createSessionLifecycle()

// The live editor (solo or session mode) — the start boundary snapshots it,
// registered from the App's mount wiring.
let liveEditor: Editor | null = null
// The Session's final Board, waiting for the solo editor to remount.
let pendingRestore: TLStoreSnapshot | null = null
// Crash recovery (#28) runs once, on the first solo mount of the launch.
let recoveryChecked = false

// Called from the App's onMount in both modes. In solo mode this also folds
// a just-stopped Session's Board back into the persistenceKey store — and,
// on the first mount of a launch, consumes a leftover session shadow: the
// clean stop path clears its shadow below, so one still present means the
// app died mid-Session, and the shadow (kept live-updated while hosting) is
// newer than anything the persisted Board saw.
export function registerSessionEditor(editor: Editor): () => void {
  liveEditor = editor
  if (pendingRestore && lifecycle.getPhase() === 'solo') {
    const snapshot = pendingRestore
    pendingRestore = null
    loadSnapshot(editor.store, snapshot)
    // The Session's Board is home; the recovery shadow has served its term.
    lifecycle.clearShadow()
  } else if (!recoveryChecked && lifecycle.getPhase() === 'solo') {
    const shadow = lifecycle.readShadow()
    if (shadow) {
      loadSnapshot(editor.store, storeSnapshotFromRoomSnapshot(shadow.snapshot))
      lifecycle.clearShadow()
    }
  }
  recoveryChecked = true
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

// ---- The Bridge seam (#28) ----------------------------------------------
//
// The Shell reports its server's fate; those reports drive the lifecycle:
//   sessionStarted → room up (editor remounts onto it) + hub dialed to the
//                    Shell's /host loopback channel for the Guest relay
//   sessionStopped → hub down, room closed, Board folded back to solo
//   sessionError   → nothing to unwind (the server never started)

let hub: SessionHub | null = null

export interface WireSessionOptions {
  // Test seam: how the hub reaches the Shell's /host channel.
  connectHub?: (opts: SessionHubOptions) => SessionHub
}

export function wireSessionToBridge(opts: WireSessionOptions = {}): () => void {
  const connect = opts.connectHub ?? connectSessionHub
  return onBridgeMessage((message) => {
    switch (message.event) {
      case 'sessionStarted': {
        // A re-report while already hosting (the Shell's start is
        // idempotent) changes nothing.
        if (lifecycle.getPhase() !== 'solo') return
        try {
          startSession()
        } catch {
          // The room could not start; hosting an empty server would strand
          // Guests, so ask the Shell to stand down. Its sessionStopped
          // answer resets the UI store too.
          postStopSessionRequested()
          return
        }
        const room = lifecycle.getRoom()
        if (room) {
          hub = connect({ room, url: `ws://127.0.0.1:${message.port}/host` })
        }
        return
      }
      case 'sessionStopped': {
        hub?.dispose()
        hub = null
        if (lifecycle.getPhase() === 'hosting') stopSession()
        return
      }
      case 'sessionError':
        return
    }
  })
}

// The Host's editor in a live Session: a useSync store joined to the
// in-Canvas room over the in-process pipe. Assets ride inline as base64 for
// MVP (useSync requires an asset store; ink-first Boards make this fine).
export function SessionCanvas(
  props: Pick<TldrawProps, 'assetUrls' | 'components' | 'shapeUtils' | 'onMount'>
) {
  const connect = useCallback((query: { sessionId: string }) => {
    const room = lifecycle.getRoom()
    if (!room) throw new Error('Session: no room to join')
    return createInProcessSocket(room, query.sessionId)
  }, [])
  const store = useSync({ connect, assets: inlineBase64AssetStore })
  return <Tldraw store={store} {...props} />
}

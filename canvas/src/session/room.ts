// Session room hosting (#26). Wraps sync-core's TLSocketRoom — the
// authoritative sync server, running inside the Canvas page — behind a small
// editor-free surface: create with an initial snapshot, attach/detach
// duck-typed sockets (WebSocketMinimal), read the snapshot back, close.
//
// Sockets are duck-typed; the in-process transport (transport.ts) and #27's
// loopback relay shims both attach through here. Shims without
// addEventListener deliver frames via handleMessage. The room answers the
// client's 5s pings itself (TLSyncRoom responds to 'ping' with 'pong').
import { InMemorySyncStorage, TLSocketRoom } from '@tldraw/sync-core'
import type { RoomSnapshot, WebSocketMinimal } from '@tldraw/sync-core'
import { createTLSchema, type TLRecord, type TLStoreSnapshot } from 'tldraw'
import { roomSnapshotFromStoreSnapshot } from './migration'

export interface SessionRoomOptions {
  // Seed state: the solo Board's snapshot (or a recovered RoomSnapshot).
  initialSnapshot?: TLStoreSnapshot | RoomSnapshot
  // Microtask-coalesced change notification from the room's storage —
  // the shadow-snapshot write-through hook. Throttle further if needed.
  onChange?: () => void
}

export interface SessionRoom {
  attach(sessionId: string, socket: WebSocketMinimal, opts?: { isReadonly?: boolean }): void
  detach(sessionId: string): void
  // For sockets that cannot carry addEventListener (in-process shims,
  // relay shims): deliver a raw client→server frame.
  handleMessage(sessionId: string, data: string): void
  getSnapshot(): RoomSnapshot
  getNumActiveSessions(): number
  isClosed(): boolean
  close(): void
}

function asRoomSnapshot(snapshot: TLStoreSnapshot | RoomSnapshot): RoomSnapshot {
  return 'documents' in snapshot ? snapshot : roomSnapshotFromStoreSnapshot(snapshot)
}

export function createSessionRoom(opts: SessionRoomOptions = {}): SessionRoom {
  // The stock schema — the App registers no custom shape or binding utils,
  // so this matches the default <Tldraw> editor's schema exactly.
  const schema = createTLSchema()
  const storage = new InMemorySyncStorage<TLRecord>({
    snapshot: opts.initialSnapshot ? asRoomSnapshot(opts.initialSnapshot) : undefined,
    onChange: opts.onChange,
  })
  const room = new TLSocketRoom<TLRecord, void>({ schema, storage })
  let closed = false

  return {
    attach(sessionId, socket, attachOpts) {
      if (closed) throw new Error('Session room is closed')
      room.handleSocketConnect({
        sessionId,
        socket,
        isReadonly: attachOpts?.isReadonly ?? false,
      })
    },
    detach(sessionId) {
      if (closed) return
      room.handleSocketClose(sessionId)
    },
    handleMessage(sessionId, data) {
      if (closed) return
      room.handleSocketMessage(sessionId, data)
    },
    getSnapshot() {
      return storage.getSnapshot()
    },
    getNumActiveSessions() {
      return room.getNumActiveSessions()
    },
    isClosed() {
      return closed
    },
    close() {
      if (closed) return
      closed = true
      room.close()
    },
  }
}

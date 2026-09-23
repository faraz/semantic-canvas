// Board ↔ Session snapshot migration (#26). Converts between tldraw's
// TLStoreSnapshot (the solo Board, via editor.store.getStoreSnapshot()) and
// sync-core's RoomSnapshot (the Session room's persisted form). Pure data
// mapping — the sync server migrates records against its schema on load, so
// no record surgery happens here.
import type { RoomSnapshot } from '@tldraw/sync-core'
import { createTLSchema, type TLRecord, type TLStoreSnapshot } from 'tldraw'

// Solo Board → room initial snapshot. getStoreSnapshot() defaults to the
// 'document' scope, so session/presence records never enter the room.
export function roomSnapshotFromStoreSnapshot(snapshot: TLStoreSnapshot): RoomSnapshot {
  return {
    clock: 0,
    documentClock: 0,
    documents: Object.values(snapshot.store).map((state) => ({
      state,
      lastChangedClock: 0,
    })),
    schema: snapshot.schema,
    tombstones: {},
  }
}

// Room state → a snapshot loadSnapshot() accepts, for folding a Session's
// final state back into the persistenceKey-backed solo store. Room snapshots
// taken from storage carry their schema; the default schema is the fallback
// (we host with the stock schema — see room.ts).
export function storeSnapshotFromRoomSnapshot(snapshot: RoomSnapshot): TLStoreSnapshot {
  const store: Record<string, TLRecord> = {}
  for (const { state } of snapshot.documents) {
    store[state.id] = state as TLRecord
  }
  return {
    store: store as TLStoreSnapshot['store'],
    schema: snapshot.schema ?? createTLSchema().serialize(),
  }
}

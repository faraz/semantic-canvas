// Session lifecycle (#26): solo → starting → hosting → stopping → solo.
// Pure state machine plus a controller that runs the Board migration at each
// boundary. Editor-free: the App hands in the solo Board's snapshot on start
// and loads the returned snapshot back after stop (the editor remount at
// Session boundaries is accepted per spec #24).
//
// Recovery: a shadow snapshot is written before each transition — before the
// room is created on start, before it is closed on stop — so a crash mid-
// Session can replay the last known Board state.
import type { RoomSnapshot } from '@tldraw/sync-core'
import type { TLStoreSnapshot } from 'tldraw'
import { roomSnapshotFromStoreSnapshot, storeSnapshotFromRoomSnapshot } from './migration'
import { createSessionRoom, type SessionRoom } from './room'

export type SessionPhase = 'solo' | 'starting' | 'hosting' | 'stopping'

export type SessionTransition = 'start' | 'room-ready' | 'stop' | 'room-closed'

const TRANSITIONS: Record<SessionPhase, Partial<Record<SessionTransition, SessionPhase>>> = {
  solo: { start: 'starting' },
  starting: { 'room-ready': 'hosting' },
  hosting: { stop: 'stopping' },
  stopping: { 'room-closed': 'solo' },
}

// The pure machine: the next phase, or null when the transition is invalid.
export function nextPhase(phase: SessionPhase, transition: SessionTransition): SessionPhase | null {
  return TRANSITIONS[phase][transition] ?? null
}

export interface SessionShadow {
  boundary: 'start' | 'stop'
  writtenAt: number
  snapshot: RoomSnapshot
}

export interface SessionShadowStore {
  write(shadow: SessionShadow): void
  read(): SessionShadow | null
  clear(): void
}

export const SESSION_SHADOW_KEY = 'semantic-canvas-session-shadow'

export function localStorageShadowStore(
  key = SESSION_SHADOW_KEY,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = localStorage
): SessionShadowStore {
  return {
    write(shadow) {
      try {
        storage.setItem(key, JSON.stringify(shadow))
      } catch {
        // A full/blocked localStorage must never veto a Session transition;
        // the shadow is a recovery aid, not the source of truth.
      }
    },
    read() {
      try {
        const raw = storage.getItem(key)
        return raw ? (JSON.parse(raw) as SessionShadow) : null
      } catch {
        return null
      }
    },
    clear() {
      try {
        storage.removeItem(key)
      } catch {
        // ignore
      }
    },
  }
}

export interface SessionLifecycleOptions {
  createRoom?(initialSnapshot: RoomSnapshot): SessionRoom
  shadow?: SessionShadowStore
  now?(): number
}

export interface SessionLifecycle {
  getPhase(): SessionPhase
  getRoom(): SessionRoom | null
  subscribe(cb: (phase: SessionPhase) => void): () => void
  // solo → starting → hosting. Seeds the room with the solo Board and
  // returns it. Throws if not solo.
  start(soloSnapshot: TLStoreSnapshot): SessionRoom
  // hosting → stopping → solo. Closes the room and returns its final state
  // for loading back into the solo store. Throws if not hosting.
  stop(): TLStoreSnapshot
  readShadow(): SessionShadow | null
  clearShadow(): void
}

export function createSessionLifecycle(opts: SessionLifecycleOptions = {}): SessionLifecycle {
  const makeRoom =
    opts.createRoom ?? ((initialSnapshot: RoomSnapshot) => createSessionRoom({ initialSnapshot }))
  const shadow = opts.shadow ?? localStorageShadowStore()
  const now = opts.now ?? Date.now

  let phase: SessionPhase = 'solo'
  let room: SessionRoom | null = null
  const listeners = new Set<(phase: SessionPhase) => void>()

  const setPhase = (next: SessionPhase) => {
    phase = next
    for (const cb of [...listeners]) cb(phase)
  }

  const go = (transition: SessionTransition) => {
    const next = nextPhase(phase, transition)
    if (next === null) {
      throw new Error(`Session: cannot '${transition}' while '${phase}'`)
    }
    setPhase(next)
  }

  return {
    getPhase: () => phase,
    getRoom: () => room,
    subscribe(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    start(soloSnapshot) {
      go('start')
      try {
        const initial = roomSnapshotFromStoreSnapshot(soloSnapshot)
        shadow.write({ boundary: 'start', writtenAt: now(), snapshot: initial })
        room = makeRoom(initial)
        go('room-ready')
        return room
      } catch (err) {
        // A failed start must not strand the app mid-transition.
        room?.close()
        room = null
        setPhase('solo')
        throw err
      }
    },
    stop() {
      go('stop')
      try {
        const activeRoom = room
        if (!activeRoom) throw new Error('Session: hosting without a room')
        const final = activeRoom.getSnapshot()
        shadow.write({ boundary: 'stop', writtenAt: now(), snapshot: final })
        activeRoom.close()
        room = null
        go('room-closed')
        return storeSnapshotFromRoomSnapshot(final)
      } catch (err) {
        // Fall back to solo rather than stranding the app mid-stop; the
        // shadow (written before the failure point, or at start) still
        // carries a recoverable Board.
        room?.close()
        room = null
        setPhase('solo')
        throw err
      }
    },
    readShadow: () => shadow.read(),
    clearShadow: () => shadow.clear(),
  }
}

// Session lifecycle (#26): the pure phase machine and the controller's
// migration choreography — shadow written before each boundary, room seeded
// from the solo Board, Board returned intact on stop. Room and shadow are
// faked here; the real-room migration round-trip lives in migration.test.ts.
import { describe, expect, it } from 'vitest'
import type { RoomSnapshot } from '@tldraw/sync-core'
import { createTLSchema, DocumentRecordType, TLDOCUMENT_ID } from '@tldraw/tlschema'
import type { TLStoreSnapshot } from 'tldraw'
import {
  createSessionLifecycle,
  localStorageShadowStore,
  nextPhase,
  type SessionPhase,
  type SessionShadow,
  type SessionShadowStore,
  type SessionTransition,
} from './lifecycle'
import type { SessionRoom } from './room'

const soloSnapshot = (): TLStoreSnapshot => {
  const doc = DocumentRecordType.create({ id: TLDOCUMENT_ID, name: 'the Board' })
  return {
    schema: createTLSchema().serialize(),
    store: { [TLDOCUMENT_ID]: doc },
  } as TLStoreSnapshot
}

function makeFakeRoom(initial: RoomSnapshot, log: string[]): SessionRoom {
  let closed = false
  return {
    attach: () => {},
    detach: () => {},
    handleMessage: () => {},
    // Pretend the Session advanced the document.
    getSnapshot: () => ({ ...initial, documentClock: 99 }),
    getNumActiveSessions: () => 0,
    isClosed: () => closed,
    close: () => {
      log.push('room:close')
      closed = true
    },
  }
}

function makeFakeShadow(log: string[]): SessionShadowStore & { entries: SessionShadow[] } {
  const entries: SessionShadow[] = []
  return {
    entries,
    write(shadow) {
      log.push(`shadow:${shadow.boundary}`)
      entries.push(shadow)
    },
    read: () => entries[entries.length - 1] ?? null,
    clear: () => {
      entries.length = 0
    },
  }
}

function makeLifecycle() {
  const log: string[] = []
  const shadow = makeFakeShadow(log)
  const seeds: RoomSnapshot[] = []
  const lifecycle = createSessionLifecycle({
    shadow,
    now: () => 1234,
    createRoom: (initialSnapshot) => {
      log.push('room:create')
      seeds.push(initialSnapshot)
      return makeFakeRoom(initialSnapshot, log)
    },
  })
  return { lifecycle, log, shadow, seeds }
}

describe('nextPhase (pure machine)', () => {
  it('walks solo → starting → hosting → stopping → solo', () => {
    expect(nextPhase('solo', 'start')).toBe('starting')
    expect(nextPhase('starting', 'room-ready')).toBe('hosting')
    expect(nextPhase('hosting', 'stop')).toBe('stopping')
    expect(nextPhase('stopping', 'room-closed')).toBe('solo')
  })

  it('rejects every transition not on the cycle', () => {
    const phases: SessionPhase[] = ['solo', 'starting', 'hosting', 'stopping']
    const transitions: SessionTransition[] = ['start', 'room-ready', 'stop', 'room-closed']
    const valid = new Set(['solo:start', 'starting:room-ready', 'hosting:stop', 'stopping:room-closed'])
    for (const phase of phases) {
      for (const transition of transitions) {
        if (valid.has(`${phase}:${transition}`)) continue
        expect(nextPhase(phase, transition)).toBeNull()
      }
    }
  })
})

describe('session lifecycle controller', () => {
  it('start runs solo → starting → hosting and seeds the room with the Board', () => {
    const { lifecycle, seeds } = makeLifecycle()
    const phases: SessionPhase[] = []
    lifecycle.subscribe((phase) => phases.push(phase))

    const room = lifecycle.start(soloSnapshot())

    expect(phases).toEqual(['starting', 'hosting'])
    expect(lifecycle.getPhase()).toBe('hosting')
    expect(lifecycle.getRoom()).toBe(room)
    expect(seeds).toHaveLength(1)
    expect(seeds[0].documents.map((d) => d.state.id)).toEqual([TLDOCUMENT_ID])
    expect(seeds[0].schema).toBeDefined()
  })

  it('writes the shadow before creating the room', () => {
    const { lifecycle, log, shadow } = makeLifecycle()
    lifecycle.start(soloSnapshot())
    expect(log).toEqual(['shadow:start', 'room:create'])
    expect(shadow.entries[0]).toMatchObject({ boundary: 'start', writtenAt: 1234 })
  })

  it('stop runs hosting → stopping → solo and returns the room state as a Board snapshot', () => {
    const { lifecycle } = makeLifecycle()
    lifecycle.start(soloSnapshot())
    const phases: SessionPhase[] = []
    lifecycle.subscribe((phase) => phases.push(phase))

    const restored = lifecycle.stop()

    expect(phases).toEqual(['stopping', 'solo'])
    expect(lifecycle.getPhase()).toBe('solo')
    expect(lifecycle.getRoom()).toBeNull()
    expect(restored.store[TLDOCUMENT_ID]).toMatchObject({ name: 'the Board' })
    expect(restored.schema).toBeDefined()
  })

  it('writes the shadow (with the room state) before closing the room', () => {
    const { lifecycle, log, shadow } = makeLifecycle()
    lifecycle.start(soloSnapshot())
    lifecycle.stop()
    expect(log).toEqual(['shadow:start', 'room:create', 'shadow:stop', 'room:close'])
    expect(shadow.entries[1]).toMatchObject({ boundary: 'stop' })
    expect(shadow.entries[1].snapshot.documentClock).toBe(99)
  })

  it('rejects start while hosting and stop while solo', () => {
    const { lifecycle } = makeLifecycle()
    expect(() => lifecycle.stop()).toThrow(/cannot 'stop' while 'solo'/)
    lifecycle.start(soloSnapshot())
    expect(() => lifecycle.start(soloSnapshot())).toThrow(/cannot 'start' while 'hosting'/)
    expect(lifecycle.getPhase()).toBe('hosting')
  })

  it('falls back to solo when room creation fails', () => {
    const log: string[] = []
    const lifecycle = createSessionLifecycle({
      shadow: makeFakeShadow(log),
      createRoom: () => {
        throw new Error('no room today')
      },
    })
    expect(() => lifecycle.start(soloSnapshot())).toThrow('no room today')
    expect(lifecycle.getPhase()).toBe('solo')
    expect(lifecycle.getRoom()).toBeNull()
    // The shadow was still written first — the Board stays recoverable.
    expect(log).toEqual(['shadow:start'])
  })
})

describe('localStorageShadowStore', () => {
  const makeStorage = () => {
    const map = new Map<string, string>()
    return {
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => void map.set(key, value),
      removeItem: (key: string) => void map.delete(key),
    }
  }

  it('round-trips a shadow through storage', () => {
    const store = localStorageShadowStore('shadow-test', makeStorage())
    expect(store.read()).toBeNull()
    const shadow: SessionShadow = {
      boundary: 'start',
      writtenAt: 42,
      snapshot: { documents: [] },
    }
    store.write(shadow)
    expect(store.read()).toEqual(shadow)
    store.clear()
    expect(store.read()).toBeNull()
  })

  it('never lets a storage failure escape', () => {
    const store = localStorageShadowStore('shadow-test', {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('full')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() =>
      store.write({ boundary: 'stop', writtenAt: 0, snapshot: { documents: [] } })
    ).not.toThrow()
    expect(store.read()).toBeNull()
    expect(() => store.clear()).not.toThrow()
  })
})

// @vitest-environment jsdom
// The Session room/transport loop, entirely in-process — never network.
// First suite (spike #25): the raw wire protocol over duck-typed fake
// sockets. Second suite (#26): the full client loop — real TLSyncClient
// instances with real TLStores joined to a Session room through the
// in-process transport the Host's own editor uses.
import '../tldrawTestShims'
import { describe, expect, it } from 'vitest'
import { TLSocketRoom, TLSyncClient } from '@tldraw/sync-core'
import { createTLSchema, DocumentRecordType, TLDOCUMENT_ID } from '@tldraw/tlschema'
import {
  atom,
  createShapeId,
  createTLStore,
  createUserId,
  defaultBindingUtils,
  defaultShapeUtils,
  InstancePresenceRecordType,
  type TLInstancePresence,
  type TLRecord,
  type TLStore,
} from 'tldraw'
import { makeTestEditor } from '../tldrawTestEditor'
import { createSessionRoom, type SessionRoom } from './room'
import { createInProcessSocket } from './transport'

const PROTOCOL_VERSION = 8

class FakeSocket {
  readyState = 1 // OPEN
  sent: any[] = []
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.readyState = 3
  }
  lastOfType(type: string) {
    return [...this.sent].reverse().find((m) => m.type === type)
  }
  // Server→client 'data' events wrap patches/push_results in {type:'data', data:[...]}
  dataEvents() {
    return this.sent.filter((m) => m.type === 'data').flatMap((m) => m.data)
  }
}

function connectSession(room: TLSocketRoom<any, void>, sessionId: string) {
  const socket = new FakeSocket()
  room.handleSocketConnect({ sessionId, socket })
  room.handleSocketMessage(
    sessionId,
    JSON.stringify({
      type: 'connect',
      connectRequestId: `req-${sessionId}`,
      lastServerClock: 0,
      protocolVersion: PROTOCOL_VERSION,
      schema: createTLSchema().serialize(),
    })
  )
  return socket
}

describe('TLSocketRoom over fake sockets (spike #25)', () => {
  it('completes the connect handshake for two sessions', () => {
    const room = new TLSocketRoom({})
    const a = connectSession(room, 'session-a')
    const b = connectSession(room, 'session-b')

    for (const socket of [a, b]) {
      const connect = socket.lastOfType('connect')
      expect(connect).toBeDefined()
      expect(connect.protocolVersion).toBe(PROTOCOL_VERSION)
      expect(['wipe_all', 'wipe_presence']).toContain(connect.hydrationType)
    }
    expect(room.getSessions()).toHaveLength(2)
    room.close()
  })

  it('relays a document push from one session to the other', async () => {
    const room = new TLSocketRoom({})
    const a = connectSession(room, 'session-a')
    const b = connectSession(room, 'session-b')

    const renamed = {
      ...DocumentRecordType.create({ id: TLDOCUMENT_ID }),
      name: 'spiked from a fake socket',
    }
    room.handleSocketMessage(
      'session-a',
      JSON.stringify({
        type: 'push',
        clientClock: 1,
        diff: { [TLDOCUMENT_ID]: ['put', renamed] },
      })
    )

    // Outgoing data events are debounced (~1 frame); wait for the flush.
    await new Promise((resolve) => setTimeout(resolve, 50))

    const pushResult = a.dataEvents().find((m) => m.type === 'push_result')
    expect(pushResult).toBeDefined()
    // 'commit' or a rebase diff both mean the server applied the change;
    // 'discard' is the only failure.
    expect(pushResult.action).not.toBe('discard')

    const patch = b.dataEvents().find((m) => m.type === 'patch')
    expect(patch).toBeDefined()
    expect(JSON.stringify(patch.diff)).toContain('spiked from a fake socket')

    expect(room.getRecord(TLDOCUMENT_ID)).toMatchObject({
      name: 'spiked from a fake socket',
    })
    room.close()
  })
})

// ---------------------------------------------------------------------------
// Full client loop (#26): two real sync clients + one room, in-process.

async function until(cond: () => boolean, what: string, timeout = 4000) {
  const deadline = Date.now() + timeout
  while (!cond()) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function joinRoom(room: SessionRoom, sessionId: string, store: TLStore) {
  const socket = createInProcessSocket(room, sessionId)
  const presence = atom<TLInstancePresence | null>(`presence:${sessionId}`, null)
  let loaded = false
  const client = new TLSyncClient<TLRecord, TLStore>({
    store,
    socket,
    presence,
    // Without an explicit mode the client skips presence pushes entirely.
    presenceMode: atom('presence mode', 'full'),
    onLoad: () => {
      loaded = true
    },
    onSyncError: (reason) => {
      throw new Error(`sync error for ${sessionId}: ${reason}`)
    },
  })
  return { socket, presence, client, isLoaded: () => loaded }
}

describe('full client loop over the in-process transport (#26)', () => {
  function setup() {
    // The Host: a headless editor whose Board seeds the room — exactly the
    // start-of-Session migration.
    const host = makeTestEditor()
    const room = createSessionRoom({ initialSnapshot: host.store.getStoreSnapshot() })
    const hostClient = joinRoom(room, 'host', host.store)
    // A Guest: a fresh store hydrated entirely by the room.
    const guestStore = createTLStore({
      shapeUtils: defaultShapeUtils,
      bindingUtils: defaultBindingUtils,
    })
    const guestClient = joinRoom(room, 'guest', guestStore)
    const teardown = () => {
      hostClient.client.close()
      guestClient.client.close()
      room.close()
      host.dispose()
    }
    return { host, room, hostClient, guestStore, guestClient, teardown }
  }

  it('syncs shapes both ways between two clients', async () => {
    const { host, hostClient, guestStore, guestClient, teardown } = setup()
    try {
      await until(() => hostClient.isLoaded() && guestClient.isLoaded(), 'both clients to load')

      // Host → Guest: a shape drawn on the iPad appears in the guest store.
      const boxId = createShapeId('sync-box')
      host.createShapes([{ id: boxId, type: 'geo', x: 11, y: 22, props: { w: 100, h: 80 } }])
      await until(() => guestStore.get(boxId) !== undefined, 'the shape to reach the guest')
      expect(guestStore.get(boxId)).toMatchObject({ typeName: 'shape', x: 11, y: 22 })

      // Guest → Host: a guest edit lands in the host editor's store.
      const doc = guestStore.get(TLDOCUMENT_ID)!
      guestStore.put([{ ...doc, name: 'renamed by the guest' }])
      await until(
        () => host.store.get(TLDOCUMENT_ID)?.name === 'renamed by the guest',
        'the rename to reach the host'
      )
    } finally {
      teardown()
    }
  })

  it('relays presence between clients but keeps it out of the document', async () => {
    const { host, room, hostClient, guestStore, guestClient, teardown } = setup()
    try {
      await until(() => hostClient.isLoaded() && guestClient.isLoaded(), 'both clients to load')

      hostClient.presence.set(
        InstancePresenceRecordType.create({
          id: InstancePresenceRecordType.createId('host'),
          currentPageId: host.getCurrentPageId(),
          userId: createUserId('host'),
          userName: 'The Host',
        })
      )

      const guestSeesHost = () =>
        guestStore
          .allRecords()
          .some((r) => r.typeName === 'instance_presence' && r.userName === 'The Host')
      await until(guestSeesHost, "the host's presence to reach the guest")

      // Presence is ephemeral: never part of the room's document snapshot.
      const documentTypes = room.getSnapshot().documents.map((d) => d.state.typeName)
      expect(documentTypes).not.toContain('instance_presence')
    } finally {
      teardown()
    }
  })

  it('catches a reconnecting client up on changes it missed', async () => {
    const { host, room, hostClient, guestStore, guestClient, teardown } = setup()
    try {
      await until(() => hostClient.isLoaded() && guestClient.isLoaded(), 'both clients to load')

      // The room drops the guest (as if its relay socket died)...
      room.detach('guest')

      // ...while the host keeps drawing.
      const missedId = createShapeId('drawn-while-away')
      host.createShapes([{ id: missedId, type: 'geo', x: 77, y: 88, props: { w: 60, h: 60 } }])
      await until(
        () => room.getSnapshot().documents.some((d) => d.state.id === missedId),
        'the room to commit the missed shape'
      )

      // Reconnect: the client re-handshakes with its lastServerClock and
      // receives the changes it missed.
      guestClient.socket.restart()
      await until(() => guestStore.get(missedId) !== undefined, 'the guest to catch up')
      expect(guestStore.get(missedId)).toMatchObject({ x: 77, y: 88 })
    } finally {
      teardown()
    }
  })
})

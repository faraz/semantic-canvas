// Session spike (#25): prove tldraw's sync room runs in our environment with
// duck-typed fake sockets — no network, no Node APIs. The full client loop
// (real TLSyncClient over the connect adapter) arrives with the in-Canvas
// Room ticket; this drives the raw wire protocol through a handshake and a
// document push between two fake sessions.
import { describe, expect, it } from 'vitest'
import { TLSocketRoom } from '@tldraw/sync-core'
import { createTLSchema, DocumentRecordType, TLDOCUMENT_ID } from '@tldraw/tlschema'

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

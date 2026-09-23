// @vitest-environment jsdom
// The host hub (#28): Guest envelopes shuttled into a REAL Session room and
// the room's replies enveloped back — the same fake-socket discipline as
// roomLoop.test.ts, one layer further out.
import '../tldrawTestShims'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTLSchema } from '@tldraw/tlschema'
import { decodeEnvelope, encodeEnvelope, type RelayEnvelope } from './envelope'
import { connectSessionHub, createGuestRelay, type HubSocketLike } from './hub'
import { createSessionRoom, type SessionRoom } from './room'

const PROTOCOL_VERSION = 8

const connectFrame = (sid: string) =>
  JSON.stringify({
    type: 'connect',
    connectRequestId: `req-${sid}`,
    lastServerClock: 0,
    protocolVersion: PROTOCOL_VERSION,
    schema: createTLSchema().serialize(),
  })

async function flush() {
  // The room replies synchronously for handshakes but debounces data events.
  await new Promise((resolve) => setTimeout(resolve, 50))
}

function makeHarness() {
  const room = createSessionRoom()
  const sent: RelayEnvelope[] = []
  const relay = createGuestRelay(room, (data) => {
    const envelope = decodeEnvelope(data)
    if (!envelope) throw new Error(`relay sent a malformed envelope: ${data}`)
    sent.push(envelope)
  })
  const framesFor = (sid: string) =>
    sent
      .filter((e): e is Extract<RelayEnvelope, { ev: 'frame' }> => e.ev === 'frame' && e.sid === sid)
      .map((e) => JSON.parse(e.data))
  return { room, relay, sent, framesFor }
}

describe('createGuestRelay against a real room', () => {
  it('attaches a Guest on open and detaches it on close', async () => {
    const { room, relay, sent } = makeHarness()
    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'open' }))
    expect(room.getNumActiveSessions()).toBe(1)
    expect(relay.guestCount()).toBe(1)

    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'close' }))
    // The room keeps the session in a removal grace period, so the count
    // stays; what must stop is the relay's shuttling for that sid.
    expect(relay.guestCount()).toBe(0)
    const frames = sent.length
    relay.handleEnvelope(
      encodeEnvelope({ sid: 'g1', ev: 'frame', data: JSON.stringify({ type: 'ping' }) })
    )
    await flush()
    expect(sent).toHaveLength(frames)
    room.close()
  })

  it('completes the sync connect handshake through envelopes', async () => {
    const { room, relay, framesFor } = makeHarness()
    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'open' }))
    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'frame', data: connectFrame('g1') }))
    await flush()

    const connect = framesFor('g1').find((m) => m.type === 'connect')
    expect(connect).toBeDefined()
    expect(connect.connectRequestId).toBe('req-g1')
    expect(connect.protocolVersion).toBe(PROTOCOL_VERSION)
    room.close()
  })

  it('answers a connected Guest ping with a pong addressed to that sid only', async () => {
    const { room, relay, framesFor } = makeHarness()
    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'open' }))
    relay.handleEnvelope(encodeEnvelope({ sid: 'g2', ev: 'open' }))
    // Pings only earn pongs after the sync handshake.
    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'frame', data: connectFrame('g1') }))
    relay.handleEnvelope(
      encodeEnvelope({ sid: 'g1', ev: 'frame', data: JSON.stringify({ type: 'ping' }) })
    )
    await flush()

    expect(framesFor('g1').some((m) => m.type === 'pong')).toBe(true)
    expect(framesFor('g2')).toHaveLength(0)
    room.close()
  })

  it('relays a close envelope when the room rejects a Guest', async () => {
    const { room, relay, sent } = makeHarness()
    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'open' }))
    // An incompatible client: the room answers with an error and closes the
    // socket — which must ride back to the Shell as a close envelope.
    relay.handleEnvelope(
      encodeEnvelope({
        sid: 'g1',
        ev: 'frame',
        data: JSON.stringify({
          type: 'connect',
          connectRequestId: 'req-g1',
          lastServerClock: 0,
          protocolVersion: 1,
          schema: createTLSchema().serialize(),
        }),
      })
    )
    await flush()

    expect(sent.some((e) => e.ev === 'close' && e.sid === 'g1')).toBe(true)
    expect(relay.guestCount()).toBe(0)
    room.close()
  })

  it('drops frames for unknown sids and every malformed envelope', () => {
    const { room, relay, sent } = makeHarness()
    relay.handleEnvelope(
      encodeEnvelope({ sid: 'ghost', ev: 'frame', data: JSON.stringify({ type: 'ping' }) })
    )
    relay.handleEnvelope(encodeEnvelope({ sid: 'ghost', ev: 'close' }))
    relay.handleEnvelope('not json')
    relay.handleEnvelope('{"sid":"s","ev":"teleport"}')
    relay.handleEnvelope(new ArrayBuffer(4))
    relay.handleEnvelope(undefined)

    expect(room.getNumActiveSessions()).toBe(0)
    expect(sent).toHaveLength(0)
    room.close()
  })

  it('replaces a reused sid with the fresh connection', () => {
    const { room, relay } = makeHarness()
    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'open' }))
    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'open' }))
    expect(relay.guestCount()).toBe(1)
    room.close()
  })

  it('ignores opens after the room closed', () => {
    const { room, relay } = makeHarness()
    room.close()
    relay.handleEnvelope(encodeEnvelope({ sid: 'late', ev: 'open' }))
    expect(relay.guestCount()).toBe(0)
  })

  it('dispose drops every Guest, and their frames with them', async () => {
    const { room, relay, sent } = makeHarness()
    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'open' }))
    relay.handleEnvelope(encodeEnvelope({ sid: 'g2', ev: 'open' }))
    expect(room.getNumActiveSessions()).toBe(2)

    relay.dispose()
    expect(relay.guestCount()).toBe(0)
    const frames = sent.length
    relay.handleEnvelope(encodeEnvelope({ sid: 'g1', ev: 'frame', data: connectFrame('g1') }))
    await flush()
    expect(sent).toHaveLength(frames)
    room.close()
  })
})

// ---------------------------------------------------------------------------
// The socket wrapper: dialing, routing, redial on unexpected drop.

class FakeHubSocket implements HubSocketLike {
  readyState = 1 // OPEN immediately; the hub tolerates CONNECTING sends too.
  sent: string[] = []
  closed = false
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.closed = true
  }
  // Test controls.
  receive(envelope: RelayEnvelope) {
    this.onmessage?.({ data: encodeEnvelope(envelope) })
  }
  dropFromServer() {
    this.onclose?.()
  }
}

describe('connectSessionHub', () => {
  let room: SessionRoom

  beforeEach(() => {
    vi.useFakeTimers()
    room = createSessionRoom()
  })
  afterEach(() => {
    room.close()
    vi.useRealTimers()
  })

  it('dials the given url and shuttles envelopes to the room and back', () => {
    const sockets: FakeHubSocket[] = []
    const urls: string[] = []
    const hub = connectSessionHub({
      room,
      url: 'ws://127.0.0.1:8787/host',
      makeSocket: (url) => {
        urls.push(url)
        const socket = new FakeHubSocket()
        sockets.push(socket)
        return socket
      },
    })

    expect(urls).toEqual(['ws://127.0.0.1:8787/host'])
    sockets[0].receive({ sid: 'g1', ev: 'open' })
    expect(hub.guestCount()).toBe(1)
    expect(room.getNumActiveSessions()).toBe(1)

    // The sync handshake answers synchronously — through the socket, as an
    // envelope addressed to the Guest.
    sockets[0].receive({ sid: 'g1', ev: 'frame', data: connectFrame('g1') })
    const reply = sockets[0].sent
      .map((raw) => decodeEnvelope(raw))
      .find((e) => e?.ev === 'frame' && e.sid === 'g1')
    expect(reply).toBeDefined()
    hub.dispose()
  })

  it('drops all Guests and redials after an unexpected hub close', () => {
    const sockets: FakeHubSocket[] = []
    const hub = connectSessionHub({
      room,
      url: 'ws://127.0.0.1:8787/host',
      retryMs: 200,
      makeSocket: () => {
        const socket = new FakeHubSocket()
        sockets.push(socket)
        return socket
      },
    })
    sockets[0].receive({ sid: 'g1', ev: 'open' })
    expect(hub.guestCount()).toBe(1)

    sockets[0].dropFromServer()
    expect(hub.guestCount()).toBe(0)
    expect(sockets).toHaveLength(1)

    vi.advanceTimersByTime(200)
    expect(sockets).toHaveLength(2)
    // The fresh channel serves fresh Guests.
    sockets[1].receive({ sid: 'g2', ev: 'open' })
    expect(hub.guestCount()).toBe(1)
    hub.dispose()
  })

  it('dispose closes the socket, detaches Guests, and never redials', () => {
    const sockets: FakeHubSocket[] = []
    const hub = connectSessionHub({
      room,
      url: 'ws://127.0.0.1:8787/host',
      retryMs: 200,
      makeSocket: () => {
        const socket = new FakeHubSocket()
        sockets.push(socket)
        return socket
      },
    })
    sockets[0].receive({ sid: 'g1', ev: 'open' })

    hub.dispose()
    expect(sockets[0].closed).toBe(true)
    expect(hub.guestCount()).toBe(0)

    vi.advanceTimersByTime(10_000)
    expect(sockets).toHaveLength(1)
  })
})

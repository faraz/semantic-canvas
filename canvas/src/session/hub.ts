// The host hub (#28): the Canvas end of the Guest relay. While hosting, the
// Canvas opens one loopback WebSocket to the Shell's `/host` route; every
// Guest socket the Shell accepts arrives here as envelopes (see envelope.ts),
// and each Guest becomes a per-sid WebSocketMinimal shim attached to the
// Session room. The room never knows the difference between the Host's
// in-process socket and a relayed Guest.
import type { WebSocketMinimal } from '@tldraw/sync-core'
import { decodeEnvelope, encodeEnvelope } from './envelope'
import type { SessionRoom } from './room'

const WS_OPEN = 1
const WS_CLOSED = 3

// The envelope → room shuttle, socket-free for tests: envelopes in, room
// attach/detach/handleMessage calls out, outbound envelopes via sendToHub.
export interface GuestRelay {
  handleEnvelope(raw: unknown): void
  guestCount(): number
  dispose(): void
}

export function createGuestRelay(
  room: SessionRoom,
  sendToHub: (data: string) => void
): GuestRelay {
  // sid → the Guest's shim; the value's readyState is flipped on close so
  // the room's own sends stop cleanly.
  const guests = new Map<string, WebSocketMinimal & { readyState: number }>()

  const dropGuest = (sid: string, tellRoom: boolean) => {
    const shim = guests.get(sid)
    if (!shim) return
    guests.delete(sid)
    shim.readyState = WS_CLOSED
    if (tellRoom) room.detach(sid)
  }

  return {
    handleEnvelope(raw) {
      const envelope = decodeEnvelope(raw)
      if (!envelope) return
      const { sid } = envelope
      switch (envelope.ev) {
        case 'open': {
          // A straggler after the Session's room closed: nothing to join.
          if (room.isClosed()) return
          // A reused sid means the relay restarted that Guest; detach the
          // stale shim first so the room sees one session per sid.
          dropGuest(sid, true)
          const shim: WebSocketMinimal & { readyState: number } = {
            readyState: WS_OPEN,
            send: (data) => {
              if (shim.readyState !== WS_OPEN) return
              sendToHub(encodeEnvelope({ sid, ev: 'frame', data }))
            },
            // The room closing a Guest (e.g. rejecting an incompatible
            // client) rides back as a close envelope; the Shell closes the
            // actual socket.
            close: () => {
              if (shim.readyState !== WS_OPEN) return
              dropGuest(sid, false)
              sendToHub(encodeEnvelope({ sid, ev: 'close' }))
            },
          }
          guests.set(sid, shim)
          room.attach(sid, shim)
          break
        }
        case 'frame': {
          if (!guests.has(sid)) return
          room.handleMessage(sid, envelope.data)
          break
        }
        case 'close': {
          dropGuest(sid, true)
          break
        }
      }
    },
    guestCount: () => guests.size,
    dispose() {
      for (const sid of [...guests.keys()]) dropGuest(sid, true)
    },
  }
}

// The browser-WebSocket surface the hub drives; injectable in tests.
export interface HubSocketLike {
  send(data: string): void
  close(): void
  readyState: number
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
}

export interface SessionHub {
  guestCount(): number
  dispose(): void
}

export interface SessionHubOptions {
  room: SessionRoom
  url: string
  makeSocket?: (url: string) => HubSocketLike
  // Reconnect delay after an unexpected hub drop (test override).
  retryMs?: number
}

// Connects the hub and keeps it connected while the Session lives. If the
// loopback socket drops unexpectedly, all Guests are detached (their own
// clients notice the missing pongs and reconnect with fresh sids) and the
// hub redials until disposed.
export function connectSessionHub(opts: SessionHubOptions): SessionHub {
  const makeSocket = opts.makeSocket ?? ((url) => new WebSocket(url) as unknown as HubSocketLike)
  const retryMs = opts.retryMs ?? 1000
  let disposed = false
  let socket: HubSocketLike | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null

  const relay = createGuestRelay(opts.room, (data) => {
    if (socket && socket.readyState === WS_OPEN) socket.send(data)
  })

  const dial = () => {
    if (disposed) return
    const ws = makeSocket(opts.url)
    socket = ws
    ws.onmessage = (event) => relay.handleEnvelope(event.data)
    ws.onerror = null
    ws.onclose = () => {
      if (disposed || socket !== ws) return
      socket = null
      // The Shell's relay lost us with it; drop every Guest so nothing
      // half-attached lingers, then redial.
      relay.dispose()
      retryTimer = setTimeout(dial, retryMs)
    }
  }
  dial()

  return {
    guestCount: () => relay.guestCount(),
    dispose() {
      if (disposed) return
      disposed = true
      if (retryTimer !== null) clearTimeout(retryTimer)
      relay.dispose()
      const ws = socket
      socket = null
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    },
  }
}

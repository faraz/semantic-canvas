// In-process sync transport (#26): a TLPersistentClientSocket forming an
// in-memory pipe to the Session room — no network, no WebSocket. The iPad's
// own editor joins its in-page room through this via useSync({ connect }).
//
// Frames cross the pipe as JSON strings in both directions (exactly what the
// wire carries), so the client stores and the room never share mutable record
// objects. Delivery is deferred to a microtask to keep the send/receive
// re-entrancy of a real socket.
import {
  TLSyncErrorCloseEventCode,
  TLSyncErrorCloseEventReason,
} from '@tldraw/sync-core'
import type {
  TLPersistentClientSocket,
  TLSocketStatusChangeEvent,
  WebSocketMinimal,
} from '@tldraw/sync-core'
import type { SessionRoom } from './room'

const WS_OPEN = 1
const WS_CLOSED = 3

export function createInProcessSocket(
  room: SessionRoom,
  sessionId: string
): TLPersistentClientSocket {
  const messageListeners = new Set<(msg: object) => void>()
  const statusListeners = new Set<(ev: TLSocketStatusChangeEvent) => void>()
  let status: 'offline' | 'online' | 'error' = 'offline'
  let disposed = false
  // Bumped on every restart/close; queued deliveries from a previous
  // attachment are dropped, like frames from an orphaned socket.
  let generation = 0

  const setStatus = (ev: TLSocketStatusChangeEvent) => {
    if (status === ev.status) return
    status = ev.status
    for (const cb of [...statusListeners]) cb(ev)
  }

  const attach = () => {
    if (disposed || room.isClosed()) {
      setStatus({
        status: 'error',
        reason: TLSyncErrorCloseEventReason.NOT_FOUND,
      })
      return
    }
    const myGeneration = ++generation
    // The room-side end of the pipe: what TLSocketRoom sends here surfaces
    // as a received message on the client side.
    const serverSocket: WebSocketMinimal = {
      readyState: WS_OPEN,
      send: (data) => {
        queueMicrotask(() => {
          if (disposed || myGeneration !== generation) return
          const msg = JSON.parse(data)
          for (const cb of [...messageListeners]) cb(msg)
        })
      },
      close: (code, reason) => {
        serverSocket.readyState = WS_CLOSED
        queueMicrotask(() => {
          if (disposed || myGeneration !== generation) return
          if (code === TLSyncErrorCloseEventCode) {
            setStatus({
              status: 'error',
              reason: reason ?? TLSyncErrorCloseEventReason.UNKNOWN_ERROR,
            })
          } else {
            setStatus({ status: 'offline' })
          }
        })
      },
    }
    room.attach(sessionId, serverSocket)
    setStatus({ status: 'online' })
  }

  const detach = () => {
    generation++
    room.detach(sessionId)
  }

  attach()

  return {
    get connectionStatus() {
      return status
    },
    sendMessage(msg) {
      if (disposed || status !== 'online') return
      const data = JSON.stringify(msg)
      const myGeneration = generation
      queueMicrotask(() => {
        if (disposed || myGeneration !== generation) return
        room.handleMessage(sessionId, data)
      })
    },
    onReceiveMessage(cb) {
      messageListeners.add(cb)
      return () => messageListeners.delete(cb)
    },
    onStatusChange(cb) {
      statusListeners.add(cb)
      return () => statusListeners.delete(cb)
    },
    restart() {
      if (disposed) return
      detach()
      setStatus({ status: 'offline' })
      attach()
    },
    close() {
      if (disposed) return
      detach()
      setStatus({ status: 'offline' })
      disposed = true
    },
  }
}

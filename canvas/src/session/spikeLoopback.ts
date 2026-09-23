// SPIKE (#25) — throwaway: probes the loopback WebSocket leg for Local
// Sessions from the file://-loaded page. Logs the verdict to the console
// (visible in Safari's Web Inspector) and exposes window.__spikeLoopback.
// Removed by the Shell-server ticket (#27).

declare global {
  interface Window {
    __spikeLoopback?: { status: string; detail?: string }
  }
}

export function probeLoopbackWebSocket(): void {
  const report = (status: string, detail?: string) => {
    window.__spikeLoopback = { status, detail }
    console.log(`[spike #25] loopback WS: ${status}${detail ? ` — ${detail}` : ''}`)
  }

  let socket: WebSocket
  try {
    socket = new WebSocket('ws://127.0.0.1:8787/spike')
  } catch (error) {
    report('constructor-threw', String(error))
    return
  }

  const timeout = setTimeout(() => {
    report('timeout', `readyState=${socket.readyState}`)
    socket.close()
  }, 5000)

  socket.onopen = () => socket.send('ping-from-canvas')
  socket.onmessage = (event) => {
    clearTimeout(timeout)
    report(
      event.data === 'echo:ping-from-canvas' ? 'round-trip-ok' : 'unexpected-payload',
      String(event.data)
    )
    socket.close()
  }
  socket.onerror = () => {
    clearTimeout(timeout)
    report('error', `readyState=${socket.readyState}`)
  }
}

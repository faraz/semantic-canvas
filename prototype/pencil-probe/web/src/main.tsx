// PROTOTYPE — pencil-probe. Throwaway. Answers one question: does Apple Pencil
// ink through a WKWebView-hosted tldraw canvas meet the whiteboard bar?
import React from 'react'
import { createRoot } from 'react-dom/client'
import { Tldraw } from 'tldraw'
import 'tldraw/tldraw.css'

// Live input HUD: surfaces what the webview actually receives from the Pencil
// (pointer type, pressure, tilt) so a wrong-feeling stroke can be diagnosed as
// an input problem vs a rendering problem.
const hud = document.getElementById('hud')!
let frames = 0
let lastT = performance.now()
let fps = 0
setInterval(() => {
  const now = performance.now()
  fps = Math.round((frames * 1000) / (now - lastT))
  frames = 0
  lastT = now
}, 1000)
const tick = () => {
  frames++
  requestAnimationFrame(tick)
}
requestAnimationFrame(tick)

window.addEventListener(
  'pointermove',
  (e) => {
    hud.textContent =
      `${e.pointerType}  pressure=${e.pressure.toFixed(3)}  ` +
      `tilt=${e.tiltX},${e.tiltY}  events/frame=${
        typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents().length : '?'
      }  ${fps}fps`
  },
  { passive: true }
)

function App() {
  return (
    <div style={{ position: 'fixed', inset: 0 }}>
      <Tldraw />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)

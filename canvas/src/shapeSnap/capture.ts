// Ink capture: records the last completed Ink so real device strokes can
// become recognizer fixtures. Ships in the dev-mode build (the only build
// that exists today); revisit before any production build. From Safari's
// Web Inspector console on the connected iPad:
//
//   __inkCapture.dump()   // JSON of recent Ink, newest last
//   __inkCapture.clear()
//
// Paste an entry into canvas/src/shapeSnap/fixtures/<name>.json as
// { "name": "...", "expected": "ellipse" | "none", "points": [...] }.
import { type Editor } from 'tldraw'
import { onInkComplete } from './inkEvents'
import type { InkPoint } from './recognize'

const MAX_CAPTURED = 20

declare global {
  interface Window {
    __inkCapture?: { dump(): string; clear(): void }
  }
}

export function wireInkCapture(editor: Editor): () => void {
  const captured: { points: InkPoint[] }[] = []

  window.__inkCapture = {
    dump: () => JSON.stringify(captured, null, 2),
    clear: () => {
      captured.length = 0
    },
  }

  const dispose = onInkComplete(editor, (_id, points) => {
    captured.push({ points: points.map((p) => ({ x: p.x, y: p.y })) })
    if (captured.length > MAX_CAPTURED) captured.shift()
  })

  return () => {
    dispose()
    delete window.__inkCapture
  }
}

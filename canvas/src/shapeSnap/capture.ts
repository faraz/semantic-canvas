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
import { wireCaptureRing } from '../captureRing'

const MAX_CAPTURED = 20

declare global {
  interface Window {
    __inkCapture?: { dump(): string; clear(): void }
  }
}

export function wireInkCapture(editor: Editor): () => void {
  return wireCaptureRing(editor, {
    global: '__inkCapture',
    max: MAX_CAPTURED,
    entry: (_editor, _id, points) => ({ points: points.map((p) => ({ x: p.x, y: p.y })) }),
    handle: (ring) => ({
      dump: () => JSON.stringify(ring.entries, null, 2),
      clear: () => ring.clear(),
    }),
  })
}

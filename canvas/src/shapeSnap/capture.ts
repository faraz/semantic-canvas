// Dev-only stroke capture: records the last completed Ink strokes so real
// device strokes can become recognizer fixtures. From Safari's Web Inspector
// console on the connected iPad:
//
//   __strokeCapture.dump()   // JSON of recent strokes, newest last
//   __strokeCapture.clear()
//
// Paste a stroke into canvas/src/shapeSnap/fixtures/<name>.json as
// { "name": "...", "expected": "ellipse" | "none", "points": [...] }.
import { getPointsFromDrawSegments, type Editor, type TLDrawShape } from 'tldraw'
import type { InkPoint } from './recognize'

const MAX_CAPTURED = 20

declare global {
  interface Window {
    __strokeCapture?: { dump(): string; clear(): void }
  }
}

export function wireStrokeCapture(editor: Editor): () => void {
  const captured: { points: InkPoint[] }[] = []

  window.__strokeCapture = {
    dump: () => JSON.stringify(captured, null, 2),
    clear: () => {
      captured.length = 0
    },
  }

  const dispose = editor.sideEffects.registerAfterChangeHandler(
    'shape',
    (prev, next, source) => {
      if (source !== 'user') return
      if (prev.type !== 'draw' || next.type !== 'draw') return
      const prevDraw = prev as TLDrawShape
      const nextDraw = next as TLDrawShape
      if (prevDraw.props.isComplete || !nextDraw.props.isComplete) return
      const scale = nextDraw.props.scale
      const points = getPointsFromDrawSegments(nextDraw.props.segments, scale, scale)
      captured.push({ points: points.map((p) => ({ x: p.x, y: p.y })) })
      if (captured.length > MAX_CAPTURED) captured.shift()
    }
  )

  return () => {
    dispose()
    delete window.__strokeCapture
  }
}

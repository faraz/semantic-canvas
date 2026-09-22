// Template capture: records completed Ink strokes so drawn symbols become
// Illustration Snap templates — extending the library is drawing, not
// coding. Ships in the dev-mode build (the only build that exists today);
// revisit before any production build.
//
// Workflow, from Safari's Web Inspector console on the connected iPad:
//
//   1. Draw the symbol's strokes on the Board (Shape/Illustration Snap may
//      replace them on-canvas — the capture records the raw Ink regardless).
//   2. __templateCapture.dump()          // peek at the buffered strokes
//   3. __templateCapture.save('gear')    // JSON for the symbol, clears buffer
//   4. Paste the JSON's "strokes" array into the symbol's `examples` list in
//      canvas/src/illustrationSnap/templates.ts (each example is an array of
//      stroke point arrays). Draw the symbol several times and save each
//      pass for a template with multiple examples.
//   5. __templateCapture.clear()         // discard a botched drawing
//
// Points are page-space as drawn; the $Q recognizer normalizes position and
// scale, so no cleanup is needed.
import { type Editor, type TLDrawShape } from 'tldraw'
import { onInkComplete } from '../shapeSnap/inkEvents'
import type { InkPoint } from '../shapeSnap/recognize'

const MAX_CAPTURED_STROKES = 24

declare global {
  interface Window {
    __templateCapture?: { save(name: string): string; dump(): string; clear(): void }
  }
}

export function wireTemplateCapture(editor: Editor): () => void {
  const strokes: InkPoint[][] = []

  window.__templateCapture = {
    save: (name: string) => {
      const json = JSON.stringify({ name, strokes }, null, 2)
      strokes.length = 0
      return json
    },
    dump: () => JSON.stringify(strokes, null, 2),
    clear: () => {
      strokes.length = 0
    },
  }

  const dispose = onInkComplete(editor, (id, points) => {
    const shape = editor.getShape(id)
    if (!shape || shape.type !== 'draw') return
    const draw = shape as TLDrawShape
    strokes.push(points.map((p) => ({ x: p.x + draw.x, y: p.y + draw.y })))
    if (strokes.length > MAX_CAPTURED_STROKES) strokes.shift()
  })

  return () => {
    dispose()
    delete window.__templateCapture
  }
}

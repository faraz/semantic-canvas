// Template capture: records completed Ink so drawn symbols become
// Illustration Snap templates — extending the library is drawing, not
// coding. Ships in the dev-mode build (the only build that exists today);
// revisit before any production build.
//
// Workflow, from Safari's Web Inspector console on the connected iPad:
//
//   1. Draw the symbol's strokes on the Board (Shape/Illustration Snap may
//      replace them on-canvas — the capture records the raw Ink regardless).
//   2. __templateCapture.dump()          // peek at the buffered Ink
//   3. __templateCapture.save('gear')    // JSON for the symbol, clears buffer
//   4. Paste the JSON's "ink" array into the symbol's `examples` list in
//      canvas/src/illustrationSnap/templates.ts (each example is an array of
//      Ink point-arrays), or register it programmatically with
//      templateFromCapture(name, ink) from templates.ts. Draw the symbol
//      several times and save each pass for a template with multiple
//      examples.
//   5. __templateCapture.clear()         // discard a botched drawing
//
// Points are page-space as drawn; the $Q recognizer normalizes position and
// scale, so no cleanup is needed.
import { type Editor, type TLDrawShape } from 'tldraw'
import { wireCaptureRing } from '../captureRing'
import type { InkPoint } from '../shapeSnap/recognize'

const MAX_CAPTURED_STROKES = 24

declare global {
  interface Window {
    __templateCapture?: { save(name: string): string; dump(): string; clear(): void }
  }
}

export function wireTemplateCapture(editor: Editor): () => void {
  return wireCaptureRing<InkPoint[], NonNullable<Window['__templateCapture']>>(editor, {
    global: '__templateCapture',
    max: MAX_CAPTURED_STROKES,
    entry: (editor, id, points) => {
      const shape = editor.getShape(id)
      if (!shape || shape.type !== 'draw') return undefined
      const draw = shape as TLDrawShape
      // Page-space, so multi-stroke symbols keep their layout.
      return points.map((p) => ({ x: p.x + draw.x, y: p.y + draw.y }))
    },
    handle: (ring) => ({
      save: (name: string) => {
        const json = JSON.stringify({ name, ink: ring.entries }, null, 2)
        ring.clear()
        return json
      },
      dump: () => JSON.stringify(ring.entries, null, 2),
      clear: () => ring.clear(),
    }),
  })
}

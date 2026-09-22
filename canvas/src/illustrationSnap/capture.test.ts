// @vitest-environment jsdom
import '../tldrawTestShims'
import { describe, expect, it } from 'vitest'
import { createShapeId, type Editor } from 'tldraw'
import { b64Vecs } from '@tldraw/tlschema'
import { makeTestEditor } from '../tldrawTestEditor'
import type { InkPoint } from '../shapeSnap/recognize'
import { straightLine, zigzagScribble } from '../shapeSnap/testInk'
import { wireTemplateCapture } from './capture'
import { recognizeIllustration, templateFromCapture } from './templates'

let inkSeq = 0
function completeInk(editor: Editor, points: InkPoint[], { x = 0, y = 0 } = {}) {
  const id = createShapeId(`capture-${inkSeq++}`)
  const path = b64Vecs.encodePoints(
    points.map((p) => ({ x: p.x, y: p.y, z: 0.5 })),
    3
  )
  editor.createShape({
    id,
    type: 'draw',
    x,
    y,
    props: { segments: [{ type: 'free', path }], isComplete: false },
  })
  editor.updateShape({ id, type: 'draw', props: { isComplete: true } })
  return id
}

describe('wireTemplateCapture', () => {
  it('round-trips captured Ink into a live template example', () => {
    const editor = makeTestEditor()
    const dispose = wireTemplateCapture(editor)

    // Draw a two-stroke "flag" — a pole plus a zigzag banner — offset on the
    // Board so the capture must record page-space points.
    const pole = straightLine({ x1: 0, y1: 0, x2: 0, y2: 200, jitter: 2, seed: 3 })
    const banner = zigzagScribble({ x: 0, y: 10, width: 140, height: 60, seed: 5 })
    completeInk(editor, pole, { x: 30, y: 40 })
    completeInk(editor, banner, { x: 30, y: 40 })

    const json = window.__templateCapture!.save('checkmark')
    dispose()

    // The emitted JSON is the documented shape: { name, ink: Ink[][] } in
    // page-space.
    const captured = JSON.parse(json) as { name: string; ink: InkPoint[][] }
    expect(captured.name).toBe('checkmark')
    expect(captured.ink).toHaveLength(2)
    expect(captured.ink[0][0].x).toBeCloseTo(30 + pole[0].x, 0)
    expect(captured.ink[0][0].y).toBeCloseTo(40 + pole[0].y, 0)

    // The flag isn't in the library...
    expect(recognizeIllustration(captured.ink)).toBeNull()

    // ...until the captured JSON is registered; then the same drawing is an
    // exact-match example (distance ~0), proving the capture itself is what
    // got registered.
    templateFromCapture(captured.name, captured.ink)
    const match = recognizeIllustration(captured.ink)
    expect(match?.name).toBe('checkmark')
    expect(match?.distance).toBeCloseTo(0, 5)
  })

  it('save empties the buffer and dispose removes the console handle', () => {
    const editor = makeTestEditor()
    const dispose = wireTemplateCapture(editor)

    completeInk(editor, straightLine({ x1: 0, y1: 0, x2: 100, y2: 100, jitter: 1, seed: 2 }))
    expect(JSON.parse(window.__templateCapture!.dump())).toHaveLength(1)

    window.__templateCapture!.save('star')
    expect(JSON.parse(window.__templateCapture!.dump())).toHaveLength(0)

    dispose()
    expect(window.__templateCapture).toBeUndefined()
  })

  it('rejects a capture saved under an unknown template name', () => {
    expect(() => templateFromCapture('not-a-template', [[{ x: 0, y: 0 }]])).toThrow(
      /Unknown illustration template/
    )
  })
})

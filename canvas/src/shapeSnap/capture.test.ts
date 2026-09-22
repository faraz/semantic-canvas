// @vitest-environment jsdom
import '../tldrawTestShims'
import { describe, expect, it } from 'vitest'
import { createShapeId, type Editor } from 'tldraw'
import { b64Vecs } from '@tldraw/tlschema'
import { makeTestEditor } from '../tldrawTestEditor'
import type { InkPoint } from './recognize'
import { straightLine } from './testInk'
import { wireInkCapture } from './capture'

let inkSeq = 0
function completeInk(editor: Editor, points: InkPoint[]) {
  const id = createShapeId(`ink-${inkSeq++}`)
  const path = b64Vecs.encodePoints(
    points.map((p) => ({ x: p.x, y: p.y, z: 0.5 })),
    3
  )
  editor.createShape({
    id,
    type: 'draw',
    x: 0,
    y: 0,
    props: { segments: [{ type: 'free', path }], isComplete: false },
  })
  editor.updateShape({ id, type: 'draw', props: { isComplete: true } })
  return id
}

describe('wireInkCapture', () => {
  it('buffers completed Ink for the console handle, clears on demand', () => {
    const editor = makeTestEditor()
    const dispose = wireInkCapture(editor)

    const points = straightLine({ x1: 5, y1: 5, x2: 150, y2: 90, jitter: 1, seed: 4 })
    completeInk(editor, points)

    const captured = JSON.parse(window.__inkCapture!.dump()) as { points: InkPoint[] }[]
    expect(captured).toHaveLength(1)
    expect(captured[0].points).toHaveLength(points.length)
    expect(captured[0].points[0].x).toBeCloseTo(points[0].x, 5)

    window.__inkCapture!.clear()
    expect(JSON.parse(window.__inkCapture!.dump())).toHaveLength(0)

    dispose()
    expect(window.__inkCapture).toBeUndefined()
  })
})

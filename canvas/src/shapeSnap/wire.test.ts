// @vitest-environment jsdom
import '../tldrawTestShims'
import { describe, expect, it } from 'vitest'
import { createShapeId, type Editor, type TLArrowShape, type TLGeoShape } from 'tldraw'
import { b64Vecs } from '@tldraw/tlschema'
import { roughArrow, roughEllipse, roughRectangle, zigzagScribble } from './testInk'
import type { InkPoint } from './recognize'
import { wireShapeSnap } from './wire'
import { makeTestEditor } from '../tldrawTestEditor'



function completeInk(editor: Editor, points: InkPoint[]) {
  const id = createShapeId('stroke')
  const path = b64Vecs.encodePoints(
    points.map((p) => ({ x: p.x, y: p.y, z: 0.5 })),
    3
  )
  editor.createShape({
    id,
    type: 'draw',
    x: 10,
    y: 20,
    props: { segments: [{ type: 'free', path }], isComplete: false },
  })
  editor.updateShape({ id, type: 'draw', props: { isComplete: true } })
  return id
}

const flushSnap = () => new Promise((resolve) => setTimeout(resolve, 10))

describe('wireShapeSnap', () => {
  it('swaps a completed circular Ink stroke for a geo ellipse', async () => {
    const editor = makeTestEditor()
    let snaps = 0
    wireShapeSnap(editor, { onSnap: () => snaps++ })

    const id = completeInk(
      editor,
      roughEllipse({ cx: 200, cy: 200, rx: 80, ry: 60, jitter: 3, seed: 4 })
    )
    await flushSnap()

    expect(snaps).toBe(1)
    expect(editor.getShape(id)).toBeUndefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes).toHaveLength(1)
    const geo = shapes[0] as TLGeoShape
    expect(geo.type).toBe('geo')
    expect(geo.props.geo).toBe('ellipse')
    // Placement: stroke-local bounds offset by the draw shape's position.
    expect(geo.x).toBeCloseTo(10 + 200 - 80, -1)
    expect(geo.y).toBeCloseTo(20 + 200 - 60, -1)
  })

  it('swaps a completed boxy Ink stroke for a geo rectangle', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    const id = completeInk(
      editor,
      roughRectangle({ x: 100, y: 100, w: 200, h: 150, jitter: 3, seed: 2 })
    )
    await flushSnap()

    expect(editor.getShape(id)).toBeUndefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes).toHaveLength(1)
    const geo = shapes[0] as TLGeoShape
    expect(geo.type).toBe('geo')
    expect(geo.props.geo).toBe('rectangle')
    expect(geo.x).toBeCloseTo(10 + 100, -1)
    expect(geo.y).toBeCloseTo(20 + 100, -1)
  })

  it('swaps a completed arrow-ish Ink stroke for an arrow with the tip at the head', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    const id = completeInk(
      editor,
      roughArrow({ x1: 100, y1: 200, x2: 340, y2: 200, jitter: 2, seed: 5 })
    )
    await flushSnap()

    expect(editor.getShape(id)).toBeUndefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes).toHaveLength(1)
    const arrow = shapes[0] as TLArrowShape
    expect(arrow.type).toBe('arrow')
    expect(arrow.props.arrowheadEnd).toBe('arrow')
    expect(arrow.props.arrowheadStart).toBe('none')
    // Shape origin anchors at the drawn start (offset by the Ink's position);
    // the end prop points at the drawn tip, shape-relative.
    expect(arrow.x).toBeCloseTo(10 + 100, -1)
    expect(arrow.y).toBeCloseTo(20 + 200, -1)
    // Tip lands near the drawn head (within half the 60px arrowhead).
    expect(Math.hypot(arrow.props.end.x - 240, arrow.props.end.y - 0)).toBeLessThan(30)
  })

  it('one undo restores the original Ink stroke', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    const id = completeInk(
      editor,
      roughEllipse({ cx: 150, cy: 150, rx: 70, ry: 70, jitter: 2, seed: 9 })
    )
    await flushSnap()
    expect(editor.getShape(id)).toBeUndefined()

    editor.undo()

    expect(editor.getShape(id)).toBeDefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes.filter((s) => s.type === 'geo')).toHaveLength(0)
  })

  it('one undo restores the original Ink stroke after an arrow snap', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    const id = completeInk(
      editor,
      roughArrow({ x1: 60, y1: 320, x2: 280, y2: 120, jitter: 2, seed: 4 })
    )
    await flushSnap()
    expect(editor.getShape(id)).toBeUndefined()

    editor.undo()

    expect(editor.getShape(id)).toBeDefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes.filter((s) => s.type === 'arrow')).toHaveLength(0)
  })

  it('leaves a scribble as Ink', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    const id = completeInk(
      editor,
      zigzagScribble({ x: 50, y: 50, width: 250, height: 80, seed: 5 })
    )
    await flushSnap()

    expect(editor.getShape(id)).toBeDefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes.filter((s) => s.type === 'geo')).toHaveLength(0)
  })
})

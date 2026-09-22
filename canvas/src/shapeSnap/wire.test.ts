// @vitest-environment jsdom
import '../tldrawTestShims'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  createShapeId,
  type Editor,
  type TLArrowShape,
  type TLGeoShape,
  type TLLineShape,
} from 'tldraw'
import { b64Vecs } from '@tldraw/tlschema'
import {
  roughArrow,
  roughDiamond,
  roughEllipse,
  roughRectangle,
  straightLine,
  zigzagScribble,
} from './testInk'
import type { InkPoint } from './recognize'
import { wireShapeSnap } from './wire'
import { setSnapEnabled } from '../snapPreference'
import { makeTestEditor } from '../tldrawTestEditor'



let strokeSeq = 0
function completeInk(editor: Editor, points: InkPoint[]) {
  const id = createShapeId(`stroke-${strokeSeq++}`)
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
  beforeEach(() => setSnapEnabled(true))

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

  it('swaps a straight open Ink stroke for a line with the drawn endpoints', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    const id = completeInk(
      editor,
      straightLine({ x1: 60, y1: 80, x2: 280, y2: 190, jitter: 2, seed: 7 })
    )
    await flushSnap()

    expect(editor.getShape(id)).toBeUndefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes).toHaveLength(1)
    const line = shapes[0] as TLLineShape
    expect(line.type).toBe('line')
    // Origin anchors at the drawn start (offset by the Ink's position)...
    expect(line.x).toBeCloseTo(10 + 60, -1)
    expect(line.y).toBeCloseTo(20 + 80, -1)
    // ...with the two endpoints shape-relative: a1 at the origin, a2 at the
    // drawn end.
    expect(line.props.points.a1.x).toBe(0)
    expect(line.props.points.a1.y).toBe(0)
    expect(line.props.points.a2.x).toBeCloseTo(280 - 60, -1)
    expect(line.props.points.a2.y).toBeCloseTo(190 - 80, -1)
  })

  it('swaps a corner-drawn box for a geo diamond', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    const id = completeInk(
      editor,
      roughDiamond({ x: 100, y: 100, w: 180, h: 180, jitter: 3, seed: 3 })
    )
    await flushSnap()

    expect(editor.getShape(id)).toBeUndefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes).toHaveLength(1)
    const geo = shapes[0] as TLGeoShape
    expect(geo.type).toBe('geo')
    expect(geo.props.geo).toBe('diamond')
    expect(geo.x).toBeCloseTo(10 + 100, -1)
    expect(geo.y).toBeCloseTo(20 + 100, -1)
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

  it('one undo restores the original Ink stroke after a line snap', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    const id = completeInk(
      editor,
      straightLine({ x1: 40, y1: 300, x2: 260, y2: 90, jitter: 2, seed: 11 })
    )
    await flushSnap()
    expect(editor.getShape(id)).toBeUndefined()

    editor.undo()

    expect(editor.getShape(id)).toBeDefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes.filter((s) => s.type === 'line')).toHaveLength(0)
  })

  it('one undo restores the original Ink stroke after a diamond snap', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    const id = completeInk(
      editor,
      roughDiamond({ x: 50, y: 60, w: 200, h: 160, jitter: 3, seed: 8 })
    )
    await flushSnap()
    expect(editor.getShape(id)).toBeUndefined()

    editor.undo()

    expect(editor.getShape(id)).toBeDefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes.filter((s) => s.type === 'geo')).toHaveLength(0)
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

  it('leaves Ink as Ink while Snapping is off', async () => {
    const editor = makeTestEditor()
    let snaps = 0
    wireShapeSnap(editor, { onSnap: () => snaps++ })
    setSnapEnabled(false)

    const id = completeInk(
      editor,
      roughEllipse({ cx: 200, cy: 200, rx: 80, ry: 60, jitter: 3, seed: 4 })
    )
    await flushSnap()

    expect(snaps).toBe(0)
    expect(editor.getShape(id)?.type).toBe('draw')
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes.filter((s) => s.type === 'geo')).toHaveLength(0)
  })

  it('toggling Snapping mid-session gates and restores without re-wiring', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    // Off: the stroke stays Ink.
    setSnapEnabled(false)
    const inkId = completeInk(
      editor,
      roughEllipse({ cx: 150, cy: 150, rx: 70, ry: 70, jitter: 2, seed: 9 })
    )
    await flushSnap()
    expect(editor.getShape(inkId)?.type).toBe('draw')

    // Back on: the same wiring snaps the next stroke — no reload needed.
    setSnapEnabled(true)
    const nextId = completeInk(
      editor,
      roughRectangle({ x: 400, y: 400, w: 200, h: 150, jitter: 3, seed: 2 })
    )
    await flushSnap()
    expect(editor.getShape(nextId)).toBeUndefined()
    const shapes = [...editor.getCurrentPageShapeIds()].map((sid) => editor.getShape(sid)!)
    expect(shapes.filter((s) => s.type === 'geo')).toHaveLength(1)
    // The stroke drawn while off stays Ink.
    expect(editor.getShape(inkId)?.type).toBe('draw')
  })

  it('respects a toggle-off that lands after stroke completion but before the deferred snap', async () => {
    const editor = makeTestEditor()
    wireShapeSnap(editor)

    const id = completeInk(
      editor,
      roughEllipse({ cx: 200, cy: 200, rx: 80, ry: 60, jitter: 3, seed: 4 })
    )
    // The swap is deferred past the Ink's own transaction; turning Snapping
    // off in that gap must still keep the Ink.
    setSnapEnabled(false)
    await flushSnap()

    expect(editor.getShape(id)?.type).toBe('draw')
  })
})

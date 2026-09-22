// @vitest-environment jsdom
import '../tldrawTestShims'
import { describe, expect, it } from 'vitest'
import {
  createShapeId,
  type Editor,
  type TLDrawShape,
  type TLGeoShape,
  type TLShape,
} from 'tldraw'
import { b64Vecs } from '@tldraw/tlschema'
import { makeTestEditor } from '../tldrawTestEditor'
import type { InkPoint } from '../shapeSnap/recognize'
import { zigzagScribble, roughRectangle } from '../shapeSnap/testInk'
import { wireShapeSnap } from '../shapeSnap/wire'
import { cloudInk, heartInk, stickFigureInk } from './templates'
import { wireIllustrationSnap } from './wire'

let strokeSeq = 0
function completeInk(editor: Editor, points: InkPoint[], { x = 10, y = 20 } = {}) {
  const id = createShapeId(`stroke-${strokeSeq++}`)
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

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Both wirings, connected the way App.tsx mounts them.
function wireBoth(editor: Editor) {
  const counts = { illustration: 0, geometric: 0 }
  const illustration = wireIllustrationSnap(editor, {
    onSnap: () => counts.illustration++,
    settleMs: 50,
  })
  wireShapeSnap(editor, {
    onSnap: () => counts.geometric++,
    onInkSnapped: illustration.noteInkSnapped,
  })
  return counts
}

function pageShapes(editor: Editor): TLShape[] {
  return [...editor.getCurrentPageShapeIds()].map((id) => editor.getShape(id)!)
}

describe('wireIllustrationSnap', () => {
  it('snaps a multi-stroke stick figure to one grouped figure, single undo restores the pre-illustration state', async () => {
    const editor = makeTestEditor()
    const counts = wireBoth(editor)

    for (const stroke of stickFigureInk({ jitter: 3, seed: 12 })) {
      completeInk(editor, stroke)
    }

    // Let the per-stroke geometric snaps land, but not the group settle.
    await wait(20)
    const preIllustration = pageShapes(editor)
    const preIds = preIllustration.map((s) => s.id).sort()
    // The head circle already snapped to a geo ellipse — the precedence
    // tension this wiring exists to solve — and the limbs to lines.
    const preGeos = preIllustration.filter((s) => s.type === 'geo') as TLGeoShape[]
    expect(preGeos).toHaveLength(1)
    expect(preGeos[0].props.geo).toBe('ellipse')
    expect(preIllustration.filter((s) => s.type === 'line')).toHaveLength(4)
    expect(counts.illustration).toBe(0)

    // Group settles: the illustration consumes the geo snaps and the Ink.
    await wait(80)
    expect(counts.illustration).toBe(1)
    const after = pageShapes(editor)
    const group = after.filter((s) => s.type === 'group')
    expect(group).toHaveLength(1)
    const children = after.filter((s) => s.parentId === group[0].id)
    expect(children).toHaveLength(5)
    const head = children.filter(
      (s) => s.type === 'geo' && (s as TLGeoShape).props.geo === 'ellipse'
    )
    expect(head).toHaveLength(1)
    expect(children.filter((s) => s.type === 'line')).toHaveLength(4)
    // None of the pre-illustration shapes survive.
    for (const id of preIds) expect(editor.getShape(id)).toBeUndefined()

    // ONE undo restores exactly the pre-illustration state: the intermediate
    // geo ellipse head and the four snapped lines — not the raw Ink.
    editor.undo()
    expect(pageShapes(editor).map((s) => s.id).sort()).toEqual(preIds)
    expect(pageShapes(editor).some((s) => s.type === 'group')).toBe(false)

    // A second undo then unwinds one member's geometric snap back to Ink.
    editor.undo()
    expect(pageShapes(editor).filter((s) => s.type === 'draw')).toHaveLength(1)
  })

  it('overrides a geometric snap when a single rough cloud settles', async () => {
    const editor = makeTestEditor()
    const counts = wireBoth(editor)

    completeInk(editor, cloudInk({ jitter: 4, seed: 9 })[0])

    // The moment-based recognizer eagerly reads a cloud as an ellipse...
    await wait(20)
    const intermediate = pageShapes(editor)
    expect(intermediate).toHaveLength(1)
    expect((intermediate[0] as TLGeoShape).props.geo).toBe('ellipse')

    // ...and the settled illustration match corrects it to a cloud.
    await wait(80)
    const after = pageShapes(editor)
    expect(after).toHaveLength(1)
    expect(after[0].type).toBe('geo')
    expect((after[0] as TLGeoShape).props.geo).toBe('cloud')
    expect(counts.illustration).toBe(1)

    // Single-part replacement: no group wrapper, scaled to the drawn bounds.
    const drawnWidth = 2 * 90 * 1.22 // cloud generator extent
    expect((after[0] as TLGeoShape).props.w).toBeGreaterThan(drawnWidth - 20)

    // One undo: back to the intermediate geo ellipse; another: back to Ink.
    editor.undo()
    expect((pageShapes(editor)[0] as TLGeoShape).props.geo).toBe('ellipse')
    editor.undo()
    expect(pageShapes(editor)[0].type).toBe('draw')
  })

  it('leaves a plain rectangle as the geometric snap (never an illustration)', async () => {
    const editor = makeTestEditor()
    const counts = wireBoth(editor)

    completeInk(editor, roughRectangle({ x: 0, y: 0, w: 200, h: 150, jitter: 3, seed: 2 }))
    await wait(120)

    const shapes = pageShapes(editor)
    expect(shapes).toHaveLength(1)
    expect(shapes[0].type).toBe('geo')
    expect((shapes[0] as TLGeoShape).props.geo).toBe('rectangle')
    expect(counts.illustration).toBe(0)
  })

  it('leaves a scribble as Ink', async () => {
    const editor = makeTestEditor()
    const counts = wireBoth(editor)

    const id = completeInk(editor, zigzagScribble({ x: 0, y: 0, width: 250, height: 80, seed: 5 }))
    await wait(120)

    expect(editor.getShape(id)).toBeDefined()
    expect((editor.getShape(id) as TLDrawShape).type).toBe('draw')
    expect(counts.illustration).toBe(0)
  })

  it('does not merge strokes far apart in space: two hearts snap separately', async () => {
    const editor = makeTestEditor()
    const counts = wireBoth(editor)

    completeInk(editor, heartInk({ jitter: 3, seed: 4 })[0], { x: 0, y: 0 })
    completeInk(editor, heartInk({ jitter: 3, seed: 8 })[0], { x: 1500, y: 1500 })
    await wait(120)

    const hearts = pageShapes(editor).filter(
      (s) => s.type === 'geo' && (s as TLGeoShape).props.geo === 'heart'
    )
    expect(hearts).toHaveLength(2)
    expect(counts.illustration).toBe(2)
  })

  it('fires the Bridge onSnap once per illustration snap', async () => {
    const editor = makeTestEditor()
    const counts = wireBoth(editor)

    for (const stroke of stickFigureInk({ jitter: 2, seed: 3 })) {
      completeInk(editor, stroke)
    }
    await wait(120)
    expect(counts.illustration).toBe(1)
  })
})

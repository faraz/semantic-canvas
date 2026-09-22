// Wires Shape Snap into the editor: when an Ink stroke completes, run the
// recognizer and — on a hit — replace the stroke with clean geometry as a
// single undoable entry, so one undo restores the original Ink.
import {
  getPointsFromDrawSegments,
  type Editor,
  type TLDrawShape,
  type TLShapeId,
} from 'tldraw'
import { recognizeInk } from './recognize'

export function wireShapeSnap(editor: Editor): () => void {
  return editor.sideEffects.registerAfterChangeHandler('shape', (prev, next, source) => {
    if (source !== 'user') return
    if (prev.type !== 'draw' || next.type !== 'draw') return
    const prevDraw = prev as TLDrawShape
    const nextDraw = next as TLDrawShape
    if (prevDraw.props.isComplete || !nextDraw.props.isComplete) return
    // Defer past the stroke's own store transaction and history entry; the
    // swap must be a separate undo stop.
    editor.timers.setTimeout(() => snapCompletedStroke(editor, next.id), 0)
  })
}

function snapCompletedStroke(editor: Editor, id: TLShapeId): void {
  const shape = editor.getShape(id)
  if (!shape || shape.type !== 'draw') return
  const draw = shape as TLDrawShape
  if (draw.rotation !== 0) return

  const scale = draw.props.scale
  const points = getPointsFromDrawSegments(draw.props.segments, scale, scale)
  const result = recognizeInk(points, { zoom: editor.getZoomLevel() })
  if (result.kind === 'none') return

  editor.markHistoryStoppingPoint('shape snap')
  editor.run(() => {
    editor.deleteShape(draw.id)
    editor.createShape({
      type: 'geo',
      x: draw.x + result.x,
      y: draw.y + result.y,
      props: {
        geo: 'ellipse',
        w: result.w,
        h: result.h,
        color: draw.props.color,
        dash: draw.props.dash,
        size: draw.props.size,
        fill: draw.props.fill,
      },
    })
  })
  onSnap?.()
}

// The Bridge ticket replaces this with the haptic message; kept as a module
// hook so wiring stays testable without one.
let onSnap: (() => void) | undefined
export function setOnSnap(handler: (() => void) | undefined): void {
  onSnap = handler
}

// Wires Shape Snap into the editor: when Ink completes, run the recognizer
// and — on a hit — replace the Ink with clean geometry as a single undoable
// entry, so one undo restores it.
import {
  getPointsFromDrawSegments,
  type Editor,
  type TLDrawShape,
  type TLShapeId,
} from 'tldraw'
import { onInkComplete } from './inkEvents'
import { recognizeInk } from './recognize'

export interface ShapeSnapOptions {
  // Called after a snap lands; the Bridge ticket connects this to the haptic.
  onSnap?: () => void
}

export function wireShapeSnap(editor: Editor, options: ShapeSnapOptions = {}): () => void {
  return onInkComplete(editor, (id) => {
    // Defer past the Ink's own store transaction and history entry; the swap
    // must be a separate undo stop.
    editor.timers.setTimeout(() => snapCompletedInk(editor, id, options), 0)
  })
}

function snapCompletedInk(editor: Editor, id: TLShapeId, options: ShapeSnapOptions): void {
  const shape = editor.getShape(id)
  if (!shape || shape.type !== 'draw') return
  const draw = shape as TLDrawShape
  if (draw.rotation !== 0) return

  // Re-decode from the shape as stored, in case it changed since completion.
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
      opacity: draw.opacity,
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
  options.onSnap?.()
}

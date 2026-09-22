// Wires Shape Snap into the editor: when Ink completes, run the recognizer
// and — on a hit — replace the Ink with clean geometry as a single undoable
// entry, so one undo restores it.
import {
  createShapeId,
  getPointsFromDrawSegments,
  type Editor,
  type TLDrawShape,
  type TLShapeId,
} from 'tldraw'
import { lineShapePoints } from '../lineShape'
import { onInkComplete } from './inkEvents'
import { recognizeInk, type RecognizedInk } from './recognize'

export interface ShapeSnapOptions {
  // Called after a snap lands; the Bridge ticket connects this to the haptic.
  onSnap?: () => void
  // Called after a snap lands with the consumed Ink's id and the created
  // shape's id. Illustration Snap uses this to keep tracking a group member
  // through its geometric snap (see illustrationSnap/wire.ts).
  onInkSnapped?: (inkId: TLShapeId, snappedShapeId: TLShapeId) => void
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
  const snappedShapeId = createShapeId()
  editor.run(() => {
    editor.deleteShape(draw.id)
    createSnappedShape(editor, draw, result, snappedShapeId)
  })
  options.onSnap?.()
  options.onInkSnapped?.(draw.id, snappedShapeId)
}

function createSnappedShape(
  editor: Editor,
  draw: TLDrawShape,
  result: Exclude<RecognizedInk, { kind: 'none' }>,
  id: TLShapeId
): void {
  // Style props carry over only where the target shape accepts them: geo and
  // arrow shapes take fill, line shapes do not.
  const inkStyle = {
    color: draw.props.color,
    dash: draw.props.dash,
    size: draw.props.size,
  }

  switch (result.kind) {
    case 'rectangle':
    case 'diamond':
    case 'ellipse': {
      editor.createShape({
        id,
        type: 'geo',
        x: draw.x + result.x,
        y: draw.y + result.y,
        opacity: draw.opacity,
        props: {
          geo: result.kind,
          w: result.w,
          h: result.h,
          ...inkStyle,
          fill: draw.props.fill,
        },
      })
      return
    }
    case 'arrow': {
      // Arrow start/end props are relative to the shape's origin; anchor the
      // origin at the drawn start.
      editor.createShape({
        id,
        type: 'arrow',
        x: draw.x + result.start.x,
        y: draw.y + result.start.y,
        opacity: draw.opacity,
        props: {
          start: { x: 0, y: 0 },
          end: { x: result.end.x - result.start.x, y: result.end.y - result.start.y },
          arrowheadStart: 'none',
          arrowheadEnd: 'arrow',
          ...inkStyle,
          fill: draw.props.fill,
        },
      })
      return
    }
    case 'line': {
      editor.createShape({
        id,
        type: 'line',
        x: draw.x + result.start.x,
        y: draw.y + result.start.y,
        opacity: draw.opacity,
        props: {
          spline: 'line',
          points: lineShapePoints([
            { x: 0, y: 0 },
            { x: result.end.x - result.start.x, y: result.end.y - result.start.y },
          ]),
          ...inkStyle,
        },
      })
      return
    }
  }
}

// Shared "Ink just completed" detection: fires the handler with the decoded
// points exactly once per stroke of Ink, on the isComplete transition of a
// user-drawn draw shape. The predicate is subtle (transition edge + source
// filter), so it lives in one place.
import {
  getPointsFromDrawSegments,
  type Editor,
  type TLDrawShape,
  type TLShapeId,
} from 'tldraw'
import type { InkPoint } from './recognize'

export function onInkComplete(
  editor: Editor,
  handler: (id: TLShapeId, points: InkPoint[]) => void
): () => void {
  return editor.sideEffects.registerAfterChangeHandler('shape', (prev, next, source) => {
    if (source !== 'user') return
    if (prev.type !== 'draw' || next.type !== 'draw') return
    const prevDraw = prev as TLDrawShape
    const nextDraw = next as TLDrawShape
    if (prevDraw.props.isComplete || !nextDraw.props.isComplete) return
    const scale = nextDraw.props.scale
    const points = getPointsFromDrawSegments(nextDraw.props.segments, scale, scale)
    handler(next.id, points)
  })
}

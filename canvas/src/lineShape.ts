// The tldraw line-shape points idiom, shared by Shape Snap's line swap and
// the illustration renderer: shape-local points keyed a1, a2, ... where the
// key doubles as the fractional index.
import type { IndexKey } from 'tldraw'
import type { InkPoint } from './shapeSnap/recognize'

export type LineShapePoints = Record<string, { id: string; index: IndexKey; x: number; y: number }>

// Build the `points` prop for a line shape from shape-local points.
// Fractional index keys sort lexicographically; callers keep lines under
// 10 points so a1..a9 stay ordered.
export function lineShapePoints(points: readonly InkPoint[]): LineShapePoints {
  const record: LineShapePoints = {}
  points.forEach((p, i) => {
    const key = `a${i + 1}`
    record[key] = { id: key, index: key as IndexKey, x: p.x, y: p.y }
  })
  return record
}

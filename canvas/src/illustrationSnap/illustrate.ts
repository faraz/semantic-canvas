// Renders a matched template's replacement recipe onto the Board: the
// recipe's clean primitives are created scaled (non-uniformly) so the
// recipe's own bounds land exactly on the drawn bounds, styled like the
// consumed Ink, and — when the recipe has several parts — wrapped in a
// group so the illustration moves as one shape. Pure rendering; grouping
// policy, gating and the undo contract live in wire.ts.
import {
  createShapeId,
  type Editor,
  type TLDefaultColorStyle,
  type TLDefaultDashStyle,
  type TLDefaultFillStyle,
  type TLDefaultSizeStyle,
  type TLShapeId,
} from 'tldraw'
import { b64Vecs } from '@tldraw/tlschema'
import { lineShapePoints } from '../lineShape'
import { inkBounds, union, type Bounds } from './grouping'
import type { ReplacementPart } from './templates'

// Style of the consumed Ink, carried over onto the replacement parts.
export interface InkStyle {
  color: TLDefaultColorStyle
  dash: TLDefaultDashStyle
  size: TLDefaultSizeStyle
  fill: TLDefaultFillStyle
  opacity: number
}

function partBounds(part: ReplacementPart): Bounds {
  if (part.kind === 'geo') {
    return { minX: part.x, minY: part.y, maxX: part.x + part.w, maxY: part.y + part.h }
  }
  return inkBounds(part.points)
}

// Create the recipe's shapes, mapped so the recipe's bounds land exactly on
// the drawn bounds, and group them when there is more than one.
export function createIllustration(
  editor: Editor,
  parts: readonly ReplacementPart[],
  drawn: Bounds,
  style: InkStyle
): void {
  if (parts.length === 0) return
  const recipe = parts.map(partBounds).reduce(union)

  const sx = (drawn.maxX - drawn.minX) / Math.max(recipe.maxX - recipe.minX, 1e-6)
  const sy = (drawn.maxY - drawn.minY) / Math.max(recipe.maxY - recipe.minY, 1e-6)
  const mapX = (x: number) => drawn.minX + (x - recipe.minX) * sx
  const mapY = (y: number) => drawn.minY + (y - recipe.minY) * sy

  const inkStyle = { color: style.color, dash: style.dash, size: style.size }
  const ids: TLShapeId[] = []

  for (const part of parts) {
    const id = createShapeId()
    ids.push(id)
    if (part.kind === 'geo') {
      editor.createShape({
        id,
        type: 'geo',
        x: mapX(part.x),
        y: mapY(part.y),
        opacity: style.opacity,
        props: {
          geo: part.geo,
          w: Math.max(part.w * sx, 1),
          h: Math.max(part.h * sy, 1),
          ...inkStyle,
          fill: part.fill ?? style.fill,
        },
      })
      continue
    }

    const b = partBounds(part)
    const originX = mapX(b.minX)
    const originY = mapY(b.minY)
    const local = part.points.map((p) => ({
      x: mapX(p.x) - originX,
      y: mapY(p.y) - originY,
    }))

    if (part.kind === 'line') {
      editor.createShape({
        id,
        type: 'line',
        x: originX,
        y: originY,
        opacity: style.opacity,
        props: { spline: 'line', points: lineShapePoints(local), ...inkStyle },
      })
      continue
    }

    // part.kind === 'draw': a clean freehand path (curves the geo/line
    // primitives can't express), closed for filled silhouettes.
    const path = b64Vecs.encodePoints(
      local.map((p) => ({ x: p.x, y: p.y, z: 0.5 })),
      3
    )
    editor.createShape({
      id,
      type: 'draw',
      x: originX,
      y: originY,
      opacity: style.opacity,
      props: {
        segments: [{ type: 'free', path }],
        isComplete: true,
        isClosed: part.closed ?? false,
        ...inkStyle,
        fill: style.fill,
      },
    })
  }

  if (ids.length > 1) {
    // Not editor.groupShapes: that helper silently no-ops unless the
    // select tool is active, and an illustration lands mid-drawing with
    // the draw tool up. Creating the group record and reparenting is the
    // tool-independent core of the same operation.
    const groupId = createShapeId()
    editor.createShape({ id: groupId, type: 'group', x: drawn.minX, y: drawn.minY, props: {} })
    editor.reparentShapes(ids, groupId)
  }
}

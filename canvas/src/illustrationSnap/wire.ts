// Wires Illustration Snap into the editor: completed Ink strokes are grouped
// by time and proximity (grouping.ts); when a group settles, the $Q template
// recognizer runs on the group's original Ink points and — on a match —
// replaces the group with a clean composed illustration scaled to the drawn
// bounds, as a single undoable entry.
//
// Precedence design (the Shape Snap tension, resolved):
// Geometric Shape Snap stays single-stroke and runs first — a stick figure's
// head circle has already become a geo ellipse before its group settles. The
// snap wiring reports every geometric snap (source Ink id -> resulting shape
// id) via ShapeSnapOptions.onInkSnapped; the tracker records it on the
// member. Recognition always runs on the members' ORIGINAL Ink points, and a
// match consumes both the members still on the Board as Ink and the shapes
// geometric snaps made of the others. A confident illustration match
// therefore overrides earlier geometric snaps — deliberately including
// single-stroke groups, because rough clouds/documents/gears/triangles are
// routinely mis-snapped to ellipse/rectangle/diamond by the moment-based
// recognizer, while plain geometric shapes are kept out of the library by
// the $Q rejection bars (asserted by the negative fixtures).
//
// Undo contract: the whole replacement is ONE history stopping point. A
// single undo restores the pre-illustration state — remaining Ink plus any
// intermediate geometric snaps; a second undo then unwinds a member's
// geometric snap as usual.

import {
  createShapeId,
  type Editor,
  type IndexKey,
  type TLDefaultColorStyle,
  type TLDefaultDashStyle,
  type TLDefaultFillStyle,
  type TLDefaultSizeStyle,
  type TLDrawShape,
  type TLShapeId,
} from 'tldraw'
import { b64Vecs } from '@tldraw/tlschema'
import { onInkComplete } from '../shapeSnap/inkEvents'
import type { InkPoint } from '../shapeSnap/recognize'
import { createGroupTracker, GROUP_PROXIMITY_PX, type GroupMember } from './grouping'
import { recognizeIllustration, type ReplacementPart } from './templates'

// Minimum apparent (on-screen) size of the group's larger bounding-box
// dimension, in pixels — mirrors the Shape Snap gate so accidental marks
// stay Ink.
const ILLUSTRATION_MIN_SCREEN_SIZE = 40

export interface IllustrationSnapOptions {
  // Called after an Illustration Snap lands; the Bridge connects this to the
  // Shell haptic, same as Shape Snap's onSnap.
  onSnap?: () => void
  // Grouping overrides, mainly for tests.
  timeWindowMs?: number
  proximityPx?: number
  settleMs?: number
}

export interface IllustrationSnapHandle {
  // Report a geometric Shape Snap (pass as ShapeSnapOptions.onInkSnapped).
  noteInkSnapped(inkId: TLShapeId, snappedShapeId: TLShapeId): void
  dispose(): void
}

interface InkStyle {
  color: TLDefaultColorStyle
  dash: TLDefaultDashStyle
  size: TLDefaultSizeStyle
  fill: TLDefaultFillStyle
  opacity: number
}

export function wireIllustrationSnap(
  editor: Editor,
  options: IllustrationSnapOptions = {}
): IllustrationSnapHandle {
  // Style of each member's Ink, captured at completion (the draw shape may
  // be gone by settle time if geometric Shape Snap consumed it).
  const styles = new Map<string, InkStyle>()

  const tracker = createGroupTracker({
    timeWindowMs: options.timeWindowMs,
    proximityPx: options.proximityPx,
    settleMs: options.settleMs,
    onSettled: (members) => {
      // A group can settle from inside a store side effect (a far-away
      // stroke settles its predecessor during that stroke's own change);
      // defer past the transaction so the replacement is its own history
      // entry — same reason wireShapeSnap defers.
      editor.timers.setTimeout(() => {
        try {
          snapSettledGroup(editor, members, styles, options)
        } finally {
          for (const member of members) styles.delete(member.id)
        }
      }, 0)
    },
  })

  const disposeInk = onInkComplete(editor, (id, points) => {
    const shape = editor.getShape(id)
    if (!shape || shape.type !== 'draw' || shape.rotation !== 0) return
    const draw = shape as TLDrawShape
    styles.set(id, {
      color: draw.props.color,
      dash: draw.props.dash,
      size: draw.props.size,
      fill: draw.props.fill,
      opacity: draw.opacity,
    })
    const zoom = editor.getZoomLevel()
    tracker.addInk({
      id,
      // Page-space, so proximity is judged where strokes actually landed.
      points: points.map((p) => ({ x: p.x + draw.x, y: p.y + draw.y })),
      marginPx: GROUP_PROXIMITY_PX / (zoom || 1),
    })
  })

  // While a new stroke is being drawn, hold the settle timer — the group
  // shouldn't settle under the pen. addInk re-arms it on completion.
  const disposePenDown = editor.sideEffects.registerAfterCreateHandler(
    'shape',
    (shape, source) => {
      if (source !== 'user' || shape.type !== 'draw') return
      if (!(shape as TLDrawShape).props.isComplete) tracker.holdSettle()
    }
  )

  return {
    noteInkSnapped(inkId, snappedShapeId) {
      tracker.noteReplacement(inkId, snappedShapeId)
    },
    dispose() {
      disposeInk()
      disposePenDown()
      tracker.dispose()
      styles.clear()
    },
  }
}

function snapSettledGroup(
  editor: Editor,
  members: GroupMember[],
  styles: Map<string, InkStyle>,
  options: IllustrationSnapOptions
): void {
  // Only members still on the Board — as Ink or as a geometric snap's
  // result — count and get consumed. (A member erased or undone before the
  // group settled is neither matched on nor deleted.)
  const live = members.filter(
    (m) =>
      editor.getShape(m.id as TLShapeId) !== undefined ||
      (m.replacementId !== undefined &&
        editor.getShape(m.replacementId as TLShapeId) !== undefined)
  )
  if (live.length === 0) return

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const member of live) {
    for (const p of member.points) {
      if (p.x < minX) minX = p.x
      if (p.y < minY) minY = p.y
      if (p.x > maxX) maxX = p.x
      if (p.y > maxY) maxY = p.y
    }
  }
  const zoom = editor.getZoomLevel()
  if (Math.max(maxX - minX, maxY - minY) * zoom < ILLUSTRATION_MIN_SCREEN_SIZE) return

  const match = recognizeIllustration(live.map((m) => m.points))
  if (!match) return

  const style = styles.get(live[0].id) ?? {
    color: 'black' as const,
    dash: 'draw' as const,
    size: 'm' as const,
    fill: 'none' as const,
    opacity: 1,
  }

  editor.markHistoryStoppingPoint('illustration snap')
  editor.run(() => {
    for (const member of live) {
      const inkId = member.id as TLShapeId
      if (editor.getShape(inkId)) editor.deleteShape(inkId)
      const replacementId = member.replacementId as TLShapeId | undefined
      if (replacementId && editor.getShape(replacementId)) editor.deleteShape(replacementId)
    }
    const ids = createIllustration(
      editor,
      match.template.replacement,
      { minX, minY, maxX, maxY },
      style
    )
    if (ids.length > 1) {
      // Not editor.groupShapes: that helper silently no-ops unless the
      // select tool is active, and an illustration lands mid-drawing with
      // the draw tool up. Creating the group record and reparenting is the
      // tool-independent core of the same operation.
      const groupId = createShapeId()
      editor.createShape({ id: groupId, type: 'group', x: minX, y: minY, props: {} })
      editor.reparentShapes(ids, groupId)
    }
  })
  options.onSnap?.()
}

interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function partBounds(part: ReplacementPart): Box {
  if (part.kind === 'geo') {
    return { minX: part.x, minY: part.y, maxX: part.x + part.w, maxY: part.y + part.h }
  }
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of part.points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

// Create the recipe's shapes, mapped (non-uniformly) so the recipe's own
// bounds land exactly on the drawn bounds; returns the created shape ids.
function createIllustration(
  editor: Editor,
  parts: readonly ReplacementPart[],
  drawn: Box,
  style: InkStyle
): TLShapeId[] {
  let recipe: Box | undefined
  for (const part of parts) {
    const b = partBounds(part)
    recipe = recipe
      ? {
          minX: Math.min(recipe.minX, b.minX),
          minY: Math.min(recipe.minY, b.minY),
          maxX: Math.max(recipe.maxX, b.maxX),
          maxY: Math.max(recipe.maxY, b.maxY),
        }
      : b
  }
  if (!recipe) return []

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
      const points: Record<string, { id: string; index: IndexKey; x: number; y: number }> = {}
      local.forEach((p, i) => {
        // Fractional index keys sort lexicographically; recipes keep lines
        // under 10 points so a1..a9 stay ordered.
        const key = `a${i + 1}`
        points[key] = { id: key, index: key as IndexKey, x: p.x, y: p.y }
      })
      editor.createShape({
        id,
        type: 'line',
        x: originX,
        y: originY,
        opacity: style.opacity,
        props: { spline: 'line', points, ...inkStyle },
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
  return ids
}

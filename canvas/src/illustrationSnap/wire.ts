// Wires Illustration Snap into the editor: completed Ink strokes are grouped
// by time and proximity (grouping.ts); when a group settles, the $Q template
// recognizer runs on the group's original Ink points and — on a match —
// replaces the group with a clean composed illustration scaled to the drawn
// bounds (illustrate.ts), as a single undoable entry.
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

import { type Editor, type TLDrawShape, type TLShapeId } from 'tldraw'
import { onInkComplete } from '../shapeSnap/inkEvents'
import { createIllustration, type InkStyle } from './illustrate'
import {
  createGroupTracker,
  GROUP_PROXIMITY_PX,
  inkBounds,
  union,
  type GroupMember,
} from './grouping'
import { recognizeIllustration } from './templates'

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

export function wireIllustrationSnap(
  editor: Editor,
  options: IllustrationSnapOptions = {}
): IllustrationSnapHandle {
  // Style of each member's Ink, captured at completion (the draw shape may
  // be gone by settle time if geometric Shape Snap consumed it).
  const styles = new Map<TLShapeId, InkStyle>()

  const tracker = createGroupTracker<TLShapeId>({
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
  members: GroupMember<TLShapeId>[],
  styles: Map<TLShapeId, InkStyle>,
  options: IllustrationSnapOptions
): void {
  // Only members still on the Board — as Ink or as a geometric snap's
  // result — count and get consumed. (A member erased or undone before the
  // group settled is neither matched on nor deleted.)
  const live = members.filter(
    (m) =>
      editor.getShape(m.id) !== undefined ||
      (m.replacementId !== undefined && editor.getShape(m.replacementId) !== undefined)
  )
  if (live.length === 0) return

  const drawn = live.map((m) => inkBounds(m.points)).reduce(union)
  const zoom = editor.getZoomLevel()
  if (Math.max(drawn.maxX - drawn.minX, drawn.maxY - drawn.minY) * zoom < ILLUSTRATION_MIN_SCREEN_SIZE) {
    return
  }

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
      if (editor.getShape(member.id)) editor.deleteShape(member.id)
      const replacementId = member.replacementId
      if (replacementId && editor.getShape(replacementId)) editor.deleteShape(replacementId)
    }
    createIllustration(editor, match.template.replacement, drawn, style)
  })
  options.onSnap?.()
}

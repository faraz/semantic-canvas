// Multi-stroke grouping for Illustration Snap: consecutive completed Ink
// strokes close in time and space form one candidate group; when the group
// settles (no new Ink for a beat) it is handed to the recognizer.
//
// Thresholds (all overridable, mainly for tests):
// - timeWindowMs (1000): a stroke joins the open group only if it completes
//   within this window of the previous member's completion. Symbols are
//   drawn stroke-after-stroke; a second's pause reads as "done".
// - proximityPx (80): the stroke's bounds must intersect the group's union
//   bounds expanded by this margin. Strokes of one symbol overlap or nearly
//   touch (a stick figure's limbs meet the body); unrelated marks drawn
//   elsewhere on the Board do not. Callers pass page-space points, so the
//   wiring divides by zoom to keep the margin an on-screen quantity.
// - settleMs (700): idle time after the last member before the group is
//   considered finished and recognition runs. Shorter than timeWindowMs so a
//   settled group can't retroactively gain members.
//
// A stroke that breaks the time or space window settles the open group
// immediately and starts a new one. Pure module: time and timers are
// injectable; no editor dependency.

import type { InkPoint } from '../shapeSnap/recognize'

export const GROUP_TIME_WINDOW_MS = 1000
export const GROUP_PROXIMITY_PX = 80
export const GROUP_SETTLE_MS = 700

// Ids are opaque to grouping (no editor dependency); the wiring instantiates
// Id as TLShapeId so members round-trip to the editor without casts.
export interface GroupMember<Id extends string = string> {
  id: Id
  points: InkPoint[] // page-space Ink points as drawn
  completedAt: number
  // Set when geometric Shape Snap consumed this Ink and produced a shape.
  replacementId?: Id
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface GroupTrackerOptions<Id extends string = string> {
  onSettled: (members: GroupMember<Id>[]) => void
  timeWindowMs?: number
  proximityPx?: number
  settleMs?: number
  now?: () => number
  // Schedules fn after ms; returns a cancel function.
  setTimer?: (fn: () => void, ms: number) => () => void
}

export interface GroupTracker<Id extends string = string> {
  // A stroke of Ink completed; joins the open group or settles it and
  // starts a new one. marginPx overrides proximityPx for this join decision
  // (the wiring passes proximityPx / zoom so the margin stays an on-screen
  // quantity in page-space coordinates).
  addInk(member: { id: Id; points: InkPoint[]; marginPx?: number }): void
  // Record that geometric Shape Snap replaced a member's Ink with a shape.
  noteReplacement(inkId: Id, replacementId: Id): void
  // The pen touched down again: postpone settling until that stroke
  // completes (addInk re-arms the timer).
  holdSettle(): void
  // Settle the open group immediately, if any.
  flush(): void
  dispose(): void
}

// Bounding box of a stroke of Ink; shared by grouping and the illustration
// renderer (illustrate.ts).
export function inkBounds(points: readonly InkPoint[]): Bounds {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

export function union(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

function intersectsWithMargin(a: Bounds, b: Bounds, margin: number): boolean {
  return (
    a.minX - margin <= b.maxX &&
    a.maxX + margin >= b.minX &&
    a.minY - margin <= b.maxY &&
    a.maxY + margin >= b.minY
  )
}

const defaultSetTimer = (fn: () => void, ms: number): (() => void) => {
  const handle = setTimeout(fn, ms)
  return () => clearTimeout(handle)
}

export function createGroupTracker<Id extends string = string>(
  options: GroupTrackerOptions<Id>
): GroupTracker<Id> {
  const {
    onSettled,
    timeWindowMs = GROUP_TIME_WINDOW_MS,
    proximityPx = GROUP_PROXIMITY_PX,
    settleMs = GROUP_SETTLE_MS,
    now = () => Date.now(),
    setTimer = defaultSetTimer,
  } = options

  let members: GroupMember<Id>[] = []
  let groupBounds: Bounds | undefined
  let cancelTimer: (() => void) | undefined
  let disposed = false

  function clearTimer(): void {
    cancelTimer?.()
    cancelTimer = undefined
  }

  function settle(): void {
    clearTimer()
    if (members.length === 0) return
    const settled = members
    members = []
    groupBounds = undefined
    onSettled(settled)
  }

  function armTimer(): void {
    clearTimer()
    cancelTimer = setTimer(settle, settleMs)
  }

  return {
    addInk({ id, points, marginPx }) {
      if (disposed || points.length === 0) return
      const completedAt = now()
      const bounds = inkBounds(points)
      const joins =
        members.length > 0 &&
        completedAt - members[members.length - 1].completedAt <= timeWindowMs &&
        groupBounds !== undefined &&
        intersectsWithMargin(groupBounds, bounds, marginPx ?? proximityPx)
      if (!joins) settle()
      members.push({ id, points, completedAt })
      groupBounds = groupBounds ? union(groupBounds, bounds) : bounds
      armTimer()
    },
    noteReplacement(inkId, replacementId) {
      const member = members.find((m) => m.id === inkId)
      if (member) member.replacementId = replacementId
    },
    holdSettle() {
      clearTimer()
    },
    flush() {
      settle()
    },
    dispose() {
      disposed = true
      clearTimer()
      members = []
      groupBounds = undefined
    },
  }
}

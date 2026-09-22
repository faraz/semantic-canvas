// Shape Snap recognizer: classifies a completed Ink stroke and fits clean
// geometry. Pure module — no editor dependency.
//
// Adapted from Excalidraw's moment-based shape recognizer
// (packages/element/src/convertToShape.ts, MIT License, © 2020 Excalidraw):
// https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/convertToShape.ts
//
// This ticket promotes only the ellipse; rectangle and diamond prototypes are
// kept as decoys so near-rectangles are rejected as 'none' rather than
// misread as ellipses. The full-shape-set ticket promotes them to results.

export interface InkPoint {
  x: number
  y: number
}

export type RecognizedInk =
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number }
  | { kind: 'none' }

const NONE: RecognizedInk = { kind: 'none' }

// Number of points every stroke is resampled to before feature extraction.
const RESAMPLE_N = 64

// Minimum apparent (on-screen) size of the stroke's larger bounding-box
// dimension, in pixels — below this the stroke reads as an accidental mark.
const RECOGNITION_MIN_SCREEN_SIZE = 25

// A stroke whose endpoints are farther apart than this fraction of its own
// path length is open (line/arrow territory — a later ticket), not closed.
const CLOSED_GAP_MAX_RATIO = 0.15

// Maximum feature-space distance to a shape prototype, in units of the
// per-feature tolerances below. Beyond this the stroke stays Ink.
const CLOSED_SHAPE_MAX_DISTANCE = 1.5

// Half-width, in resampled points, of the chord window used to measure local
// turning along the stroke.
const TURN_WINDOW = 3

const HULL_FILL_RATIO_TOLERANCE = 0.2
const CORNER_TURN_SHARE_TOLERANCE = 0.2
const KURTOSIS_PRODUCT_TOLERANCE = 0.7

type PrototypeKind = 'rectangle' | 'diamond' | 'ellipse'

// hullFillRatio: convex hull area / bounding box area (~1 rect, ~π/4 ellipse,
// ~1/2 diamond). cornerTurnShare: share of total turning in the 4 strongest
// corner loci (~1 for quadrilaterals, ~0.55 for ellipses). kurtosisProduct:
// kurtosis along x times kurtosis along y (~1.83 rect, 2.25 ellipse, 3.24
// diamond — near-invariant to aspect ratio).
const CLOSED_SHAPE_PROTOTYPES: readonly {
  kind: PrototypeKind
  hullFillRatio: number
  cornerTurnShare: number
  kurtosisProduct: number
}[] = [
  { kind: 'rectangle', hullFillRatio: 1, cornerTurnShare: 0.95, kurtosisProduct: 1.83 },
  { kind: 'diamond', hullFillRatio: 0.5, cornerTurnShare: 0.95, kurtosisProduct: 3.24 },
  { kind: 'ellipse', hullFillRatio: Math.PI / 4, cornerTurnShare: 0.55, kurtosisProduct: 2.25 },
]

// Resample to exactly n evenly-spaced points along the stroke path, so
// features are not biased by pointer speed.
function resample(pts: readonly InkPoint[], n: number): InkPoint[] {
  let totalLen = 0
  for (let i = 1; i < pts.length; i++) {
    totalLen += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  if (totalLen === 0) return Array.from({ length: n }, () => pts[0])

  const interval = totalLen / (n - 1)
  let accumulated = 0
  const result: InkPoint[] = [pts[0]]
  let prev = pts[0]

  for (let i = 1; i < pts.length; i++) {
    const curr = pts[i]
    const segLen = Math.hypot(curr.x - prev.x, curr.y - prev.y)
    if (accumulated + segLen >= interval) {
      let remaining = interval - accumulated
      while (remaining <= segLen + 1e-10) {
        const t = remaining / segLen
        const newPt = { x: prev.x + t * (curr.x - prev.x), y: prev.y + t * (curr.y - prev.y) }
        result.push(newPt)
        if (result.length === n) return result
        prev = newPt
        accumulated = 0
        remaining += interval
      }
      accumulated = segLen - (remaining - interval)
    } else {
      accumulated += segLen
    }
    prev = curr
  }

  while (result.length < n) result.push(pts[pts.length - 1])
  return result
}

function bounds(pts: readonly InkPoint[]): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of pts) {
    if (p.x < minX) minX = p.x
    if (p.y < minY) minY = p.y
    if (p.x > maxX) maxX = p.x
    if (p.y > maxY) maxY = p.y
  }
  return { minX, minY, maxX, maxY }
}

// Andrew's monotone chain.
function convexHull(pts: readonly InkPoint[]): InkPoint[] {
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y)
  if (sorted.length <= 2) return sorted
  const cross = (o: InkPoint, a: InkPoint, b: InkPoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const lower: InkPoint[] = []
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0)
      lower.pop()
    lower.push(p)
  }
  const upper: InkPoint[] = []
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0)
      upper.pop()
    upper.push(p)
  }
  lower.pop()
  upper.pop()
  return lower.concat(upper)
}

// Shoelace.
function polygonArea(polygon: readonly InkPoint[]): number {
  let area = 0
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]
    const b = polygon[(i + 1) % polygon.length]
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

// Population kurtosis (non-excess): m4 / m2². Uniform ≈ 1.8, arcsine ≈ 1.5.
function kurtosis(values: readonly number[]): number {
  const n = values.length
  if (n === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / n
  let m2 = 0
  let m4 = 0
  for (const v of values) {
    const d = v - mean
    m2 += d * d
    m4 += d * d * d * d
  }
  m2 /= n
  m4 /= n
  return m2 > 0 ? m4 / (m2 * m2) : 0
}

// The turn angle at every resampled point, measured between the incoming and
// outgoing chords TURN_WINDOW points away. Deliberately not treated as a
// closed loop: wrap-around would let hand-drawn closure artifacts fabricate a
// corner that was never drawn.
function windowedTurns(pts: readonly InkPoint[]): number[] {
  const turns: number[] = []
  for (let i = TURN_WINDOW; i < pts.length - TURN_WINDOW; i++) {
    const a = pts[i - TURN_WINDOW]
    const b = pts[i]
    const c = pts[i + TURN_WINDOW]
    const v1x = b.x - a.x
    const v1y = b.y - a.y
    const v2x = c.x - b.x
    const v2y = c.y - b.y
    turns.push(Math.abs(Math.atan2(v1x * v2y - v1y * v2x, v1x * v2x + v1y * v2y)))
  }
  return turns
}

// Greedily picks the 4 strongest turn peaks, each absorbing its ±TURN_WINDOW
// neighborhood so one physical corner counts once.
function cornerTurnShare(pts: readonly InkPoint[]): number {
  const turns = windowedTurns(pts)
  const total = turns.reduce((sum, turn) => sum + turn, 0)
  if (total === 0) return 0

  const taken = new Array<boolean>(turns.length).fill(false)
  let top4 = 0
  for (let corner = 0; corner < 4; corner++) {
    let peak = -1
    let peakTurn = 0
    for (let i = 0; i < turns.length; i++) {
      if (!taken[i] && turns[i] > peakTurn) {
        peakTurn = turns[i]
        peak = i
      }
    }
    if (peak < 0) break
    for (let i = peak - TURN_WINDOW; i <= peak + TURN_WINDOW; i++) {
      if (i >= 0 && i < turns.length && !taken[i]) {
        top4 += turns[i]
        taken[i] = true
      }
    }
  }
  return top4 / total
}

function classifyClosedStroke(pts: readonly InkPoint[]): PrototypeKind | 'none' {
  const { minX, minY, maxX, maxY } = bounds(pts)
  const boxArea = (maxX - minX) * (maxY - minY)
  const features = {
    hullFillRatio: boxArea > 0 ? polygonArea(convexHull(pts)) / boxArea : 0,
    cornerTurnShare: cornerTurnShare(pts),
    kurtosisProduct: kurtosis(pts.map((p) => p.x)) * kurtosis(pts.map((p) => p.y)),
  }

  let best: PrototypeKind | 'none' = 'none'
  let bestDistance = CLOSED_SHAPE_MAX_DISTANCE
  for (const prototype of CLOSED_SHAPE_PROTOTYPES) {
    const distance = Math.hypot(
      (features.hullFillRatio - prototype.hullFillRatio) / HULL_FILL_RATIO_TOLERANCE,
      (features.cornerTurnShare - prototype.cornerTurnShare) / CORNER_TURN_SHARE_TOLERANCE,
      (features.kurtosisProduct - prototype.kurtosisProduct) / KURTOSIS_PRODUCT_TOLERANCE
    )
    if (distance < bestDistance) {
      bestDistance = distance
      best = prototype.kind
    }
  }
  return best
}

export function recognizeInk(
  points: readonly InkPoint[],
  { zoom = 1 }: { zoom?: number } = {}
): RecognizedInk {
  if (points.length < 3) return NONE

  const { minX, minY, maxX, maxY } = bounds(points)
  const maxDim = Math.max(maxX - minX, maxY - minY)
  if (maxDim * zoom < RECOGNITION_MIN_SCREEN_SIZE) return NONE

  const pts = resample(points, RESAMPLE_N)

  let pathLength = 0
  for (let i = 1; i < pts.length; i++) {
    pathLength += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y)
  }
  if (pathLength === 0) return NONE

  const gap = Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y)
  if (gap / pathLength > CLOSED_GAP_MAX_RATIO) {
    // Open stroke: line/arrow territory, a later ticket's scope.
    return NONE
  }

  const kind = classifyClosedStroke(pts)
  if (kind !== 'ellipse') return NONE

  return { kind: 'ellipse', x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// Shape Snap recognizer: classifies a completed Ink stroke and fits clean
// geometry. Pure module — no editor dependency.
//
// Adapted from Excalidraw's moment-based shape recognizer
// (packages/element/src/convertToShape.ts and packages/math/src/pca.ts,
// MIT License, © 2020 Excalidraw):
// https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/convertToShape.ts
//
// Closed strokes classify against rectangle/diamond/ellipse prototypes.
// Rectangle vs. diamond is deliberately NOT rotation invariant: a box drawn
// at 45° is a diamond. Open strokes classify via principal-axes statistics
// into line or arrow (an arrowhead skews the mass toward the tip).

export interface InkPoint {
  x: number
  y: number
}

export type RecognizedInk =
  | { kind: 'rectangle'; x: number; y: number; w: number; h: number }
  | { kind: 'diamond'; x: number; y: number; w: number; h: number }
  | { kind: 'ellipse'; x: number; y: number; w: number; h: number }
  | { kind: 'line'; start: InkPoint; end: InkPoint }
  | { kind: 'arrow'; start: InkPoint; end: InkPoint }
  | { kind: 'none' }

const NONE: RecognizedInk = { kind: 'none' }

// Number of points every stroke is resampled to before feature extraction.
const RESAMPLE_N = 64

// Minimum apparent (on-screen) size of the stroke's larger bounding-box
// dimension, in pixels — below this the stroke reads as an accidental mark.
const RECOGNITION_MIN_SCREEN_SIZE = 25

// A stroke whose endpoints are farther apart than this fraction of its own
// path length is open (line/arrow), not closed (rectangle/diamond/ellipse).
const CLOSED_GAP_MAX_RATIO = 0.15

// Maximum elongation for an open stroke to count as straight.
const LINEAR_MAX_ELONGATION = 0.25

// Fraction of the start→tip distance around the tip inside which an arrowhead
// may live: points there are exempt from the shaft straightness check.
const ARROWHEAD_ZONE_RATIO = 0.5

// Maximum distance any point outside the arrowhead zone may stray from the
// start→tip chord, as a fraction of the chord length. Loose enough for a lazy
// bow or a small squiggle, tight enough to reject elbows, arcs and sawtooths
// that only *statistically* look straight.
const LINEAR_MAX_SHAFT_DEVIATION = 0.15

// Minimum |skew| along the major axis for an open, straight stroke to be an
// arrow rather than a plain line. An arrowhead adds "mass" -> skews that way.
const ARROW_MIN_SKEW = 0.3

// Minimum apparent (on-screen) chord length, in pixels, for a recognized
// arrow to stay an arrow; anything shorter demotes to a line (an arrowhead
// on a stub looks wrong). Excalidraw compares its 60 against scene units;
// we screen-scale it, consistent with RECOGNITION_MIN_SCREEN_SIZE.
const ARROW_MIN_SCREEN_LENGTH = 60

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

// The order-th standardized moment of a sample (standardized by sigma), 0 for
// a degenerate (zero variance) sample.
function standardizedMoment(values: readonly number[], order: number): number {
  const n = values.length
  if (n === 0) return 0
  let mean = 0
  for (const v of values) mean += v
  mean /= n

  let variance = 0
  let moment = 0
  for (const v of values) {
    const d = v - mean
    variance += d * d
    moment += d ** order
  }
  variance /= n
  moment /= n

  const sigma = Math.sqrt(variance)
  return sigma > Number.EPSILON ? moment / sigma ** order : 0
}

// Third standardized moment: how lopsided a sample is.
function skewness(values: readonly number[]): number {
  return standardizedMoment(values, 3)
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

// The principal axes of a point set: the eigen decomposition of its 2x2
// covariance matrix. `major` is the unit direction of largest variance.
interface PrincipalAxes {
  centroid: InkPoint
  major: { x: number; y: number }
  minor: { x: number; y: number }
  majorVariance: number
  minorVariance: number
}

function principalAxes(pts: readonly InkPoint[]): PrincipalAxes {
  let cx = 0
  let cy = 0
  for (const p of pts) {
    cx += p.x
    cy += p.y
  }
  cx /= pts.length
  cy /= pts.length

  let m20 = 0
  let m02 = 0
  let m11 = 0
  for (const p of pts) {
    const dx = p.x - cx
    const dy = p.y - cy
    m20 += dx * dx
    m02 += dy * dy
    m11 += dx * dy
  }
  m20 /= pts.length
  m02 /= pts.length
  m11 /= pts.length

  // Eigenvalues of [[m20, m11], [m11, m02]].
  const trace = m20 + m02
  const diff = Math.hypot(m20 - m02, 2 * m11)
  const majorVariance = (trace + diff) / 2
  const minorVariance = (trace - diff) / 2

  // Eigenvector for the larger eigenvalue. When m11 is 0 the covariance is
  // already diagonal and the axes are the coordinate axes.
  let major: { x: number; y: number }
  if (Math.abs(m11) > Number.EPSILON) {
    const len = Math.hypot(majorVariance - m02, m11)
    major = { x: (majorVariance - m02) / len, y: m11 / len }
  } else {
    major = m20 >= m02 ? { x: 1, y: 0 } : { x: 0, y: 1 }
  }

  return {
    centroid: { x: cx, y: cy },
    major,
    minor: { x: -major.y, y: major.x },
    majorVariance,
    minorVariance,
  }
}

// Project points onto the major axis, relative to the centroid.
function majorCoords(pts: readonly InkPoint[], axes: PrincipalAxes): number[] {
  const { centroid, major } = axes
  return pts.map((p) => (p.x - centroid.x) * major.x + (p.y - centroid.y) * major.y)
}

// Flip the major axis so that it points toward the denser end of the point
// cloud, resolving the 180° sign ambiguity of the eigenvector. The major-axis
// skew is therefore <= 0 by construction.
function orientPrincipalAxes(pts: readonly InkPoint[], axes: PrincipalAxes): PrincipalAxes {
  if (skewness(majorCoords(pts, axes)) <= 0) return axes
  const major = { x: -axes.major.x, y: -axes.major.y }
  return { ...axes, major, minor: { x: -major.y, y: major.x } }
}

// Ratio of the minor to the major variance in [0, 1]: 0 is a perfectly
// straight stroke, 1 a stroke with no preferred direction.
function elongation(axes: PrincipalAxes): number {
  return axes.majorVariance > 0 ? axes.minorVariance / axes.majorVariance : 1
}

function distanceToSegment(p: InkPoint, a: InkPoint, b: InkPoint): number {
  const abx = b.x - a.x
  const aby = b.y - a.y
  const lenSq = abx * abx + aby * aby
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y)
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq))
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby))
}

// How far the stroke strays from the straight chord between its start and its
// farthest point ("tip"), as a fraction of that chord's length — points within
// ARROWHEAD_ZONE_RATIO of the tip are exempt, so an arrowhead doesn't count
// as straying. ~0 for a line or arrow however wobbly, large for elbows, arcs
// and sawtooths, whose point-cloud statistics alone can still look line-like.
function shaftDeviationRatio(pts: readonly InkPoint[]): number {
  const start = pts[0]
  let tip = start
  let tipDistance = 0
  for (const point of pts) {
    const distance = Math.hypot(point.x - start.x, point.y - start.y)
    if (distance > tipDistance) {
      tipDistance = distance
      tip = point
    }
  }
  if (tipDistance === 0) return 0

  let maxDeviation = 0
  for (const point of pts) {
    const tipDist = Math.hypot(point.x - tip.x, point.y - tip.y)
    if (tipDist <= ARROWHEAD_ZONE_RATIO * tipDistance) continue
    maxDeviation = Math.max(maxDeviation, distanceToSegment(point, start, tip))
  }
  return maxDeviation / tipDistance
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

function classifyClosedInk(pts: readonly InkPoint[]): PrototypeKind | 'none' {
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

// When an arrow is recognized, the last input point may not be the actual
// tip (the pen doubles back over the arrowhead). The ideal tip lies on the
// bounding-box perimeter, at the perimeter point farthest from the start; the
// returned tip is the original input point nearest that ideal.
function getArrowEndpoint(points: readonly InkPoint[], start: InkPoint): InkPoint {
  const { minX, minY, maxX, maxY } = bounds(points)
  const w = maxX - minX
  const h = maxY - minY

  // Degenerate bounding box — fall back to the last point.
  if (w === 0 && h === 0) return points[points.length - 1]

  // 4 corners + 4 edge midpoints give good coverage of the perimeter.
  const midX = (minX + maxX) / 2
  const midY = (minY + maxY) / 2
  const perimeterPoints: InkPoint[] = [
    { x: minX, y: minY },
    { x: midX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: midY },
    { x: maxX, y: maxY },
    { x: midX, y: maxY },
    { x: minX, y: maxY },
    { x: minX, y: midY },
  ]

  let idealDist = -1
  let ideal = perimeterPoints[4]
  for (const pp of perimeterPoints) {
    const d = Math.hypot(pp.x - start.x, pp.y - start.y)
    if (d > idealDist) {
      idealDist = d
      ideal = pp
    }
  }

  let bestDist = Infinity
  let best = points[points.length - 1]
  for (const pt of points) {
    const d = Math.hypot(pt.x - ideal.x, pt.y - ideal.y)
    if (d < bestDist) {
      bestDist = d
      best = pt
    }
  }
  return best
}

// An open stroke is a line or an arrow, provided it is straight enough; the
// arrowhead is what makes the point distribution lopsided. Endpoints come
// from the original input points, not the resampled ones.
function classifyOpenInk(
  points: readonly InkPoint[],
  pts: readonly InkPoint[],
  zoom: number
): RecognizedInk {
  const axes = orientPrincipalAxes(pts, principalAxes(pts))
  if (elongation(axes) > LINEAR_MAX_ELONGATION) return NONE
  if (shaftDeviationRatio(pts) > LINEAR_MAX_SHAFT_DEVIATION) return NONE

  const majorSkew = skewness(majorCoords(pts, axes))
  const start = points[0]
  if (Math.abs(majorSkew) >= ARROW_MIN_SKEW) {
    const tip = getArrowEndpoint(points, start)
    const chord = Math.hypot(tip.x - start.x, tip.y - start.y)
    // Too short for an arrowhead to read well — demote to a line ending at
    // the tip (matching Excalidraw, which keeps the arrow's endpoint).
    if (chord * zoom < ARROW_MIN_SCREEN_LENGTH) {
      return { kind: 'line', start, end: tip }
    }
    return { kind: 'arrow', start, end: tip }
  }
  return { kind: 'line', start, end: points[points.length - 1] }
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
    return classifyOpenInk(points, pts, zoom)
  }

  const kind = classifyClosedInk(pts)
  if (kind === 'none') return NONE

  return { kind, x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

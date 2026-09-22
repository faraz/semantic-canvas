// Deterministic synthetic Ink for recognizer tests. Real device
// fixtures (recorded via the stroke capture path) live in fixtures/*.json.
import type { InkPoint } from './recognize'

// mulberry32 — tiny seeded PRNG so strokes are stable across runs.
export function seededRandom(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function roughEllipse({
  cx,
  cy,
  rx,
  ry,
  jitter = 0,
  gap = 0.1,
  seed = 1,
  n = 48,
}: {
  cx: number
  cy: number
  rx: number
  ry: number
  jitter?: number
  gap?: number
  seed?: number
  n?: number
}): InkPoint[] {
  const rand = seededRandom(seed)
  const start = rand() * Math.PI * 2
  const sweep = Math.PI * 2 * (1 - gap)
  const points: InkPoint[] = []
  for (let i = 0; i < n; i++) {
    const a = start + (sweep * i) / (n - 1)
    points.push({
      x: cx + rx * Math.cos(a) + (rand() - 0.5) * 2 * jitter,
      y: cy + ry * Math.sin(a) + (rand() - 0.5) * 2 * jitter,
    })
  }
  return points
}

export function roughRectangle({
  x,
  y,
  w,
  h,
  jitter = 0,
  seed = 1,
  perSide = 12,
}: {
  x: number
  y: number
  w: number
  h: number
  jitter?: number
  seed?: number
  perSide?: number
}): InkPoint[] {
  const rand = seededRandom(seed)
  const corners = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
    [x, y],
  ]
  const points: InkPoint[] = []
  for (let side = 0; side < 4; side++) {
    const [ax, ay] = corners[side]
    const [bx, by] = corners[side + 1]
    for (let i = 0; i < perSide; i++) {
      const t = i / perSide
      points.push({
        x: ax + (bx - ax) * t + (rand() - 0.5) * 2 * jitter,
        y: ay + (by - ay) * t + (rand() - 0.5) * 2 * jitter,
      })
    }
  }
  points.push({ x, y })
  return points
}

// Corner-drawn box: vertices at the bounding box's edge midpoints, i.e. a
// square/rectangle rotated 45° — the deliberate diamond gesture. With w === h
// this is exactly a box drawn at 45°.
export function roughDiamond({
  x,
  y,
  w,
  h,
  jitter = 0,
  seed = 1,
  perSide = 12,
}: {
  x: number
  y: number
  w: number
  h: number
  jitter?: number
  seed?: number
  perSide?: number
}): InkPoint[] {
  const rand = seededRandom(seed)
  const corners = [
    [x + w / 2, y],
    [x + w, y + h / 2],
    [x + w / 2, y + h],
    [x, y + h / 2],
    [x + w / 2, y],
  ]
  const points: InkPoint[] = []
  for (let side = 0; side < 4; side++) {
    const [ax, ay] = corners[side]
    const [bx, by] = corners[side + 1]
    for (let i = 0; i < perSide; i++) {
      const t = i / perSide
      points.push({
        x: ax + (bx - ax) * t + (rand() - 0.5) * 2 * jitter,
        y: ay + (by - ay) * t + (rand() - 0.5) * 2 * jitter,
      })
    }
  }
  points.push({ x: x + w / 2, y })
  return points
}

// A hand-drawn arrow as one polyline: shaft from (x1,y1) to the tip (x2,y2),
// then — without lifting the pen — one wing out, back over the tip, and the
// other wing out. headLength defaults to a quarter of the shaft.
export function roughArrow({
  x1,
  y1,
  x2,
  y2,
  headLength,
  headAngle = Math.PI / 6,
  jitter = 0,
  seed = 1,
  perSeg = 8,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  headLength?: number
  headAngle?: number
  jitter?: number
  seed?: number
  perSeg?: number
}): InkPoint[] {
  const rand = seededRandom(seed)
  const shaftLen = Math.hypot(x2 - x1, y2 - y1)
  const head = headLength ?? shaftLen / 4
  const back = Math.atan2(y1 - y2, x1 - x2)
  const wing = (side: 1 | -1): InkPoint => ({
    x: x2 + head * Math.cos(back + side * headAngle),
    y: y2 + head * Math.sin(back + side * headAngle),
  })
  const tip = { x: x2, y: y2 }
  const waypoints: [InkPoint, InkPoint, number][] = [
    [{ x: x1, y: y1 }, tip, perSeg * 3],
    [tip, wing(1), perSeg],
    [wing(1), tip, perSeg],
    [tip, wing(-1), perSeg],
  ]
  const points: InkPoint[] = []
  for (const [a, b, n] of waypoints) {
    for (let i = 0; i < n; i++) {
      const t = i / n
      points.push({
        x: a.x + (b.x - a.x) * t + (rand() - 0.5) * 2 * jitter,
        y: a.y + (b.y - a.y) * t + (rand() - 0.5) * 2 * jitter,
      })
    }
  }
  points.push(wing(-1))
  return points
}

export function straightLine({
  x1,
  y1,
  x2,
  y2,
  jitter = 0,
  seed = 1,
  n = 32,
}: {
  x1: number
  y1: number
  x2: number
  y2: number
  jitter?: number
  seed?: number
  n?: number
}): InkPoint[] {
  const rand = seededRandom(seed)
  const points: InkPoint[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    points.push({
      x: x1 + (x2 - x1) * t + (rand() - 0.5) * 2 * jitter,
      y: y1 + (y2 - y1) * t + (rand() - 0.5) * 2 * jitter,
    })
  }
  return points
}

// Handwriting-ish squiggle: advances left to right while looping up and down,
// like a scrawled word. Open like a line, but far too bendy to be one.
export function handwritingWiggle({
  x,
  y,
  width,
  amplitude = 40,
  loops = 4,
  seed = 1,
  n = 64,
}: {
  x: number
  y: number
  width: number
  amplitude?: number
  loops?: number
  seed?: number
  n?: number
}): InkPoint[] {
  const rand = seededRandom(seed)
  const points: InkPoint[] = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    points.push({
      x: x + width * t + (rand() - 0.5) * 4,
      y: y + amplitude * Math.sin(t * loops * Math.PI * 2) + (rand() - 0.5) * 4,
    })
  }
  return points
}

export function zigzagScribble({
  x,
  y,
  width,
  height,
  zigzags = 6,
  seed = 1,
}: {
  x: number
  y: number
  width: number
  height: number
  zigzags?: number
  seed?: number
}): InkPoint[] {
  const rand = seededRandom(seed)
  const points: InkPoint[] = []
  const n = zigzags * 8
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    points.push({
      x: x + width * t + (rand() - 0.5) * 6,
      y: y + (i % 2 === 0 ? 0 : height) + (rand() - 0.5) * 6,
    })
  }
  return points
}

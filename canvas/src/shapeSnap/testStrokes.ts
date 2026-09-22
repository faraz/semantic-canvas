// Deterministic synthetic Ink strokes for recognizer tests. Real device
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

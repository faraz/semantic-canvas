// The $Q Super-Quick point-cloud recognizer, ported to TypeScript for
// Illustration Snap. Pure module — no editor dependency. Multistroke-capable
// and articulation-invariant: stroke order and stroke direction don't matter,
// because gestures are matched as point clouds.
//
// Ported from the official JavaScript version:
// https://depts.washington.edu/acelab/proj/dollar/qdollar.js
//
// The academic publication for the $Q recognizer, and what should be used to
// cite it, is:
//
//   Vatavu, R.-D., Anthony, L. and Wobbrock, J.O. (2018). $Q: A super-quick,
//   articulation-invariant stroke-gesture recognizer for low-resource devices.
//   Proceedings of the ACM Conference on Human-Computer Interaction with
//   Mobile Devices and Services (MobileHCI '18). Barcelona, Spain
//   (September 3-6, 2018). New York: ACM Press. Article No. 23.
//   https://dl.acm.org/citation.cfm?id=3229434.3229465
//
// This software is distributed under the "New BSD License" agreement:
//
// Copyright (c) 2018-2019, Nathan Magrofuoco, Jacob O. Wobbrock,
// Radu-Daniel Vatavu, and Lisa Anthony. All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//   * Redistributions of source code must retain the above copyright
//     notice, this list of conditions and the following disclaimer.
//   * Redistributions in binary form must reproduce the above copyright
//     notice, this list of conditions and the following disclaimer in the
//     documentation and/or other materials provided with the distribution.
//   * Neither the names of the University Stefan cel Mare of Suceava,
//     University of Washington, nor University of Florida, nor the names of
//     its contributors may be used to endorse or promote products derived
//     from this software without specific prior written permission.
//
// THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS
// IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO,
// THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR
// PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL Radu-Daniel Vatavu OR Lisa
// Anthony OR Jacob O. Wobbrock BE LIABLE FOR ANY DIRECT, INDIRECT,
// INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
// NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
// DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
// THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
// (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF
// THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
//
// Port notes (deviations from the reference, all mechanical):
// - TypeScript types; strokes come in as InkPoint[][] instead of flat
//   Point arrays with stroke IDs (IDs are assigned internally).
// - resample() copies its input; the reference splices interpolated points
//   into the caller's array.
// - Degenerate input (no points, single point, zero path length, zero size)
//   is guarded to return a fixed cloud instead of dividing by zero; the
//   recognizer never throws.
// - recognize() returns the raw greedy cloud distance alongside the
//   reference's score (1/distance capped at 1), so callers can apply a
//   rejection threshold; the reference always returns its best match.
// - LUT indices are clamped to the table size as a float-safety guard.
// The algorithm itself — cloud size 32, 64x64 LUT lower bounds, early
// abandoning, greedy weighted matching in both directions — is unchanged.

import type { InkPoint } from '../shapeSnap/recognize'

interface QPoint {
  x: number
  y: number
  id: number // stroke ID to which this point belongs (1,2,3,...)
  intX: number // for indexing into the LUT
  intY: number
}

const NUM_POINTS = 32
const MAX_INT_COORD = 1024 // (intX, intY) range from [0, MAX_INT_COORD - 1]
const LUT_SIZE = 64 // lookup table is LUT_SIZE x LUT_SIZE
const LUT_SCALE_FACTOR = MAX_INT_COORD / LUT_SIZE

interface PointCloud {
  name: string
  points: QPoint[]
  lut: number[][]
}

export interface QMatch {
  // Name of the best-matching template, or null when there are no templates
  // to match against.
  name: string | null
  // Raw greedy cloud distance to that template (lower is better, 0 exact).
  distance: number
  // The reference implementation's score: 1/distance, capped at 1.
  score: number
}

function qPoint(x: number, y: number, id: number): QPoint {
  return { x, y, id, intX: 0, intY: 0 }
}

function sqrEuclideanDistance(a: QPoint, b: QPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  return dx * dx + dy * dy
}

function euclideanDistance(a: QPoint, b: QPoint): number {
  return Math.sqrt(sqrEuclideanDistance(a, b))
}

function pathLength(points: readonly QPoint[]): number {
  let d = 0
  for (let i = 1; i < points.length; i++) {
    if (points[i].id === points[i - 1].id) d += euclideanDistance(points[i - 1], points[i])
  }
  return d
}

function resample(input: readonly QPoint[], n: number): QPoint[] {
  const points = input.map((p) => ({ ...p })) // the reference mutates; we copy
  const interval = pathLength(points) / (n - 1)
  if (!(interval > 0)) {
    // Degenerate: a dot (or a set of dots). Every resampled point is the
    // first input point.
    return Array.from({ length: n }, () => ({ ...points[0] }))
  }
  let d = 0
  const newPoints: QPoint[] = [{ ...points[0] }]
  for (let i = 1; i < points.length; i++) {
    if (points[i].id === points[i - 1].id) {
      const dist = euclideanDistance(points[i - 1], points[i])
      if (d + dist >= interval) {
        const t = (interval - d) / dist
        const q = qPoint(
          points[i - 1].x + t * (points[i].x - points[i - 1].x),
          points[i - 1].y + t * (points[i].y - points[i - 1].y),
          points[i].id
        )
        newPoints.push({ ...q })
        points.splice(i, 0, q) // 'q' will be the next points[i]
        d = 0
      } else {
        d += dist
      }
    }
  }
  // Sometimes we fall a rounding-error short of adding the last point.
  if (newPoints.length === n - 1) {
    newPoints.push({ ...points[points.length - 1] })
  }
  // Float-safety guard beyond the reference: force exactly n points.
  while (newPoints.length < n) newPoints.push({ ...newPoints[newPoints.length - 1] })
  newPoints.length = n
  return newPoints
}

function scale(points: readonly QPoint[]): QPoint[] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  const size = Math.max(maxX - minX, maxY - minY) || 1 // guard: all-coincident points
  return points.map((p) => qPoint((p.x - minX) / size, (p.y - minY) / size, p.id))
}

function translateToOrigin(points: readonly QPoint[]): QPoint[] {
  let cx = 0
  let cy = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
  }
  cx /= points.length
  cy /= points.length
  return points.map((p) => qPoint(p.x - cx, p.y - cy, p.id))
}

function makeIntCoords(points: QPoint[]): QPoint[] {
  for (const p of points) {
    p.intX = Math.round(((p.x + 1) / 2) * (MAX_INT_COORD - 1))
    p.intY = Math.round(((p.y + 1) / 2) * (MAX_INT_COORD - 1))
  }
  return points
}

// Clamped LUT cell index (the reference can hit LUT_SIZE at the very edge).
function lutIndex(intCoord: number): number {
  return Math.min(LUT_SIZE - 1, Math.max(0, Math.round(intCoord / LUT_SCALE_FACTOR)))
}

function computeLUT(points: readonly QPoint[]): number[][] {
  const lut: number[][] = []
  for (let x = 0; x < LUT_SIZE; x++) {
    lut.push(new Array<number>(LUT_SIZE))
    for (let y = 0; y < LUT_SIZE; y++) {
      let u = -1
      let b = Infinity
      for (let i = 0; i < points.length; i++) {
        const row = lutIndex(points[i].intX)
        const col = lutIndex(points[i].intY)
        const d = (row - x) * (row - x) + (col - y) * (col - y)
        if (d < b) {
          b = d
          u = i
        }
      }
      lut[x][y] = u
    }
  }
  return lut
}

function makePointCloud(name: string, rawPoints: readonly QPoint[]): PointCloud {
  let points = resample(rawPoints, NUM_POINTS)
  points = scale(points)
  points = translateToOrigin(points)
  points = makeIntCoords(points)
  return { name, points, lut: computeLUT(points) }
}

function computeLowerBound(
  pts1: readonly QPoint[],
  pts2: readonly QPoint[],
  step: number,
  lut: readonly number[][]
): number[] {
  const n = pts1.length
  const lb = new Array<number>(Math.floor(n / step) + 1)
  const sat = new Array<number>(n)
  lb[0] = 0
  for (let i = 0; i < n; i++) {
    const x = lutIndex(pts1[i].intX)
    const y = lutIndex(pts1[i].intY)
    const index = lut[x][y]
    const d = sqrEuclideanDistance(pts1[i], pts2[index])
    sat[i] = i === 0 ? d : sat[i - 1] + d
    lb[0] += (n - i) * d
  }
  for (let i = step, j = 1; i < n; i += step, j++) {
    lb[j] = lb[0] + i * sat[n - 1] - n * sat[i - 1]
  }
  return lb
}

function cloudDistance(
  pts1: readonly QPoint[],
  pts2: readonly QPoint[],
  start: number,
  minSoFar: number
): number {
  const n = pts1.length
  const unmatched: number[] = [] // indices for pts2 that are not matched
  for (let j = 0; j < n; j++) unmatched.push(j)
  let i = start // start matching with point 'start' from pts1
  let weight = n // weights decrease from n to 1
  let sum = 0 // sum distance between the two clouds
  do {
    let u = -1
    let b = Infinity
    for (let j = 0; j < unmatched.length; j++) {
      const d = sqrEuclideanDistance(pts1[i], pts2[unmatched[j]])
      if (d < b) {
        b = d
        u = j
      }
    }
    unmatched.splice(u, 1)
    sum += weight * b
    if (sum >= minSoFar) return sum // early abandoning
    weight--
    i = (i + 1) % n
  } while (i !== start)
  return sum
}

function cloudMatch(candidate: PointCloud, template: PointCloud, minSoFar: number): number {
  const n = candidate.points.length
  const step = Math.floor(Math.pow(n, 0.5))

  const lb1 = computeLowerBound(candidate.points, template.points, step, template.lut)
  const lb2 = computeLowerBound(template.points, candidate.points, step, candidate.lut)

  for (let i = 0, j = 0; i < n; i += step, j++) {
    if (lb1[j] < minSoFar) {
      minSoFar = Math.min(minSoFar, cloudDistance(candidate.points, template.points, i, minSoFar))
    }
    if (lb2[j] < minSoFar) {
      minSoFar = Math.min(minSoFar, cloudDistance(template.points, candidate.points, i, minSoFar))
    }
  }
  return minSoFar
}

// Flatten strokes into the reference's flat point list with 1-based stroke
// IDs, dropping empty strokes and non-finite points (never-throws guarantee).
function toQPoints(strokes: readonly (readonly InkPoint[])[]): QPoint[] {
  const points: QPoint[] = []
  let id = 0
  for (const stroke of strokes) {
    let started = false
    for (const p of stroke) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
      if (!started) {
        id++
        started = true
      }
      points.push(qPoint(p.x, p.y, id))
    }
  }
  return points
}

export class QDollarRecognizer {
  private readonly clouds: PointCloud[] = []

  // Register a template gesture from one or more Ink strokes. Multiple
  // templates may share a name (several examples of the same symbol).
  addTemplate(name: string, strokes: readonly (readonly InkPoint[])[]): void {
    const points = toQPoints(strokes)
    if (points.length === 0) return
    this.clouds.push(makePointCloud(name, points))
  }

  // Match candidate strokes against every template; returns the best match
  // with its raw greedy cloud distance. Never throws — degenerate input
  // yields a (typically distant) match or name: null with no templates.
  // `eligible` (an extension over the reference) restricts which template
  // names may compete, e.g. to gate templates on candidate stroke count.
  recognize(
    strokes: readonly (readonly InkPoint[])[],
    eligible: (name: string) => boolean = () => true
  ): QMatch {
    const points = toQPoints(strokes)
    if (points.length === 0 || this.clouds.length === 0) {
      return { name: null, distance: Infinity, score: 0 }
    }
    const candidate = makePointCloud('', points)

    let u = -1
    let b = Infinity
    for (let i = 0; i < this.clouds.length; i++) {
      if (!eligible(this.clouds[i].name)) continue
      const d = cloudMatch(candidate, this.clouds[i], b)
      if (d < b) {
        b = d
        u = i
      }
    }
    if (u === -1) return { name: null, distance: Infinity, score: 0 }
    return { name: this.clouds[u].name, distance: b, score: b > 1 ? 1 / b : 1 }
  }
}

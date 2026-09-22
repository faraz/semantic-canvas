import { describe, expect, it } from 'vitest'
import { recognizeInk, type InkPoint } from './recognize'
import { roughEllipse, roughRectangle, straightLine, zigzagScribble } from './testInk'

describe('recognizeInk — ellipse', () => {
  it('recognizes a clean circle', () => {
    const result = recognizeInk(roughEllipse({ cx: 200, cy: 200, rx: 80, ry: 80 }))
    expect(result.kind).toBe('ellipse')
  })

  it('recognizes a hand-jittered circle with an open gap', () => {
    const result = recognizeInk(
      roughEllipse({ cx: 150, cy: 300, rx: 90, ry: 85, jitter: 5, gap: 0.08, seed: 7 })
    )
    expect(result.kind).toBe('ellipse')
  })

  it('recognizes a non-circular ellipse', () => {
    const result = recognizeInk(
      roughEllipse({ cx: 400, cy: 120, rx: 140, ry: 60, jitter: 4, seed: 3 })
    )
    expect(result.kind).toBe('ellipse')
  })

  it('fits the ellipse to the stroke bounding box', () => {
    const points = roughEllipse({ cx: 200, cy: 200, rx: 80, ry: 50, jitter: 0, gap: 0.02 })
    const result = recognizeInk(points)
    expect(result.kind).toBe('ellipse')
    if (result.kind !== 'ellipse') return
    expect(result.x).toBeCloseTo(120, 0)
    expect(result.y).toBeCloseTo(150, 0)
    expect(result.w).toBeCloseTo(160, 0)
    expect(result.h).toBeCloseTo(100, 0)
  })
})

describe('recognizeInk — stays Ink', () => {
  it('rejects a rectangle (no false ellipse)', () => {
    const result = recognizeInk(
      roughRectangle({ x: 100, y: 100, w: 200, h: 150, jitter: 4, seed: 2 })
    )
    expect(result.kind).toBe('none')
  })

  it('rejects a straight line (open stroke)', () => {
    const result = recognizeInk(straightLine({ x1: 0, y1: 0, x2: 300, y2: 120, jitter: 3 }))
    expect(result.kind).toBe('none')
  })

  it('rejects a zigzag scribble', () => {
    const result = recognizeInk(
      zigzagScribble({ x: 50, y: 50, width: 250, height: 80, seed: 5 })
    )
    expect(result.kind).toBe('none')
  })

  it('rejects a tiny stroke below the min screen size', () => {
    const result = recognizeInk(roughEllipse({ cx: 10, cy: 10, rx: 8, ry: 8 }))
    expect(result.kind).toBe('none')
  })

  it('respects zoom: the same small stroke recognizes when zoomed in', () => {
    const points = roughEllipse({ cx: 10, cy: 10, rx: 8, ry: 8 })
    expect(recognizeInk(points, { zoom: 4 }).kind).toBe('ellipse')
  })
})

describe('recognizeInk — never throws', () => {
  const degenerates: [string, InkPoint[]][] = [
    ['empty', []],
    ['single point', [{ x: 5, y: 5 }]],
    ['two identical points', [{ x: 5, y: 5 }, { x: 5, y: 5 }]],
    [
      'many identical points',
      Array.from({ length: 50 }, () => ({ x: 42, y: 42 })),
    ],
    [
      'collinear duplicates',
      Array.from({ length: 50 }, (_, i) => ({ x: i % 2, y: i % 2 })),
    ],
  ]

  for (const [name, points] of degenerates) {
    it(`handles ${name}`, () => {
      expect(() => recognizeInk(points)).not.toThrow()
      expect(recognizeInk(points).kind).toBe('none')
    })
  }
})

describe('recognizeInk — recorded fixtures', () => {
  const fixtures = import.meta.glob<{
    name: string
    expected: string
    points: InkPoint[]
  }>('./fixtures/*.json', { eager: true, import: 'default' })

  const entries = Object.entries(fixtures)
  it.skipIf(entries.length > 0)('no recorded fixtures yet (add via stroke capture)', () => {
    expect(entries).toHaveLength(0)
  })

  for (const [path, fixture] of entries) {
    it(`${fixture.name ?? path} → ${fixture.expected}`, () => {
      expect(recognizeInk(fixture.points).kind).toBe(fixture.expected)
    })
  }
})

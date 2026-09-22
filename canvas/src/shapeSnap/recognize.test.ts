import { describe, expect, it } from 'vitest'
import { recognizeInk, type InkPoint } from './recognize'
import {
  handwritingWiggle,
  roughArrow,
  roughDiamond,
  roughEllipse,
  roughRectangle,
  straightLine,
  zigzagScribble,
} from './testInk'

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

describe('recognizeInk — rectangle', () => {
  it('recognizes a clean box', () => {
    const result = recognizeInk(roughRectangle({ x: 100, y: 100, w: 200, h: 150 }))
    expect(result.kind).toBe('rectangle')
  })

  it('recognizes a hand-jittered box', () => {
    const result = recognizeInk(
      roughRectangle({ x: 100, y: 100, w: 200, h: 150, jitter: 4, seed: 2 })
    )
    expect(result.kind).toBe('rectangle')
  })

  it('fits the rectangle to the stroke bounding box', () => {
    const result = recognizeInk(roughRectangle({ x: 40, y: 60, w: 220, h: 120 }))
    expect(result.kind).toBe('rectangle')
    if (result.kind !== 'rectangle') return
    expect(result.x).toBeCloseTo(40, 0)
    expect(result.y).toBeCloseTo(60, 0)
    expect(result.w).toBeCloseTo(220, 0)
    expect(result.h).toBeCloseTo(120, 0)
  })
})

describe('recognizeInk — diamond', () => {
  it('recognizes a corner-drawn diamond', () => {
    const result = recognizeInk(
      roughDiamond({ x: 100, y: 100, w: 240, h: 160, jitter: 3, seed: 6 })
    )
    expect(result.kind).toBe('diamond')
  })

  it('reads a box drawn at 45° as a diamond, not a rectangle', () => {
    // A square whose vertices sit on the bbox edge midpoints IS a 45° box.
    const result = recognizeInk(roughDiamond({ x: 100, y: 100, w: 200, h: 200 }))
    expect(result.kind).toBe('diamond')
  })

  it('fits the diamond to the stroke bounding box', () => {
    const result = recognizeInk(roughDiamond({ x: 80, y: 40, w: 200, h: 140 }))
    expect(result.kind).toBe('diamond')
    if (result.kind !== 'diamond') return
    expect(result.x).toBeCloseTo(80, 0)
    expect(result.y).toBeCloseTo(40, 0)
    expect(result.w).toBeCloseTo(200, 0)
    expect(result.h).toBeCloseTo(140, 0)
  })
})

describe('recognizeInk — line', () => {
  it('recognizes a straight stroke as a line with the drawn endpoints', () => {
    const result = recognizeInk(straightLine({ x1: 0, y1: 0, x2: 300, y2: 120, jitter: 3 }))
    expect(result.kind).toBe('line')
    if (result.kind !== 'line') return
    expect(result.start.x).toBeCloseTo(0, -1)
    expect(result.start.y).toBeCloseTo(0, -1)
    expect(result.end.x).toBeCloseTo(300, -1)
    expect(result.end.y).toBeCloseTo(120, -1)
  })

  it('recognizes a wobbly vertical line', () => {
    const result = recognizeInk(
      straightLine({ x1: 150, y1: 40, x2: 158, y2: 340, jitter: 5, seed: 11 })
    )
    expect(result.kind).toBe('line')
  })

  it('demotes a short arrow to a line ending at the drawn tip', () => {
    const result = recognizeInk(
      roughArrow({ x1: 100, y1: 100, x2: 145, y2: 100, jitter: 1, seed: 3 })
    )
    expect(result.kind).toBe('line')
    if (result.kind !== 'line') return
    expect(result.end.x).toBeCloseTo(145, -1)
    expect(result.end.y).toBeCloseTo(100, -1)
  })
})

describe('recognizeInk — arrow', () => {
  it('recognizes a rightward arrow with the tip at the drawn head', () => {
    const result = recognizeInk(
      roughArrow({ x1: 100, y1: 200, x2: 340, y2: 200, jitter: 2, seed: 5 })
    )
    expect(result.kind).toBe('arrow')
    if (result.kind !== 'arrow') return
    expect(result.start.x).toBeCloseTo(100, -1)
    expect(result.start.y).toBeCloseTo(200, -1)
    // The tip may land a few px onto an arrowhead wing (the chosen point is
    // the input point nearest the ideal perimeter tip) — near the drawn tip
    // means well within half the 60px head, nowhere near the start.
    expect(Math.hypot(result.end.x - 340, result.end.y - 200)).toBeLessThan(30)
  })

  it('recognizes a leftward arrow: the tip lands at the head, not the start', () => {
    const result = recognizeInk(
      roughArrow({ x1: 340, y1: 220, x2: 90, y2: 180, jitter: 2, seed: 8 })
    )
    expect(result.kind).toBe('arrow')
    if (result.kind !== 'arrow') return
    expect(Math.hypot(result.end.x - 90, result.end.y - 180)).toBeLessThan(32)
    expect(Math.hypot(result.end.x - 340, result.end.y - 220)).toBeGreaterThan(200)
  })

  it('recognizes a diagonal arrow', () => {
    const result = recognizeInk(
      roughArrow({ x1: 60, y1: 320, x2: 280, y2: 120, jitter: 2, seed: 4 })
    )
    expect(result.kind).toBe('arrow')
    if (result.kind !== 'arrow') return
    expect(Math.hypot(result.end.x - 280, result.end.y - 120)).toBeLessThan(38)
  })
})

describe('recognizeInk — stays Ink', () => {
  it('rejects a zigzag scribble', () => {
    const result = recognizeInk(
      zigzagScribble({ x: 50, y: 50, width: 250, height: 80, seed: 5 })
    )
    expect(result.kind).toBe('none')
  })

  it('rejects a handwriting-ish wiggle (no false line)', () => {
    const result = recognizeInk(
      handwritingWiggle({ x: 50, y: 200, width: 260, amplitude: 45, seed: 9 })
    )
    expect(result.kind).toBe('none')
  })

  it('rejects an elbow stroke (statistics look line-like, geometry does not)', () => {
    const elbow = [
      ...straightLine({ x1: 100, y1: 100, x2: 300, y2: 100, jitter: 1, seed: 2 }),
      ...straightLine({ x1: 300, y1: 100, x2: 300, y2: 220, jitter: 1, seed: 3 }),
    ]
    expect(recognizeInk(elbow).kind).toBe('none')
  })

  it('rejects a tiny closed stroke below the min screen size', () => {
    const result = recognizeInk(roughEllipse({ cx: 10, cy: 10, rx: 8, ry: 8 }))
    expect(result.kind).toBe('none')
  })

  it('rejects a tiny open stroke below the min screen size', () => {
    const result = recognizeInk(straightLine({ x1: 0, y1: 0, x2: 20, y2: 5 }))
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

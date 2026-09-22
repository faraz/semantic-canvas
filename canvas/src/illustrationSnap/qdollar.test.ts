import { describe, expect, it } from 'vitest'
import { QDollarRecognizer } from './qdollar'
import {
  ILLUSTRATION_TEMPLATES,
  recognizeIllustration,
  stickFigureInk,
  starInk,
  cloudInk,
  checkmarkInk,
  xInk,
  questionMarkInk,
  exclamationMarkInk,
  heartInk,
  lightbulbInk,
  speechBubbleInk,
  cylinderInk,
  documentInk,
  gearInk,
  smileyInk,
  triangleInk,
  type IllustrationName,
  type InkOpts,
} from './templates'
import type { InkPoint } from '../shapeSnap/recognize'
import {
  handwritingWiggle,
  roughArrow,
  roughDiamond,
  roughEllipse,
  roughRectangle,
  straightLine,
  zigzagScribble,
} from '../shapeSnap/testInk'

const generators: Record<IllustrationName, (opts: InkOpts) => InkPoint[][]> = {
  'stick-figure': stickFigureInk,
  star: starInk,
  cloud: cloudInk,
  checkmark: checkmarkInk,
  x: xInk,
  'question-mark': questionMarkInk,
  'exclamation-mark': exclamationMarkInk,
  heart: heartInk,
  lightbulb: lightbulbInk,
  'speech-bubble': speechBubbleInk,
  cylinder: cylinderInk,
  document: documentInk,
  gear: gearInk,
  smiley: smileyInk,
  triangle: triangleInk,
}

describe('recognizeIllustration positives', () => {
  // Jitter/seed combinations deliberately different from the registered
  // templates (jitter 0, seed 1), so each rough drawing is a genuine match,
  // not point-for-point identity.
  const roughDrawings: [number, number][] = [
    [4, 42],
    [6, 77],
  ]

  for (const template of ILLUSTRATION_TEMPLATES) {
    it(`recognizes a rough ${template.name}`, () => {
      for (const [jitter, seed] of roughDrawings) {
        const match = recognizeIllustration(generators[template.name]({ jitter, seed }))
        expect(match?.name, `jitter ${jitter} seed ${seed}`).toBe(template.name)
      }
    })
  }

  it('is stroke-order and direction agnostic (point cloud)', () => {
    const strokes = stickFigureInk({ jitter: 3, seed: 5 })
    const scrambled = [...strokes].reverse().map((stroke) => [...stroke].reverse())
    expect(recognizeIllustration(scrambled)?.name).toBe('stick-figure')
  })
})

describe('recognizeIllustration negatives', () => {
  const negatives: [string, InkPoint[][]][] = [
    ['rectangle', [roughRectangle({ x: 0, y: 0, w: 200, h: 150, jitter: 3, seed: 2 })]],
    ['square', [roughRectangle({ x: 0, y: 0, w: 160, h: 160, jitter: 3, seed: 5 })]],
    ['portrait rectangle', [roughRectangle({ x: 0, y: 0, w: 150, h: 200, jitter: 3, seed: 7 })]],
    ['portrait rectangle 2', [roughRectangle({ x: 0, y: 0, w: 130, h: 190, jitter: 2, seed: 11 })]],
    ['ellipse', [roughEllipse({ cx: 100, cy: 100, rx: 80, ry: 60, jitter: 3, seed: 4 })]],
    ['circle', [roughEllipse({ cx: 100, cy: 100, rx: 80, ry: 80, jitter: 3, seed: 9 })]],
    ['diamond', [roughDiamond({ x: 0, y: 0, w: 180, h: 180, jitter: 3, seed: 3 })]],
    ['diagonal line', [straightLine({ x1: 0, y1: 0, x2: 200, y2: 120, jitter: 2, seed: 1 })]],
    ['vertical line', [straightLine({ x1: 100, y1: 0, x2: 100, y2: 200, jitter: 2, seed: 1 })]],
    ['horizontal line', [straightLine({ x1: 0, y1: 100, x2: 220, y2: 100, jitter: 2, seed: 3 })]],
    ['arrow', [roughArrow({ x1: 0, y1: 100, x2: 240, y2: 100, jitter: 2, seed: 5 })]],
    ['handwriting wiggle', [handwritingWiggle({ x: 0, y: 100, width: 260, seed: 3 })]],
    ['zigzag scribble', [zigzagScribble({ x: 0, y: 0, width: 250, height: 80, seed: 5 })]],
    [
      'two handwriting words',
      [
        handwritingWiggle({ x: 0, y: 100, width: 120, seed: 6 }),
        handwritingWiggle({ x: 140, y: 100, width: 120, seed: 8 }),
      ],
    ],
  ]

  for (const [name, strokes] of negatives) {
    it(`rejects a ${name}`, () => {
      expect(recognizeIllustration(strokes)).toBeNull()
    })
  }
})

describe('QDollarRecognizer degenerates', () => {
  const degenerates: [string, InkPoint[][]][] = [
    ['no strokes', []],
    ['one empty stroke', [[]]],
    ['several empty strokes', [[], [], []]],
    ['a single point', [[{ x: 5, y: 5 }]]],
    ['all-coincident points', [Array.from({ length: 40 }, () => ({ x: 7, y: -3 }))]],
    ['two points', [[{ x: 0, y: 0 }, { x: 1, y: 1 }]]],
    [
      'non-finite coordinates',
      [[{ x: NaN, y: 0 }, { x: Infinity, y: 5 }, { x: 3, y: -Infinity }]],
    ],
    ['huge coordinates', [[{ x: 1e12, y: -1e12 }, { x: -1e12, y: 1e12 }, { x: 0, y: 0 }]]],
  ]

  it('never throws, with and without templates', () => {
    const empty = new QDollarRecognizer()
    const loaded = new QDollarRecognizer()
    loaded.addTemplate('x', xInk())
    loaded.addTemplate('degenerate-template', [[{ x: 1, y: 1 }]])
    for (const [, strokes] of degenerates) {
      expect(() => empty.recognize(strokes)).not.toThrow()
      expect(() => loaded.recognize(strokes)).not.toThrow()
      expect(() => recognizeIllustration(strokes)).not.toThrow()
    }
  })

  it('returns no name when there is nothing to match', () => {
    const recognizer = new QDollarRecognizer()
    expect(recognizer.recognize([xInk()[0]]).name).toBeNull()
    recognizer.addTemplate('x', xInk())
    expect(recognizer.recognize([]).name).toBeNull()
  })

  it('matches an exact template at distance 0', () => {
    const recognizer = new QDollarRecognizer()
    recognizer.addTemplate('star', starInk())
    const match = recognizer.recognize(starInk())
    expect(match.name).toBe('star')
    expect(match.distance).toBeCloseTo(0, 5)
    expect(match.score).toBe(1)
  })
})

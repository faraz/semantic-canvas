// @vitest-environment jsdom
import '../tldrawTestShims'
import { describe, expect, it } from 'vitest'
import { EASINGS } from 'tldraw'
import { INK_PRESETS } from './presets'
import { strokeOptionsForPreset } from './InkDrawShapeUtil'

describe('strokeOptionsForPreset', () => {
  it('starts from the stock simulated-pressure baseline for touch strokes', () => {
    const options = strokeOptionsForPreset(INK_PRESETS.pen, 10, false, true)
    expect(options.size).toBe(10)
    expect(options.thinning).toBe(0.5)
    expect(options.simulatePressure).toBe(true)
    expect(options.easing).toBe(EASINGS.easeOutSine)
    expect(options.last).toBe(true)
  })

  it('starts from the stock real-pressure baseline for Pencil strokes', () => {
    const options = strokeOptionsForPreset(INK_PRESETS.pen, 10, true, false)
    expect(options.size).toBeCloseTo(1 + 10 * 1.2)
    expect(options.thinning).toBe(0.62)
    expect(options.simulatePressure).toBe(false)
    expect(options.last).toBe(false)
  })

  it('layers monoline over the baseline: zero thinning, no simulated pressure', () => {
    const options = strokeOptionsForPreset(INK_PRESETS.monoline, 8, false, true)
    expect(options.thinning).toBe(0)
    expect(options.simulatePressure).toBe(false)
  })

  it('layers fountainPen over the baseline: strong thinning and tapered ends', () => {
    const options = strokeOptionsForPreset(INK_PRESETS.fountainPen, 8, true, true)
    expect(options.thinning).toBe(0.85)
    expect(options.start?.taper).toBe(true)
    expect(options.end?.taper).toBe(true)
    // Real Pencil pressure still drives the calligraphic width swing.
    expect(options.simulatePressure).toBe(false)
  })

  it('keeps marker flat regardless of pressure source', () => {
    for (const isPen of [true, false]) {
      const options = strokeOptionsForPreset(INK_PRESETS.marker, 12, isPen, true)
      expect(options.thinning).toBe(0)
      expect(options.simulatePressure).toBe(false)
    }
  })
})

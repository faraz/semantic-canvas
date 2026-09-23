import { describe, expect, it } from 'vitest'
import {
  INK_PRESETS,
  presetNameForInkType,
  renderPresetForMeta,
} from './presets'

describe('presetNameForInkType', () => {
  it('maps each PencilKit ink leaf to its preset', () => {
    expect(presetNameForInkType('pen')).toBe('pen')
    expect(presetNameForInkType('pencil')).toBe('pencil')
    expect(presetNameForInkType('monoline')).toBe('monoline')
    expect(presetNameForInkType('fountainPen')).toBe('fountainPen')
    expect(presetNameForInkType('watercolor')).toBe('watercolor')
    expect(presetNameForInkType('crayon')).toBe('crayon')
    expect(presetNameForInkType('marker')).toBe('marker')
  })

  it('maps reed to the calligraphic fountainPen preset', () => {
    expect(presetNameForInkType('reed')).toBe('fountainPen')
  })

  it('is case-insensitive and trims whitespace', () => {
    expect(presetNameForInkType('FountainPen')).toBe('fountainPen')
    expect(presetNameForInkType(' marker ')).toBe('marker')
  })

  it('falls back to pen for unknown inks', () => {
    expect(presetNameForInkType('futureInk')).toBe('pen')
    expect(presetNameForInkType('')).toBe('pen')
  })
})

describe('INK_PRESETS table', () => {
  it('keeps pen as the untouched baseline', () => {
    expect(INK_PRESETS.pen).toEqual({ strokeOptions: {}, opacity: 1, widthScale: 1 })
  })

  it('makes fountainPen calligraphic: strong thinning with tapered ends', () => {
    const { strokeOptions } = INK_PRESETS.fountainPen
    expect(strokeOptions.thinning).toBeGreaterThan(0.7)
    expect(strokeOptions.start?.taper).toBe(true)
    expect(strokeOptions.end?.taper).toBe(true)
  })

  it('makes monoline a uniform nib: zero thinning, no simulated pressure', () => {
    expect(INK_PRESETS.monoline.strokeOptions.thinning).toBe(0)
    expect(INK_PRESETS.monoline.strokeOptions.simulatePressure).toBe(false)
    expect(INK_PRESETS.monoline.widthScale).toBe(1)
  })

  it('makes pencil slim, translucent, lightly grained', () => {
    expect(INK_PRESETS.pencil.widthScale).toBeLessThan(1)
    expect(INK_PRESETS.pencil.opacity).toBeCloseTo(0.85)
    expect(INK_PRESETS.pencil.filter).toBe('grain')
  })

  it('makes crayon broad and grained', () => {
    expect(INK_PRESETS.crayon.widthScale).toBeGreaterThan(1.4)
    expect(INK_PRESETS.crayon.filter).toBe('grain')
  })

  it('makes watercolor a wide translucent wash', () => {
    expect(INK_PRESETS.watercolor.widthScale).toBeGreaterThan(1.5)
    expect(INK_PRESETS.watercolor.opacity).toBeLessThan(0.6)
    expect(INK_PRESETS.watercolor.filter).toBe('wash')
  })

  it('makes marker a broad flat translucent nib', () => {
    expect(INK_PRESETS.marker.strokeOptions.thinning).toBe(0)
    expect(INK_PRESETS.marker.opacity).toBeCloseTo(0.5)
    expect(INK_PRESETS.marker.widthScale).toBeGreaterThan(1.3)
  })
})

describe('renderPresetForMeta', () => {
  it('returns the named preset for stamped meta', () => {
    expect(renderPresetForMeta({ inkPreset: 'marker' })).toEqual({
      name: 'marker',
      preset: INK_PRESETS.marker,
    })
    expect(renderPresetForMeta({ inkPreset: 'watercolor' })?.name).toBe('watercolor')
  })

  it('returns null (stock rendering) for absent or empty meta', () => {
    expect(renderPresetForMeta(undefined)).toBeNull()
    expect(renderPresetForMeta(null)).toBeNull()
    expect(renderPresetForMeta({})).toBeNull()
  })

  it('returns null for the pen baseline so it keeps the stock fast path', () => {
    expect(renderPresetForMeta({ inkPreset: 'pen' })).toBeNull()
  })

  it('returns null for unknown or malformed preset names', () => {
    expect(renderPresetForMeta({ inkPreset: 'glitter' })).toBeNull()
    expect(renderPresetForMeta({ inkPreset: 7 })).toBeNull()
    expect(renderPresetForMeta({ inkPreset: 'toString' })).toBeNull()
  })
})

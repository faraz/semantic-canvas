// @vitest-environment jsdom
import './tldrawTestShims'
import { describe, expect, it } from 'vitest'
import { createShapeId, DefaultColorStyle, DefaultSizeStyle } from 'tldraw'
import { b64Vecs } from '@tldraw/tlschema'
import { makeTestEditor } from './tldrawTestEditor'
import {
  applyPenTool,
  currentInkPresetName,
  nearestTldrawColor,
  sizeBucket,
  wirePenPalette,
} from './penPalette'

describe('nearestTldrawColor', () => {
  it('maps exact swatch values to their styles', () => {
    expect(nearestTldrawColor('#1d1d1d')).toBe('black')
    expect(nearestTldrawColor('#e03131')).toBe('red')
    expect(nearestTldrawColor('#4263eb')).toBe('blue')
  })

  it('maps nearby colors to the closest style', () => {
    expect(nearestTldrawColor('#000000')).toBe('black')
    expect(nearestTldrawColor('#ff0000')).toBe('red')
    expect(nearestTldrawColor('#00ff00')).toBe('light-green')
    expect(nearestTldrawColor('#fefefe')).toBe('white')
  })

  it('falls back to black on malformed input', () => {
    expect(nearestTldrawColor('nonsense')).toBe('black')
    expect(nearestTldrawColor('')).toBe('black')
  })
})

describe('sizeBucket', () => {
  it('buckets PencilKit widths into tldraw sizes', () => {
    expect(sizeBucket(1)).toBe('s')
    expect(sizeBucket(5)).toBe('m')
    expect(sizeBucket(12)).toBe('l')
    expect(sizeBucket(22)).toBe('xl')
  })
})

describe('applyPenTool', () => {
  it('switches to draw with mapped color and size for a pen', () => {
    const editor = makeTestEditor()
    applyPenTool(editor, {
      v: 1,
      event: 'penToolChanged',
      kind: 'ink',
      inkType: 'pen',
      colorHex: '#e03131',
      width: 6,
    })
    expect(editor.getCurrentToolId()).toBe('draw')
    expect(editor.getStyleForNextShape(DefaultColorStyle)).toBe('red')
    expect(editor.getStyleForNextShape(DefaultSizeStyle)).toBe('m')
  })

  it('maps marker ink to the draw tool with the marker preset (#31)', () => {
    const editor = makeTestEditor()
    applyPenTool(editor, {
      v: 1,
      event: 'penToolChanged',
      kind: 'ink',
      inkType: 'marker',
      colorHex: '#f1ac4b',
      width: 18,
    })
    expect(editor.getCurrentToolId()).toBe('draw')
    expect(currentInkPresetName()).toBe('marker')
    expect(editor.getStyleForNextShape(DefaultSizeStyle)).toBe('xl')
  })

  it('tracks the current ink preset per selection, untouched by eraser/lasso', () => {
    const editor = makeTestEditor()
    applyPenTool(editor, {
      v: 1,
      event: 'penToolChanged',
      kind: 'ink',
      inkType: 'watercolor',
      colorHex: '#4263eb',
      width: 12,
    })
    expect(currentInkPresetName()).toBe('watercolor')
    applyPenTool(editor, { v: 1, event: 'penToolChanged', kind: 'eraser' })
    expect(currentInkPresetName()).toBe('watercolor')
  })

  it('maps eraser and lasso to eraser and select', () => {
    const editor = makeTestEditor()
    applyPenTool(editor, { v: 1, event: 'penToolChanged', kind: 'eraser' })
    expect(editor.getCurrentToolId()).toBe('eraser')
    applyPenTool(editor, { v: 1, event: 'penToolChanged', kind: 'lasso' })
    expect(editor.getCurrentToolId()).toBe('select')
  })

  it('ignores unknown items', () => {
    const editor = makeTestEditor()
    editor.setCurrentTool('draw')
    applyPenTool(editor, { v: 1, event: 'penToolChanged', kind: 'other' })
    expect(editor.getCurrentToolId()).toBe('draw')
  })
})

// A minimal one-segment Ink stroke; the meta hook doesn't read the points,
// but geometry computation needs a real path.
function makeInkStroke(editor: ReturnType<typeof makeTestEditor>, name: string) {
  const id = createShapeId(name)
  const path = b64Vecs.encodePoints(
    [
      { x: 0, y: 0, z: 0.5 },
      { x: 40, y: 10, z: 0.5 },
      { x: 90, y: 25, z: 0.5 },
    ],
    3
  )
  editor.createShape({
    id,
    type: 'draw',
    x: 0,
    y: 0,
    props: { segments: [{ type: 'free', path }], isComplete: true },
  })
  return id
}

describe('wirePenPalette meta stamping (#31)', () => {
  it('stamps new draw shapes with the palette-selected ink preset', () => {
    const editor = makeTestEditor()
    const dispose = wirePenPalette(editor)
    window.__bridgeReceive?.({
      v: 1,
      event: 'penToolChanged',
      kind: 'ink',
      inkType: 'marker',
      colorHex: '#e03131',
      width: 18,
    })
    const id = makeInkStroke(editor, 'stamped-marker')
    expect(editor.getShape(id)?.meta.inkPreset).toBe('marker')
    dispose()
  })

  it('stamps the fountainPen preset for the reed ink', () => {
    const editor = makeTestEditor()
    const dispose = wirePenPalette(editor)
    window.__bridgeReceive?.({
      v: 1,
      event: 'penToolChanged',
      kind: 'ink',
      inkType: 'reed',
      colorHex: '#1d1d1d',
      width: 4,
    })
    const id = makeInkStroke(editor, 'stamped-reed')
    expect(editor.getShape(id)?.meta.inkPreset).toBe('fountainPen')
    dispose()
  })

  it('leaves non-draw shapes unstamped', () => {
    const editor = makeTestEditor()
    const dispose = wirePenPalette(editor)
    const id = createShapeId('a-box')
    editor.createShape({ id, type: 'geo', x: 0, y: 0, props: { w: 50, h: 50 } })
    expect(editor.getShape(id)?.meta.inkPreset).toBeUndefined()
    dispose()
  })

  it('restores the prior initial-meta hook on dispose', () => {
    const editor = makeTestEditor()
    const dispose = wirePenPalette(editor)
    dispose()
    const id = makeInkStroke(editor, 'after-dispose')
    expect(editor.getShape(id)?.meta.inkPreset).toBeUndefined()
  })
})

// @vitest-environment jsdom
import './tldrawTestShims'
import { describe, expect, it } from 'vitest'
import { DefaultColorStyle, DefaultSizeStyle } from 'tldraw'
import { makeTestEditor } from './tldrawTestEditor'
import { applyPenTool, nearestTldrawColor, sizeBucket } from './penPalette'

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

  it('maps marker ink to the highlight tool', () => {
    const editor = makeTestEditor()
    applyPenTool(editor, {
      v: 1,
      event: 'penToolChanged',
      kind: 'ink',
      inkType: 'marker',
      colorHex: '#f1ac4b',
      width: 18,
    })
    expect(editor.getCurrentToolId()).toBe('highlight')
    expect(editor.getStyleForNextShape(DefaultSizeStyle)).toBe('xl')
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

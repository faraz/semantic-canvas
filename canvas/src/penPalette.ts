// Pen palette mapping (#30, presets #31): the Shell hosts Apple's
// PKToolPicker and reports every selection over the Bridge; this module makes
// those selections drive the Canvas so picking an Apple pencil simply draws.
//
// Mapping decisions:
// - every ink (pen, pencil, monoline, fountainPen, watercolor, crayon, reed,
//   and — since #31 — marker) → the draw tool, with the ink's preset stamped
//   on each new stroke's meta so InkDrawShapeUtil renders its character.
//   (Marker used to switch to tldraw's highlight tool; it is now the marker
//   preset on draw. tldraw's highlighter stays its own tool.)
// - PencilKit's continuous color → the nearest of tldraw's 13 color styles.
// - PencilKit's continuous width → tldraw's S/M/L/XL size buckets.
// - eraser → eraser tool; lasso → select tool; unknown items → no-op.
import {
  DefaultColorStyle,
  DefaultSizeStyle,
  type Editor,
  type TLDefaultColorStyle,
  type TLDefaultSizeStyle,
} from 'tldraw'
import { onBridgeMessage, type BridgeReceiveMessage } from './bridge'
import { presetNameForInkType, type InkPresetName } from './ink/presets'

// Reference RGB per tldraw color style (light-theme swatch values); nearest
// match by squared RGB distance. Exact hue fidelity matters less than the
// pick landing on the color the presenter meant.
const TLDRAW_COLOR_RGB: readonly [TLDefaultColorStyle, number, number, number][] = [
  ['black', 0x1d, 0x1d, 0x1d],
  ['grey', 0x9f, 0xa8, 0xb2],
  ['light-violet', 0xe0, 0x85, 0xf4],
  ['violet', 0xae, 0x3e, 0xc9],
  ['blue', 0x42, 0x63, 0xeb],
  ['light-blue', 0x4d, 0xab, 0xf7],
  ['yellow', 0xf1, 0xac, 0x4b],
  ['orange', 0xe1, 0x69, 0x19],
  ['green', 0x09, 0x92, 0x68],
  ['light-green', 0x40, 0xc0, 0x57],
  ['light-red', 0xff, 0x87, 0x87],
  ['red', 0xe0, 0x31, 0x31],
  ['white', 0xff, 0xff, 0xff],
]

export function nearestTldrawColor(hex: string): TLDefaultColorStyle {
  const cleaned = hex.replace('#', '')
  const value = Number.parseInt(cleaned, 16)
  if (cleaned.length !== 6 || Number.isNaN(value)) return 'black'
  const r = (value >> 16) & 0xff
  const g = (value >> 8) & 0xff
  const b = value & 0xff
  let best: TLDefaultColorStyle = 'black'
  let bestDistance = Infinity
  for (const [name, cr, cg, cb] of TLDRAW_COLOR_RGB) {
    const distance = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2
    if (distance < bestDistance) {
      bestDistance = distance
      best = name
    }
  }
  return best
}

// PencilKit widths run roughly 1–25 pt across its inks.
export function sizeBucket(width: number): TLDefaultSizeStyle {
  if (width < 4) return 's'
  if (width < 9) return 'm'
  if (width < 16) return 'l'
  return 'xl'
}

type PenToolChanged = Extract<BridgeReceiveMessage, { event: 'penToolChanged' }>

// The palette's current ink preset. Module-level on purpose: the palette is
// one physical picker and the initial-meta hook (below) needs the value at
// stroke-creation time, whichever editor instance is live.
let currentPreset: InkPresetName = 'pen'

export function currentInkPresetName(): InkPresetName {
  return currentPreset
}

export function applyPenTool(editor: Editor, message: PenToolChanged): void {
  switch (message.kind) {
    case 'ink': {
      currentPreset = presetNameForInkType(message.inkType)
      editor.setCurrentTool('draw')
      editor.setStyleForNextShapes(DefaultColorStyle, nearestTldrawColor(message.colorHex))
      editor.setStyleForNextShapes(DefaultSizeStyle, sizeBucket(message.width))
      return
    }
    case 'eraser':
      editor.setCurrentTool('eraser')
      return
    case 'lasso':
      editor.setCurrentTool('select')
      return
    case 'other':
      return
  }
}

export function wirePenPalette(editor: Editor): () => void {
  // Stamp the current preset on every new draw shape's meta. The editor
  // merges getInitialMetaForShape under any explicit meta on createShapes
  // (Editor.ts), so the draw tool's strokes pick this up. Composed over any
  // prior hook (none exists in this codebase today — this is defensive
  // against a future consumer) and restored on dispose.
  const priorInitialMeta = editor.getInitialMetaForShape
  editor.getInitialMetaForShape = (shape) => {
    const base = priorInitialMeta.call(editor, shape)
    if (shape.type !== 'draw') return base
    return { ...base, inkPreset: currentPreset }
  }
  const unsubscribe = onBridgeMessage((message) => {
    if (message.event !== 'penToolChanged') return
    applyPenTool(editor, message)
  })
  return () => {
    editor.getInitialMetaForShape = priorInitialMeta
    unsubscribe()
  }
}

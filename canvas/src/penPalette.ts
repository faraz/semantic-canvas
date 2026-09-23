// Pen palette mapping (#30): the Shell hosts Apple's PKToolPicker and
// reports every selection over the Bridge; this module makes those
// selections drive the Canvas so picking an Apple pencil simply draws.
//
// Mapping decisions (spec'd on the ticket):
// - marker ink → tldraw's highlight tool (translucent, wide — the same job);
//   every other ink (pen, pencil, monoline, fountainPen, watercolor, crayon,
//   reed) → the draw tool.
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

export function applyPenTool(editor: Editor, message: PenToolChanged): void {
  switch (message.kind) {
    case 'ink': {
      // inkType is the leaf of PencilKit's reverse-DNS raw value; match
      // loosely so an OS rename degrades to the draw tool, never a no-op.
      const inkType = message.inkType.toLowerCase()
      const tool = inkType.includes('marker') || inkType.includes('highlight')
        ? 'highlight'
        : 'draw'
      editor.setCurrentTool(tool)
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
  return onBridgeMessage((message) => {
    if (message.event !== 'penToolChanged') return
    debugToast(message)
    applyPenTool(editor, message)
  })
}

// TEMP DEBUG (#30 device diagnosis): flashes each palette message on screen
// so a silent Shell (no toast) is distinguishable from a mapping fault
// (toast but wrong behavior). Remove once the palette is verified on device.
let toastEl: HTMLDivElement | null = null
let toastTimer: ReturnType<typeof setTimeout> | undefined
function debugToast(message: PenToolChanged): void {
  if (typeof document === 'undefined') return
  if (!toastEl) {
    toastEl = document.createElement('div')
    toastEl.style.cssText =
      'position:fixed;left:50%;bottom:96px;transform:translateX(-50%);' +
      'z-index:99999;padding:6px 12px;border-radius:8px;background:rgba(0,0,0,.75);' +
      'color:#fff;font:12px ui-monospace,monospace;pointer-events:none'
    document.body.appendChild(toastEl)
  }
  toastEl.textContent =
    message.kind === 'ink'
      ? `pen: ${message.inkType} ${message.colorHex} w=${message.width.toFixed(1)}`
      : `pen: ${message.kind}`
  toastEl.style.display = 'block'
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    if (toastEl) toastEl.style.display = 'none'
  }, 2000)
}

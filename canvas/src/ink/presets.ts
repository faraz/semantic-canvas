// Ink presets (#31): each PencilKit ink renders with its intended character.
//
// A pure table from the PencilKit ink leaf name (the Shell sends the leaf of
// PKInkingTool.InkType's reverse-DNS raw value over the Bridge) to the
// tldraw-side rendering parameters:
//
// - strokeOptions: overrides layered onto tldraw's stock freehand options
//   (thinning, taper, simulatePressure, ...) — see InkDrawShapeUtil for how
//   they combine with the stock base.
// - opacity: a multiplier applied on top of the shape's own opacity.
// - widthScale: multiplies the stroke width derived from the size style.
// - filter: an optional static SVG filter ('grain' | 'wash') defined once in
//   the canvas defs.
//
// The table is data-only (no editor, no DOM) so it unit-tests standalone.
import type { StrokeOptions } from 'tldraw'

export type InkFilter = 'grain' | 'wash'

export type InkPresetName =
  | 'pen'
  | 'fountainPen'
  | 'monoline'
  | 'pencil'
  | 'crayon'
  | 'watercolor'
  | 'marker'

export interface InkPreset {
  strokeOptions: Partial<StrokeOptions>
  opacity: number
  widthScale: number
  filter?: InkFilter
}

// Stock draw-shape baselines for reference (getPath.ts): thinning 0.5
// (simulated pressure) / 0.62 (real pencil pressure), no taper, opacity 1.
export const INK_PRESETS: Record<InkPresetName, InkPreset> = {
  // Classic pressure-thinned ink — tldraw's stock rendering, kept as the
  // baseline. The renderer treats 'pen' as "no override" (see
  // renderPresetForMeta), so pen strokes ride the stock fast path.
  pen: {
    strokeOptions: {},
    opacity: 1,
    widthScale: 1,
  },
  // Calligraphic: pressure swings the nib hard and both ends taper to a
  // point, like a split nib lifting off the page. Also serves the reed ink.
  fountainPen: {
    strokeOptions: {
      thinning: 0.85,
      smoothing: 0.65,
      start: { taper: true },
      end: { taper: true },
    },
    opacity: 1,
    widthScale: 1.15,
  },
  // A uniform nib: pressure does nothing to the width.
  monoline: {
    strokeOptions: { thinning: 0, simulatePressure: false },
    opacity: 1,
    widthScale: 1,
  },
  // Graphite: slim, slightly translucent, with a light speckle of grain.
  pencil: {
    strokeOptions: { thinning: 0.35 },
    opacity: 0.85,
    widthScale: 0.7,
    filter: 'grain',
  },
  // Wax: broad and heavily grained; near-flat width like dragging a crayon
  // on its side.
  crayon: {
    strokeOptions: { thinning: 0.15, simulatePressure: false },
    opacity: 0.95,
    widthScale: 1.7,
    filter: 'grain',
  },
  // A wide, soft-edged translucent wash; edges blur into the page.
  watercolor: {
    strokeOptions: { thinning: 0.1, smoothing: 0.7 },
    opacity: 0.45,
    widthScale: 1.9,
    filter: 'wash',
  },
  // Broad flat translucent nib — the chisel feel of PencilKit's marker,
  // rendered as a draw preset (tldraw's highlighter stays its own tool).
  marker: {
    strokeOptions: { thinning: 0, simulatePressure: false },
    opacity: 0.5,
    widthScale: 1.6,
  },
}

// Leaf ink name → preset. Exact lowercase match on the known leaves; an
// unknown ink (or an OS rename) degrades to the pen baseline, never a no-op.
const LEAF_TO_PRESET: Record<string, InkPresetName> = {
  pen: 'pen',
  fountainpen: 'fountainPen',
  reed: 'fountainPen',
  monoline: 'monoline',
  pencil: 'pencil',
  crayon: 'crayon',
  watercolor: 'watercolor',
  marker: 'marker',
}

export function presetNameForInkType(inkType: string): InkPresetName {
  return LEAF_TO_PRESET[inkType.trim().toLowerCase()] ?? 'pen'
}

// The renderer's meta gate: which preset, if any, overrides stock rendering
// for a shape's meta. Returns null — meaning "render stock" — for absent or
// malformed meta (every pre-#31 Board and every Guest stroke), for unknown
// preset names (forward compatibility), and for 'pen' (identical to stock,
// so it keeps the stock fast path).
export function renderPresetForMeta(
  meta: unknown
): { name: InkPresetName; preset: InkPreset } | null {
  if (typeof meta !== 'object' || meta === null) return null
  const name = (meta as Record<string, unknown>).inkPreset
  if (typeof name !== 'string' || name === 'pen') return null
  if (!Object.prototype.hasOwnProperty.call(INK_PRESETS, name)) return null
  const presetName = name as InkPresetName
  return { name: presetName, preset: INK_PRESETS[presetName] }
}

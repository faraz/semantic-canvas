// Ink preset renderer (#31): a subclass of tldraw's DrawShapeUtil that keeps
// every stroke a stock 'draw' shape (Shape Snap, Illustration Snap, sync and
// persistence untouched) but renders it with the character of the PencilKit
// ink it was drawn with, carried in shape.meta.inkPreset.
//
// Replacement mechanics (verified against tldraw 5.4.2 source): the <Tldraw>
// component merges the shapeUtils prop over the defaults with
// mergeArraysAndReplaceDefaults('type', custom, defaults)
// (tldraw/src/lib/Tldraw.tsx:199-201, @tldraw/utils/src/lib/array.ts) — a
// custom util whose static type is 'draw' drops the default DrawShapeUtil
// from the array and takes its place; the Editor then keys utils by type
// (Editor.ts constructor), so this subclass is *the* draw util. Because the
// static props/migrations are inherited unchanged, the store schema is
// byte-identical to stock — external useSync stores (Session, Guest) accept
// it without ceremony.
//
// Rendering: strokes whose meta names a non-pen preset are drawn from the
// public freehand pipeline (getStroke → getSvgPathFromPoints), which — unlike
// the stock fast path svgInk — supports tapered ends. Everything else
// (absent/unknown meta, the pen baseline, dashed/dotted/solid styles, closed
// filled shapes) falls back to the stock renderer, so all existing Boards and
// Guest strokes render unchanged. SVG filters (feTurbulence grain, blur wash)
// are defined once in the canvas defs and referenced per stroke — static, no
// animation.
import {
  DrawShapeUtil,
  EASINGS,
  SVGContainer,
  getDisplayValues,
  getPointsFromDrawSegments,
  getStroke,
  getSvgPathFromPoints,
  modulate,
  type StrokeOptions,
  type SvgExportContext,
  type TLDrawShape,
  type TLShapeUtilCanvasSvgDef,
} from 'tldraw'
import {
  renderPresetForMeta,
  type InkFilter,
  type InkPreset,
} from './presets'

// Mirrors getPath.ts's PEN_EASING (not exported from tldraw).
const PEN_EASING = (t: number) => t * 0.65 + Math.sin((t * Math.PI) / 2) * 0.35

// The stock freehand baselines from tldraw/src/lib/shapes/draw/getPath.ts
// (simulatePressureSettings / realPressureSettings), with the preset's
// overrides layered on top. sw is the already-preset-scaled stroke width.
export function strokeOptionsForPreset(
  preset: InkPreset,
  sw: number,
  isPen: boolean,
  last: boolean
): StrokeOptions {
  const base: StrokeOptions = isPen
    ? {
        size: 1 + sw * 1.2,
        thinning: 0.62,
        streamline: 0.62,
        smoothing: 0.62,
        simulatePressure: false,
        easing: PEN_EASING,
      }
    : {
        size: sw,
        thinning: 0.5,
        streamline: modulate(sw, [9, 16], [0.64, 0.74], true),
        smoothing: 0.62,
        simulatePressure: true,
        easing: EASINGS.easeOutSine,
      }
  return { ...base, ...preset.strokeOptions, last }
}

const FILTER_IDS: Record<InkFilter, string> = {
  grain: 'sc-ink-grain',
  wash: 'sc-ink-wash',
}

// Grain: static fractal noise turned into an alpha mask that speckles the
// stroke (pencil tooth, crayon wax). One feTurbulence + feColorMatrix +
// feComposite — cheap, evaluated once per stroke, never animated.
function GrainFilterDef() {
  return (
    <filter id={FILTER_IDS.grain} x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency="0.7"
        numOctaves="2"
        seed="7"
        result="noise"
      />
      <feColorMatrix
        in="noise"
        type="matrix"
        values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.7 0.7 0.7 0 -0.25"
        result="mask"
      />
      <feComposite in="SourceGraphic" in2="mask" operator="in" />
    </filter>
  )
}

// Wash: a soft blur that melts the stroke's edges into the page. A single
// small-radius feGaussianBlur, static per stroke.
function WashFilterDef() {
  return (
    <filter id={FILTER_IDS.wash} x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2" />
    </filter>
  )
}

// Hook-free on purpose: usable from both component() and toSvg(). Forgoes
// the stock renderer's zoomed-out force-solid degradation — preset strokes
// keep their outline at every zoom (the path is memoized by React until the
// shape or theme changes, so this costs a recompute only when stock would
// recompute too).
function InkStrokeSvg({
  shape,
  preset,
  strokeColor,
  strokeWidth,
}: {
  shape: TLDrawShape
  preset: InkPreset
  strokeColor: string
  strokeWidth: number
}) {
  const points = getPointsFromDrawSegments(
    shape.props.segments,
    shape.props.scaleX,
    shape.props.scaleY
  )
  const segments = shape.props.segments
  const showAsComplete =
    shape.props.isComplete || segments[segments.length - 1]?.type === 'straight'
  const sw = (strokeWidth + 1) * shape.props.scale * preset.widthScale
  const options = strokeOptionsForPreset(preset, sw, shape.props.isPen, showAsComplete)
  const outline = getStroke(points, options)
  const d = getSvgPathFromPoints(outline, true)
  return (
    <g
      opacity={preset.opacity}
      filter={preset.filter ? `url(#${FILTER_IDS[preset.filter]})` : undefined}
    >
      <path d={d} strokeLinecap="round" fill={strokeColor} />
    </g>
  )
}

// Which shapes take the preset rendering path. Dashed/dotted/solid styles
// and closed filled strokes keep the stock renderer (presets describe
// freehand ink, and the stock path owns fill composition).
function presetOverrideFor(shape: TLDrawShape): InkPreset | null {
  if (shape.props.dash !== 'draw') return null
  if (shape.props.isClosed && shape.props.fill !== 'none') return null
  return renderPresetForMeta(shape.meta)?.preset ?? null
}

export class InkDrawShapeUtil extends DrawShapeUtil {
  override component(shape: TLDrawShape) {
    const preset = presetOverrideFor(shape)
    if (!preset) return super.component(shape)
    const dv = getDisplayValues(this, shape)
    return (
      <SVGContainer>
        <InkStrokeSvg
          shape={shape}
          preset={preset}
          strokeColor={dv.strokeColor}
          strokeWidth={dv.strokeWidth}
        />
      </SVGContainer>
    )
  }

  override toSvg(shape: TLDrawShape, ctx: SvgExportContext) {
    const preset = presetOverrideFor(shape)
    if (!preset) return super.toSvg(shape, ctx)
    if (preset.filter === 'grain') {
      ctx.addExportDef({ key: FILTER_IDS.grain, getElement: () => <GrainFilterDef /> })
    } else if (preset.filter === 'wash') {
      ctx.addExportDef({ key: FILTER_IDS.wash, getElement: () => <WashFilterDef /> })
    }
    const dv = getDisplayValues(this, shape, ctx.colorMode)
    const scaleFactor = 1 / shape.props.scale
    return (
      <g transform={`scale(${scaleFactor})`}>
        <InkStrokeSvg
          shape={shape}
          preset={preset}
          strokeColor={dv.strokeColor}
          strokeWidth={dv.strokeWidth}
        />
      </g>
    )
  }

  override getCanvasSvgDefs(): TLShapeUtilCanvasSvgDef[] {
    return [
      ...super.getCanvasSvgDefs(),
      { key: FILTER_IDS.grain, component: GrainFilterDef },
      { key: FILTER_IDS.wash, component: WashFilterDef },
    ]
  }
}

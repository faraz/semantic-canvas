// Quiet Studio — restrained, editorial drawing chrome for the meeting iPad.
//
// One calm dock at the bottom: pen tools, a hairline pause, the five
// everyday shapes, another pause, then a single "shapes" button that lifts
// a frosted shelf with the rest of tldraw's geo vocabulary. Nothing scrolls,
// nothing overflows, nothing bounces. Active tool = ink-filled pill (the
// chrome stays monochrome); the one accent is a small clay dot on the shelf
// toggle whenever a shelf shape is the live tool, so the dock never lies
// about what the Pencil will draw.
import { useEffect, useState } from 'react'
import {
  ArrowToolbarItem,
  DefaultStylePanel,
  DefaultStylePanelContent,
  DefaultToolbar,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  GeoShapeGeoStyle,
  LineToolbarItem,
  RectangleToolbarItem,
  SelectToolbarItem,
  TextToolbarItem,
  TldrawUiMenuContextProvider,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  ToolbarItem,
  useEditor,
  useValue,
  type TLComponents,
  type TLGeoShapeGeoStyle,
} from 'tldraw'
import './quiet-studio.css'

// Everything in GeoShapeGeoStyle that is not already first-class in the dock
// (rectangle / ellipse / diamond live there). Ordered for scanning: solids,
// then symbols, then directional arrows.
const TRAY_SHAPES: readonly TLGeoShapeGeoStyle[] = [
  'triangle',
  'oval',
  'trapezoid',
  'rhombus',
  'rhombus-2',
  'pentagon',
  'hexagon',
  'octagon',
  'star',
  'cloud',
  'heart',
  'x-box',
  'check-box',
  'arrow-left',
  'arrow-right',
  'arrow-up',
  'arrow-down',
]

// Children passed to DefaultToolbar below: 10 buttons + 2 hairline rules.
// minItems === maxItems pins OverflowingToolbar's budget so nothing is ever
// demoted into a "..." popover, regardless of measured width.
const DOCK_ITEM_COUNT = 12

// Hand-drawn glyph for the shelf toggle: circle / square / triangle / plus,
// stroked to sit with tldraw's icon family (22px box, 1.6 stroke).
function TrayGlyph() {
  return (
    <svg
      className="qs-tray-toggle__glyph"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6.4" cy="6.4" r="3.1" />
      <rect x="12.7" y="3.3" width="6.2" height="6.2" rx="1.7" />
      <path d="M6.4 12.9 L9.6 18.7 L3.2 18.7 Z" />
      <path d="M15.8 13.2 v5.6 M13 16 h5.6" />
    </svg>
  )
}

function QuietStudioToolbar() {
  const editor = useEditor()
  const [open, setOpen] = useState(false)

  // The shelf shape that is currently the live tool, if any — drives the
  // accent dot and the toggle's pressed state, since the dock row cannot
  // show a highlight for a shape it does not display.
  const activeTrayShape = useValue(
    'quiet-studio: active tray shape',
    () => {
      if (editor.getCurrentToolId() !== 'geo') return null
      const geo = editor.getSharedStyles().getAsKnownValue(GeoShapeGeoStyle)
      return geo && TRAY_SHAPES.includes(geo) ? geo : null
    },
    [editor]
  )

  // Touch-first dismissal: any pointer that lands outside the shelf or its
  // toggle closes the shelf (capture phase, so a canvas stroke both closes
  // it and still draws). Escape is a courtesy for attached keyboards.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null
      if (target?.closest('.qs-shape-tray, .qs-tray-toggle')) return
      setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="qs-dock">
      {/* The shelf stays mounted so open/close is a pure CSS transition
          (quick, damped, no layout shift). Selection happens on touchstart
          inside the tool buttons; the pointerup that follows retires the
          shelf one frame later so the same tap never fights the pick. */}
      <div
        className="qs-shape-tray"
        id="qs-shape-tray"
        data-open={open}
        onPointerUp={() => requestAnimationFrame(() => setOpen(false))}
      >
        <div className="qs-shape-tray__caption">Shapes</div>
        <TldrawUiToolbar
          label="Shape library"
          orientation="grid"
          className="qs-shape-tray__grid"
        >
          <TldrawUiMenuContextProvider type="toolbar" sourceId="toolbar">
            {TRAY_SHAPES.map((shape) => (
              <ToolbarItem key={shape} tool={shape} />
            ))}
          </TldrawUiMenuContextProvider>
        </TldrawUiToolbar>
      </div>

      <DefaultToolbar minItems={DOCK_ITEM_COUNT} maxItems={DOCK_ITEM_COUNT}>
        {/* Pen things first: the meeting flow starts with the Pencil. */}
        <DrawToolbarItem />
        <SelectToolbarItem />
        <EraserToolbarItem />
        <TextToolbarItem />
        <div className="qs-dock-rule" aria-hidden="true" />
        {/* The five shapes a meeting actually reaches for. */}
        <RectangleToolbarItem />
        <EllipseToolbarItem />
        <DiamondToolbarItem />
        <ArrowToolbarItem />
        <LineToolbarItem />
        <div className="qs-dock-rule" aria-hidden="true" />
        <TldrawUiToolbarButton
          type="tool"
          className="qs-tray-toggle"
          title="More shapes"
          aria-expanded={open}
          aria-controls="qs-shape-tray"
          isActive={activeTrayShape !== null}
          onClick={() => setOpen((v) => !v)}
          onTouchStart={(event) => {
            // Same pattern tldraw's own tool buttons use: act on touchstart
            // and cancel the synthetic click so the toggle fires once.
            event.preventDefault()
            setOpen((v) => !v)
          }}
        >
          <TrayGlyph />
          {activeTrayShape !== null ? (
            <span className="qs-tray-toggle__dot" aria-hidden="true" />
          ) : null}
        </TldrawUiToolbarButton>
      </DefaultToolbar>
    </div>
  )
}

// The default panel, re-dressed: a quiet caption up top, everything else
// restyled from CSS (the panel's behavior is exactly stock tldraw).
function QuietStudioStylePanel() {
  return (
    <DefaultStylePanel>
      <div className="qs-style-caption">Style</div>
      <DefaultStylePanelContent />
    </DefaultStylePanel>
  )
}

const components: Partial<TLComponents> = {
  Toolbar: QuietStudioToolbar,
  StylePanel: QuietStudioStylePanel,
}

export default {
  slug: 'quiet-studio',
  label: 'Quiet Studio',
  components,
}

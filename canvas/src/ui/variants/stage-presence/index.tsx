// Stage Presence: chrome designed for the audience watching through SharePad.
// The canvas is the star. While a mark-making tool is on the canvas (and for
// ~2s after pen-up) every panel dims to a ghost — opacity only, hit targets
// frozen in place — and any tap on chrome raises the house lights instantly.
//
// Structure:
// - StageToolbar wires the choreography (one editor event listener + one
//   capture pointerdown listener on the tldraw container) and renders the
//   bottom dock plus the right-thumb-edge shape tray.
// - The scope class `variant-stage-presence` and the `data-sp-ghost`
//   attribute live on the tldraw container (editor.getContainer()), so the
//   menu zone and portalled popovers — chrome we do not own as components —
//   inherit the same skin and the same fade without overriding MainMenu or
//   QuickActions.
//
// Shape vocabulary (all 20 GeoShapeGeoStyle values, no overflow hunting):
// - Dock (always visible): rectangle, ellipse, diamond + core tools.
// - Rail (always visible, right edge): triangle, cloud, star, hexagon, x-box.
// - Tray grid (one tap on the rail's More button): the remaining 12.
import { useEffect } from 'react'
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
  NoteToolbarItem,
  RectangleToolbarItem,
  SelectToolbarItem,
  TextToolbarItem,
  TldrawUiMenuContextProvider,
  TldrawUiOrientationProvider,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  ToolbarItem,
  atom,
  track,
  useEditor,
  useValue,
  type Editor,
  type TLComponents,
  type TLEventInfo,
} from 'tldraw'
import './stage-presence.css'

/** How long the chrome stays ghosted after the last pen-up. */
const GHOST_LINGER_MS = 1800

/** Tools whose canvas pointer-down means "performing": dim the chrome. */
const MARK_MAKING_TOOLS = new Set([
  'draw',
  'eraser',
  'highlight',
  'geo',
  'arrow',
  'line',
  'laser',
])

// Number of dock items below. minItems === maxItems pins DefaultToolbar's
// OverflowingToolbar budget so no tool is ever demoted into the "..." menu.
const DOCK_TOOL_COUNT = 10

// Frequent extra geo shapes, always visible on the right-edge rail.
const RAIL_GEO = ['triangle', 'cloud', 'star', 'hexagon', 'x-box'] as const

// Everything else in tldraw's geo set, one tap away in the tray grid.
// Together with the dock's rectangle/ellipse/diamond and the rail, this
// covers all 20 GeoShapeGeoStyle values. Tool ids equal geo values (each geo
// value is registered as its own TLUiToolItem by tldraw's useTools).
const TRAY_GEO = [
  'oval',
  'trapezoid',
  'rhombus',
  'rhombus-2',
  'pentagon',
  'octagon',
  'heart',
  'check-box',
  'arrow-up',
  'arrow-down',
  'arrow-left',
  'arrow-right',
] as const

/** Shared, module-level stage state: one truth for every piece of chrome. */
const chromeGhosted = atom('stage-presence: chrome ghosted', false)
const trayExpanded = atom('stage-presence: shape tray expanded', false)

/**
 * Wires the lighting board. One listener on the editor's event stream (an
 * early-return name switch, so `pointer_move` costs a string compare) and one
 * capture-phase pointerdown listener on the container to raise the lights the
 * instant any chrome is touched.
 */
function useStageDirection(editor: Editor) {
  useEffect(() => {
    const container = editor.getContainer()
    container.classList.add('variant-stage-presence')

    let linger: ReturnType<typeof setTimeout> | undefined
    let strokeInFlight = false

    const onEditorEvent = (info: TLEventInfo) => {
      switch (info.name) {
        case 'pointer_down': {
          // Editor events only fire for canvas interactions; chrome taps
          // never reach here. Any canvas touch dismisses the tray.
          trayExpanded.set(false)
          if (!MARK_MAKING_TOOLS.has(editor.getCurrentToolId())) return
          strokeInFlight = true
          clearTimeout(linger)
          chromeGhosted.set(true)
          break
        }
        case 'pointer_up':
        case 'cancel':
        case 'complete':
        case 'interrupt': {
          if (!strokeInFlight) return
          strokeInFlight = false
          clearTimeout(linger)
          linger = setTimeout(() => chromeGhosted.set(false), GHOST_LINGER_MS)
          break
        }
        default:
          // pointer_move / tick / wheel / pinch / keys: no work.
          break
      }
    }

    const onChromePointerDown = (domEvent: PointerEvent) => {
      // Any tap on chrome (the UI layout layer) raises the lights instantly.
      const target = domEvent.target
      if (target instanceof Element && target.closest('.tlui-layout')) {
        clearTimeout(linger)
        chromeGhosted.set(false)
      }
    }

    editor.on('event', onEditorEvent)
    container.addEventListener('pointerdown', onChromePointerDown, {
      capture: true,
    })
    return () => {
      editor.off('event', onEditorEvent)
      container.removeEventListener('pointerdown', onChromePointerDown, {
        capture: true,
      })
      clearTimeout(linger)
      container.classList.remove('variant-stage-presence')
      container.removeAttribute('data-sp-ghost')
      chromeGhosted.set(false)
      trayExpanded.set(false)
    }
  }, [editor])
}

/** Mirrors the ghost atom onto the container so CSS can fade all chrome. */
function useGhostAttribute(editor: Editor) {
  const ghosted = useValue(chromeGhosted)
  useEffect(() => {
    editor.getContainer().setAttribute('data-sp-ghost', String(ghosted))
  }, [editor, ghosted])
}

/**
 * Right-thumb-edge shape tray: a slim vertical rail of five frequent shapes
 * plus a More toggle that flares the remaining twelve out as a fixed 3x4
 * grid. Expansion is a deliberate open/close (scale + fade in place); the
 * ghost choreography never moves any of these hit targets.
 */
const ShapeTray = track(function ShapeTray() {
  const editor = useEditor()
  const expanded = trayExpanded.get()

  // Light the More toggle when the active geo shape lives inside the closed
  // tray, so the performer (and the audience) can see where the tool came
  // from without opening it.
  const nextGeo = editor.getStyleForNextShape(GeoShapeGeoStyle)
  const trayHoldsActive =
    editor.getCurrentToolId() === 'geo' &&
    (TRAY_GEO as readonly string[]).includes(nextGeo)

  return (
    <div className="sp-tray" data-expanded={expanded ? 'true' : 'false'}>
      <div
        className="sp-tray__flyout"
        // Close after a pick (tldraw tool buttons select on touchstart, which
        // suppresses click, so listen to the pointer, not the click).
        onPointerUp={() => trayExpanded.set(false)}
      >
        <TldrawUiOrientationProvider orientation="horizontal" tooltipSide="top">
          <TldrawUiToolbar label="More shapes" orientation="grid" className="sp-tray__grid">
            <TldrawUiMenuContextProvider type="toolbar" sourceId="toolbar">
              {TRAY_GEO.map((geo) => (
                <ToolbarItem key={geo} tool={geo} />
              ))}
            </TldrawUiMenuContextProvider>
          </TldrawUiToolbar>
        </TldrawUiOrientationProvider>
      </div>
      <TldrawUiOrientationProvider orientation="vertical" tooltipSide="left">
        <TldrawUiToolbar label="Shape tray" orientation="vertical" className="sp-tray__rail">
          <TldrawUiMenuContextProvider type="toolbar" sourceId="toolbar">
            {RAIL_GEO.map((geo) => (
              <ToolbarItem key={geo} tool={geo} />
            ))}
          </TldrawUiMenuContextProvider>
          <TldrawUiToolbarButton
            type="icon"
            className="sp-tray__more"
            title={expanded ? 'Hide more shapes' : 'More shapes'}
            aria-expanded={expanded}
            isActive={trayHoldsActive}
            onClick={() => trayExpanded.set(!expanded)}
          >
            {/* Inline glyph (no asset): square / circle / triangle / diamond,
                one consistent stroke, reads as "shapes" on a video stream. */}
            <svg
              className="sp-tray__more-glyph"
              width="22"
              height="22"
              viewBox="0 0 22 22"
              fill="none"
              aria-hidden="true"
            >
              <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="15.5" cy="6.5" r="3.6" stroke="currentColor" strokeWidth="1.7" />
              <path d="M6.5 12.8 L10 19 H3 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
              <path d="M15.5 12 L19.2 15.5 L15.5 19 L11.8 15.5 Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
            </svg>
          </TldrawUiToolbarButton>
        </TldrawUiToolbar>
      </TldrawUiOrientationProvider>
    </div>
  )
})

/** Bottom dock: every core tool + the three headline shapes, pinned. */
function StageToolbar() {
  const editor = useEditor()
  useStageDirection(editor)
  useGhostAttribute(editor)
  return (
    <>
      <DefaultToolbar minItems={DOCK_TOOL_COUNT} maxItems={DOCK_TOOL_COUNT}>
        {/* Draw first: the meeting flow starts with the Pencil. */}
        <DrawToolbarItem />
        <SelectToolbarItem />
        <EraserToolbarItem />
        <RectangleToolbarItem />
        <EllipseToolbarItem />
        <DiamondToolbarItem />
        <ArrowToolbarItem />
        <LineToolbarItem />
        <TextToolbarItem />
        <NoteToolbarItem />
      </DefaultToolbar>
      <ShapeTray />
    </>
  )
}

/**
 * Style panel: tldraw's proven controls under a quiet marquee label, re-lit
 * by stage-presence.css. Rendering DefaultStylePanelContent as children keeps
 * every picker and its context wiring intact.
 */
function StageStylePanel() {
  return (
    <DefaultStylePanel>
      <div className="sp-style-marquee" aria-hidden="true">
        Styles
      </div>
      <DefaultStylePanelContent />
    </DefaultStylePanel>
  )
}

const components: Partial<TLComponents> = {
  Toolbar: StageToolbar,
  StylePanel: StageStylePanel,
}

export default {
  slug: 'stage-presence',
  label: 'Stage Presence',
  components,
}

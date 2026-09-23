// Stage Presence — the app's chrome, designed for the audience watching
// through SharePad. Won the design bake-off on device (issue #19); the
// competing treatments live on the prototype/chrome-variants branch.
// The canvas is the star. While a mark-making tool is on the canvas (and for
// ~2s after pen-up) every panel dims to a ghost — opacity only, hit targets
// frozen in place — and any tap on chrome raises the house lights instantly.
//
// Structure:
// - StageToolbar wires the choreography (one editor event listener + one
//   capture pointerdown listener on the tldraw container) and renders ONE
//   bottom dock (device feedback #29: no second toolbar).
// - The scope class `variant-stage-presence` and the `data-sp-ghost`
//   attribute live on the tldraw container (editor.getContainer()), so the
//   menu zone and portalled popovers — chrome we do not own as components —
//   inherit the same skin and the same fade without overriding MainMenu or
//   QuickActions.
//
// Shape vocabulary (all 20 GeoShapeGeoStyle values, no overflow hunting):
// - Dock (always visible): draw, select, eraser, arrow, line, text, note +
//   rectangle, ellipse, diamond, triangle, cloud, star + the shape tray.
// - Shape tray (one tap, opens above the dock): the remaining 14.
import { useEffect, useState } from 'react'
import {
  ArrowToolbarItem,
  CloudToolbarItem,
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
  StarToolbarItem,
  TextToolbarItem,
  TldrawUiButtonIcon,
  TldrawUiMenuContextProvider,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  ToolbarItem,
  TriangleToolbarItem,
  useEditor,
  useValue,
  type Editor,
  type TLComponents,
  type TLEventInfo,
  type TLGeoShapeGeoStyle,
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

// Number of dock items below (7 tools + 6 shapes + the tray trigger).
// minItems === maxItems pins DefaultToolbar's OverflowingToolbar budget so
// no tool is ever demoted into the "..." menu.
const DOCK_TOOL_COUNT = 14

// Everything in tldraw's geo set beyond the dock's six. Together they cover
// all 20 GeoShapeGeoStyle values. Tool ids equal geo values (each geo value
// is registered as its own TLUiToolItem by tldraw's useTools).
const TRAY_GEO = [
  'hexagon',
  'x-box',
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

const SHAPE_TRAY_ID = 'stage-shape-tray'

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

    const setGhosted = (ghosted: boolean) => {
      container.setAttribute('data-sp-ghost', String(ghosted))
    }
    setGhosted(false)

    const onEditorEvent = (info: TLEventInfo) => {
      switch (info.name) {
        case 'pointer_down': {
          if (!MARK_MAKING_TOOLS.has(editor.getCurrentToolId())) return
          strokeInFlight = true
          clearTimeout(linger)
          setGhosted(true)
          break
        }
        case 'pointer_up':
        case 'cancel':
        case 'complete':
        case 'interrupt': {
          if (!strokeInFlight) return
          strokeInFlight = false
          clearTimeout(linger)
          linger = setTimeout(() => setGhosted(false), GHOST_LINGER_MS)
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
        setGhosted(false)
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
    }
  }, [editor])
}

/**
 * The shape tray: a dock button that opens the remaining fourteen geo shapes
 * in a grid above the dock. Reuses tldraw's overflow-popover machinery
 * (toolbar-overflow menu context + close-on-select via the content toolbar's
 * bubble-phase onClick), so touch selection, tooltips, and roving focus all
 * behave exactly like the stock overflow menu.
 */
function ShapeTray() {
  const editor = useEditor()
  const [isOpen, setIsOpen] = useState(false)

  // Which tray shape (if any) is the live tool: the trigger wears its icon
  // so the current tool is always visible somewhere on the dock.
  const activeTrayGeo = useValue(
    'stage: active tray shape',
    (): TLGeoShapeGeoStyle | null => {
      if (editor.getCurrentToolId() !== 'geo') return null
      const geo = editor.getSharedStyles().getAsKnownValue(GeoShapeGeoStyle)
      return geo && (TRAY_GEO as readonly string[]).includes(geo) ? geo : null
    },
    [editor]
  )

  const closeTray = () => {
    editor.menus.deleteOpenMenu(SHAPE_TRAY_ID)
    setIsOpen(false)
  }

  return (
    <TldrawUiPopover id={SHAPE_TRAY_ID} open={isOpen} onOpenChange={setIsOpen}>
      <TldrawUiPopoverTrigger>
        <TldrawUiToolbarButton
          type="tool"
          className="sp-tray-trigger"
          data-value="shape-tray"
          title="More shapes"
          aria-pressed={activeTrayGeo ? 'true' : 'false'}
          isActive={activeTrayGeo !== null}
        >
          {activeTrayGeo ? (
            <TldrawUiButtonIcon icon={`geo-${activeTrayGeo}`} />
          ) : (
            <ShapeTrayGlyph />
          )}
        </TldrawUiToolbarButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent side="top" align="end" sideOffset={12}>
        <TldrawUiToolbar
          orientation="grid"
          className="sp-shape-tray-grid"
          label="More shapes"
          onClick={closeTray}
        >
          <TldrawUiMenuContextProvider type="toolbar-overflow" sourceId="toolbar">
            {TRAY_GEO.map((geo) => (
              <ToolbarItem key={geo} tool={geo} />
            ))}
          </TldrawUiMenuContextProvider>
        </TldrawUiToolbar>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  )
}

// Inline glyph (no asset): square / circle / triangle / diamond, one
// consistent stroke, reads as "shapes" on a video stream.
function ShapeTrayGlyph() {
  return (
    <svg
      className="sp-tray-glyph"
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
  )
}

/** The one dock: tools first, then shapes, then the tray. */
function StageToolbar() {
  const editor = useEditor()
  useStageDirection(editor)
  return (
    <DefaultToolbar minItems={DOCK_TOOL_COUNT} maxItems={DOCK_TOOL_COUNT}>
      {/* Draw first: the meeting flow starts with the Pencil. */}
      <DrawToolbarItem />
      <SelectToolbarItem />
      <EraserToolbarItem />
      <ArrowToolbarItem />
      <LineToolbarItem />
      <TextToolbarItem />
      <NoteToolbarItem />
      {/* The six shapes a meeting actually reaches for, tray at the end. */}
      <RectangleToolbarItem />
      <EllipseToolbarItem />
      <DiamondToolbarItem />
      <TriangleToolbarItem />
      <CloudToolbarItem />
      <StarToolbarItem />
      <ShapeTray />
    </DefaultToolbar>
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

export const stagePresenceComponents: Partial<TLComponents> = {
  Toolbar: StageToolbar,
  StylePanel: StageStylePanel,
}

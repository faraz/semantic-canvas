// Tactile Toy variant: dimensional keycap chrome for the meeting whiteboard.
//
// Structure: the nine core tools stay pinned in DefaultToolbar (minItems ===
// maxItems keeps every item out of the "..." overflow, same trick as the
// baseline TabletToolbar), and one extra slot is a spring-out "shape tray"
// popover holding the rest of tldraw's real GeoShapeGeoStyle values. The tray
// reuses tldraw's own overflow-popover machinery (toolbar-overflow menu
// context + close-on-select via the content toolbar's onClick), so touch
// selection, drag-to-create, tooltips, and roving focus all behave exactly
// like the stock overflow menu — only the skin is ours.
import { useState } from 'react'
import {
  ArrowToolbarItem,
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
  TldrawUiButtonIcon,
  TldrawUiMenuContextProvider,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  ToolbarItem,
  useEditor,
  useValue,
  type TLComponents,
  type TLGeoShapeGeoStyle,
} from 'tldraw'
import './tactile-toy.css'

// Rectangle / ellipse / diamond are first-class keys on the toolbar; every
// other geo style lives in the tray. The curated order puts the friendly,
// meeting-frequent shapes first. The trailing filter is a completeness
// guard: if a tldraw upgrade adds a geo value we did not curate, it still
// appears at the end of the tray instead of becoming unreachable.
const ON_TOOLBAR: ReadonlySet<TLGeoShapeGeoStyle> = new Set([
  'rectangle',
  'ellipse',
  'diamond',
])
const TRAY_ORDER: readonly TLGeoShapeGeoStyle[] = [
  'triangle',
  'star',
  'heart',
  'cloud',
  'hexagon',
  'pentagon',
  'octagon',
  'oval',
  'rhombus',
  'rhombus-2',
  'trapezoid',
  'x-box',
  'check-box',
  'arrow-up',
  'arrow-right',
  'arrow-down',
  'arrow-left',
]
const TRAY_GEOS: readonly TLGeoShapeGeoStyle[] = [
  ...TRAY_ORDER.filter((geo) => GeoShapeGeoStyle.values.includes(geo)),
  ...GeoShapeGeoStyle.values.filter(
    (geo) => !ON_TOOLBAR.has(geo) && !TRAY_ORDER.includes(geo)
  ),
]

const SHAPE_TRAY_ID = 'tactile-toy-shape-tray'

// Toy-block cluster: triangle over square + circle, one consistent fill
// weight. Drawn inline (currentColor) so it inherits the keycap ink like
// every masked tldraw icon.
function ShapeClusterGlyph() {
  return (
    <svg
      className="ttoy-tray-glyph"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2.4 16.9 10.7h-9.8Z" />
      <rect x="3" y="13.2" width="8.1" height="8.1" rx="1.6" />
      <circle cx="17.6" cy="17.3" r="4.1" />
    </svg>
  )
}

function ShapeTray() {
  const editor = useEditor()
  const [isOpen, setIsOpen] = useState(false)

  // Which tray shape (if any) is the live tool. Mirrors tldraw's own
  // useIsToolSelected logic: the geo tool is one tool parameterized by the
  // shared GeoShapeGeoStyle value.
  const activeTrayGeo = useValue(
    'active tray shape',
    (): TLGeoShapeGeoStyle | null => {
      if (editor.getCurrentToolId() !== 'geo') return null
      const geo = editor.getSharedStyles().getAsKnownValue(GeoShapeGeoStyle)
      return geo && TRAY_GEOS.includes(geo) ? geo : null
    },
    [editor]
  )

  const closeTray = () => {
    // Same close routine as tldraw's stock overflow popover: clear the menu
    // from the editor's open-menu state, then drop our controlled flag.
    editor.menus.deleteOpenMenu(SHAPE_TRAY_ID)
    setIsOpen(false)
  }

  return (
    <TldrawUiPopover id={SHAPE_TRAY_ID} open={isOpen} onOpenChange={setIsOpen}>
      <TldrawUiPopoverTrigger>
        <TldrawUiToolbarButton
          type="tool"
          className="ttoy-tray-trigger"
          data-value="shape-tray"
          title="More shapes"
          aria-pressed={activeTrayGeo ? 'true' : 'false'}
          isActive={activeTrayGeo !== null}
        >
          {/* The trigger remembers: while a tray shape is the active tool it
              wears that shape's icon; otherwise the toy-block cluster. */}
          {activeTrayGeo ? (
            <TldrawUiButtonIcon icon={`geo-${activeTrayGeo}`} />
          ) : (
            <ShapeClusterGlyph />
          )}
        </TldrawUiToolbarButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent side="top" align="center" sideOffset={14}>
        <TldrawUiToolbar
          orientation="grid"
          className="ttoy-tray-grid"
          label="More shapes"
          // Bubble-phase click fires after the item's own select handler, so
          // the tool is already chosen when the tray snaps shut (identical to
          // OverflowingToolbar's close-on-select).
          onClick={closeTray}
        >
          <TldrawUiMenuContextProvider type="toolbar-overflow" sourceId="toolbar">
            {TRAY_GEOS.map((geo) => (
              <ToolbarItem key={geo} tool={geo} />
            ))}
          </TldrawUiMenuContextProvider>
        </TldrawUiToolbar>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  )
}

// 9 pinned tools + the shape tray. minItems === maxItems pins the overflow
// budget so DefaultToolbar never demotes an item into the "..." popover.
const TOOL_COUNT = 10

function TactileToolbar() {
  return (
    <DefaultToolbar minItems={TOOL_COUNT} maxItems={TOOL_COUNT}>
      {/* Mark-making cluster: the meeting flow starts with the Pencil. */}
      <DrawToolbarItem />
      <SelectToolbarItem />
      <EraserToolbarItem />
      {/* Shape cluster (cool family), tray at its end. */}
      <RectangleToolbarItem />
      <EllipseToolbarItem />
      <DiamondToolbarItem />
      <ArrowToolbarItem />
      <LineToolbarItem />
      <ShapeTray />
      {/* Text closes the strip. */}
      <TextToolbarItem />
    </DefaultToolbar>
  )
}

// Style panel + menu zone are re-skinned purely via scoped CSS on tldraw's
// stable .tlui-* classes (see tactile-toy.css), so MainMenu / QuickActions
// keep their existing behavior untouched.
const components: Partial<TLComponents> = {
  Toolbar: TactileToolbar,
}

export default {
  slug: 'tactile-toy',
  label: 'Tactile Toy',
  components,
}

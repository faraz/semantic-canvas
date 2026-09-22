// Tablet toolbar: every common tool directly visible, no overflow hunting.
//
// Rectangle / ellipse / diamond are tldraw's single `geo` tool parameterized
// by the shared GeoShapeGeoStyle; the exported per-shape *ToolbarItem
// components (RectangleToolbarItem etc.) select the geo style value and
// highlight the active variant via useIsToolSelected, so we can surface them
// as three first-class buttons without touching tool registration.
import {
  ArrowToolbarItem,
  DefaultToolbar,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  LineToolbarItem,
  RectangleToolbarItem,
  SelectToolbarItem,
  TextToolbarItem,
} from 'tldraw'

// Number of items below. Passing minItems === maxItems pins the item budget
// of DefaultToolbar's OverflowingToolbar: itemsToShow is always TOOL_COUNT,
// so no tool is ever demoted into the "..." overflow popover, regardless of
// the measured toolbar width. On the target device (12.9" iPad, landscape)
// there is ample room; this simply removes the desktop responsive behavior.
const TOOL_COUNT = 9

export function TabletToolbar() {
  return (
    <DefaultToolbar minItems={TOOL_COUNT} maxItems={TOOL_COUNT}>
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
    </DefaultToolbar>
  )
}

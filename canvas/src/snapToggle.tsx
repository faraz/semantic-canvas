// UI for the Snap preference (snapPreference.ts), reachable two ways:
// - SnapToggleMenuItem: a "Snapping" checkbox in the main menu, alongside
//   "New board" (discoverable).
// - QuickActions: tldraw's quick-actions slot (undo/redo/delete/duplicate)
//   with a magnet toggle button appended. tldraw places the slot next to the
//   main menu button at tablet breakpoints and inside the toolbar overflow on
//   narrow ones, so the toggle is one tap from the drawing surface on iPad
//   without this code owning any layout — and without touching the Toolbar
//   or StylePanel components (ticket #17's lane).
import { useSyncExternalStore } from 'react'
import {
  DefaultQuickActions,
  DefaultQuickActionsContent,
  TldrawUiMenuCheckboxItem,
  TldrawUiMenuItem,
} from 'tldraw'
import { isSnapEnabled, setSnapEnabled, subscribeSnapEnabled } from './snapPreference'

function useSnapEnabled(): boolean {
  return useSyncExternalStore(subscribeSnapEnabled, isSnapEnabled)
}

export function SnapToggleMenuItem() {
  const snapEnabled = useSnapEnabled()
  return (
    <TldrawUiMenuCheckboxItem
      id="toggle-snapping"
      label="Snapping"
      checked={snapEnabled}
      onSelect={() => setSnapEnabled(!snapEnabled)}
    />
  )
}

export function QuickActions() {
  const snapEnabled = useSnapEnabled()
  return (
    <DefaultQuickActions>
      <DefaultQuickActionsContent />
      <TldrawUiMenuItem
        id="toggle-snapping"
        label={snapEnabled ? 'Snapping on' : 'Snapping off'}
        icon={<MagnetIcon />}
        isSelected={snapEnabled}
        onSelect={() => setSnapEnabled(!snapEnabled)}
      />
    </DefaultQuickActions>
  )
}

// Horseshoe magnet, stroke-drawn in currentColor so it follows tldraw's
// button theming. In the quick-actions row it renders as an icon button
// whose pressed (active) state shows whether Snap is on.
function MagnetIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 4 V12 A7 7 0 0 0 19 12 V4 H15 V12 A3 3 0 0 1 9 12 V4 Z" />
      <path d="M5 8 H9" />
      <path d="M15 8 H19" />
    </svg>
  )
}

// Pencil palette visibility, reachable two ways (mirroring the Snap toggle):
// - PenPaletteMenuItem: a "Pencil palette" checkbox in the main menu.
// - PenPaletteQuickAction: a one-tap pencil button in the quick-actions row
//   beside the snap magnet, for summoning the palette straight from the
//   drawing surface.
// Both drive the same local preference (default ON) and ask the Shell over
// the Bridge; the Shell re-asserts first responder on show, so a re-show is
// also the manual recovery path if the palette ever hides itself.
import { useSyncExternalStore } from 'react'
import { TldrawUiMenuCheckboxItem, TldrawUiMenuItem } from 'tldraw'
import { postSetPenPaletteVisible } from './bridge'

let visible = true
const listeners = new Set<() => void>()

function setVisible(next: boolean): void {
  visible = next
  postSetPenPaletteVisible(next)
  for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function usePenPaletteVisible(): boolean {
  return useSyncExternalStore(subscribe, () => visible)
}

export function PenPaletteMenuItem() {
  const isVisible = usePenPaletteVisible()
  return (
    <TldrawUiMenuCheckboxItem
      id="pen-palette"
      label="Pencil palette"
      checked={isVisible}
      onSelect={() => setVisible(!isVisible)}
    />
  )
}

export function PenPaletteQuickAction() {
  const isVisible = usePenPaletteVisible()
  return (
    <TldrawUiMenuItem
      id="pen-palette"
      label={isVisible ? 'Pencil palette on' : 'Pencil palette off'}
      icon={<PencilPaletteIcon />}
      isSelected={isVisible}
      onSelect={() => setVisible(!isVisible)}
    />
  )
}

// A pencil over a tray line — reads as "pen palette" at 18px.
function PencilPaletteIcon() {
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
      <path d="M12 3 L15 6 L8 13 L4.5 14 L5.5 10.5 Z" />
      <path d="M4 19 H20" />
      <path d="M8 19 V16.5 M12 19 V16.5 M16 19 V16.5" />
    </svg>
  )
}

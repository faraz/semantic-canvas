// The "Pencil palette" menu toggle: mirrors the palette's visibility
// preference locally (default ON — the Shell shows the palette at launch)
// and asks the Shell to show/hide it over the Bridge.
import { useSyncExternalStore } from 'react'
import { TldrawUiMenuCheckboxItem } from 'tldraw'
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

export function PenPaletteMenuItem() {
  const isVisible = useSyncExternalStore(subscribe, () => visible)
  return (
    <TldrawUiMenuCheckboxItem
      id="pen-palette"
      label="Pencil palette"
      checked={isVisible}
      onSelect={() => setVisible(!isVisible)}
    />
  )
}

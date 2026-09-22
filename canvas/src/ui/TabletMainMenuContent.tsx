// Main menu content for the tablet: tldraw's DefaultMainMenuContent minus
// the desktop cruft. Composed from the same exported submenus tldraw uses,
// so labels, shortcuts wiring, and enable/disable states stay stock.
//
// Kept: Edit (undo/redo, clipboard, group, lock), View (zoom), Export.
// Dropped, and why:
// - ExtrasGroup (insert embed / insert media): meaningless in an offline
//   WKWebView bundle.
// - KeyboardShortcutsMenuItem: also suppressed globally by the
//   `KeyboardShortcutsDialog: null` component override in App.tsx.
// - LanguageMenu: the device locale governs; a language picker is desktop
//   web cruft.
// - Preferences entries that only make sense with a mouse/keyboard or a
//   resizable browser window: edge scrolling, paste-at-cursor, focus mode
//   (would strand a touch user with no chrome), wrap mode, dynamic size,
//   debug mode, accessibility (keyboard) menu, input-device menu.
import {
  ColorSchemeMenu,
  EditSubmenu,
  ExportFileContentSubMenu,
  TldrawUiMenuGroup,
  TldrawUiMenuSubmenu,
  ToggleGridItem,
  ToggleSnapModeItem,
  ToggleToolLockItem,
  ViewSubmenu,
} from 'tldraw'

export function TabletMainMenuContent() {
  return (
    <>
      <TldrawUiMenuGroup id="basic">
        <EditSubmenu />
        <ViewSubmenu />
        <ExportFileContentSubMenu />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="preferences">
        <TldrawUiMenuSubmenu id="preferences" label="menu.preferences">
          <TldrawUiMenuGroup id="preferences-actions">
            {/* tldraw's positional "Always snap" — distinct from Shape Snap. */}
            <ToggleSnapModeItem />
            <ToggleToolLockItem />
            <ToggleGridItem />
          </TldrawUiMenuGroup>
          <TldrawUiMenuGroup id="color-scheme">
            <ColorSchemeMenu />
          </TldrawUiMenuGroup>
        </TldrawUiMenuSubmenu>
      </TldrawUiMenuGroup>
    </>
  )
}

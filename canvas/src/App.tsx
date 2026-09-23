import {
  DefaultMainMenu,
  Tldraw,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  type Editor,
  type TLComponents,
} from 'tldraw'
import 'tldraw/tldraw.css'
import './ui/tablet.css'
import { TabletMainMenuContent } from './ui/TabletMainMenuContent'
import { stagePresenceComponents } from './ui/stagePresence'
import { assetUrls } from './assetUrls'
import { postShapeSnapped } from './bridge'
import { clearBoard } from './clearBoard'
import { wireShapeSnap } from './shapeSnap/wire'
import { wireInkCapture } from './shapeSnap/capture'
import { wireIllustrationSnap } from './illustrationSnap/wire'
import { wireTemplateCapture } from './illustrationSnap/capture'
import { QuickActions, SnapToggleMenuItem } from './snapToggle'
import { wirePenPalette } from './penPalette'
import { InkDrawShapeUtil } from './ink/InkDrawShapeUtil'
import { PenPaletteMenuItem } from './penPaletteUi'
import { SessionJoinPanel, SessionMenuItem } from './ui/sessionPanel'
import { registerSessionEditor, SessionCanvas, useSessionPhase } from './session/appSession'

function MainMenu() {
  const editor = useEditor()
  return (
    <DefaultMainMenu>
      <TldrawUiMenuGroup id="board">
        <TldrawUiMenuItem
          id="new-board"
          label="New board"
          onSelect={() => clearBoard(editor)}
        />
        <SnapToggleMenuItem />
        <PenPaletteMenuItem />
        <SessionMenuItem />
      </TldrawUiMenuGroup>
      <TabletMainMenuContent />
    </DefaultMainMenu>
  )
}

const components: TLComponents = {
  MainMenu,
  QuickActions,
  // Stage Presence chrome: toolbar dock + shape rail + ghost choreography
  // and the touch-first style panel (bake-off winner, issue #19).
  ...stagePresenceComponents,
  // No hardware keyboard in the meeting flow; nulling the dialog also makes
  // tldraw's KeyboardShortcutsMenuItem render nothing everywhere.
  KeyboardShortcutsDialog: null,
  // The Session join panel (QR + .local URL), visible while hosting.
  InFrontOfTheCanvas: SessionJoinPanel,
}

// Ink presets (#31): replaces the stock draw util (same static type 'draw';
// <Tldraw> merges customs over defaults by type) so strokes render their
// PencilKit character from meta.inkPreset. Module-level: <Tldraw> compares
// the array by identity, so it must be stable across renders.
const shapeUtils = [InkDrawShapeUtil]

function mount(editor: Editor) {
  const disposeSession = registerSessionEditor(editor)
  const disposePenPalette = wirePenPalette(editor)
  const illustrationSnap = wireIllustrationSnap(editor, { onSnap: postShapeSnapped })
  const disposeSnap = wireShapeSnap(editor, {
    onSnap: postShapeSnapped,
    onInkSnapped: illustrationSnap.noteInkSnapped,
  })
  const disposeCapture = wireInkCapture(editor)
  const disposeTemplateCapture = wireTemplateCapture(editor)
  return () => {
    illustrationSnap.dispose()
    disposeSnap()
    disposeCapture()
    disposeTemplateCapture()
    disposeSession()
    disposePenPalette()
  }
}

export function App() {
  // Session (#26): while hosting, the editor joins the in-Canvas room via a
  // useSync store instead of persistenceKey — the two are exclusive, so the
  // remount at Session boundaries is a keyed mode switch (accepted per #24).
  const sessionPhase = useSessionPhase()
  if (sessionPhase === 'hosting') {
    return (
      <SessionCanvas
        key="session"
        assetUrls={assetUrls}
        components={components}
        shapeUtils={shapeUtils}
        onMount={mount}
      />
    )
  }
  return (
    <Tldraw
      key="solo"
      persistenceKey="semantic-canvas-board"
      assetUrls={assetUrls}
      components={components}
      shapeUtils={shapeUtils}
      onMount={mount}
    />
  )
}

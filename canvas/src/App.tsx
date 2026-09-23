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
import { probeLoopbackWebSocket } from './session/spikeLoopback'
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
}

function mount(editor: Editor) {
  probeLoopbackWebSocket() // SPIKE #25, removed by #27
  const disposeSession = registerSessionEditor(editor)
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
      onMount={mount}
    />
  )
}

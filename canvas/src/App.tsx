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
import { TabletToolbar } from './ui/TabletToolbar'
import { assetUrls } from './assetUrls'
import { postShapeSnapped } from './bridge'
import { clearBoard } from './clearBoard'
import { wireShapeSnap } from './shapeSnap/wire'
import { wireInkCapture } from './shapeSnap/capture'
import { wireIllustrationSnap } from './illustrationSnap/wire'
import { wireTemplateCapture } from './illustrationSnap/capture'

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
      </TldrawUiMenuGroup>
      <TabletMainMenuContent />
    </DefaultMainMenu>
  )
}

const components: TLComponents = {
  MainMenu,
  Toolbar: TabletToolbar,
  // No hardware keyboard in the meeting flow; nulling the dialog also makes
  // tldraw's KeyboardShortcutsMenuItem render nothing everywhere.
  KeyboardShortcutsDialog: null,
}

function mount(editor: Editor) {
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
  }
}

export function App() {
  return (
    <Tldraw
      persistenceKey="semantic-canvas-board"
      assetUrls={assetUrls}
      components={components}
      onMount={mount}
    />
  )
}

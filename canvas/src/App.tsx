import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  Tldraw,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  type Editor,
  type TLComponents,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { assetUrls } from './assetUrls'
import { clearBoard } from './clearBoard'
import { wireShapeSnap } from './shapeSnap/wire'
import { wireInkCapture } from './shapeSnap/capture'

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
      <DefaultMainMenuContent />
    </DefaultMainMenu>
  )
}

const components: TLComponents = { MainMenu }

function mount(editor: Editor) {
  const disposeSnap = wireShapeSnap(editor)
  const disposeCapture = wireInkCapture(editor)
  return () => {
    disposeSnap()
    disposeCapture()
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

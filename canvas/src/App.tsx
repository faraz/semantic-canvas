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
      <DefaultMainMenuContent />
    </DefaultMainMenu>
  )
}

const components: TLComponents = { MainMenu }

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

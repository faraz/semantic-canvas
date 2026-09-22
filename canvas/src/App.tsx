import {
  DefaultMainMenu,
  DefaultMainMenuContent,
  Tldraw,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  useEditor,
  type TLComponents,
} from 'tldraw'
import 'tldraw/tldraw.css'
import { clearBoard } from './clearBoard'

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

export function App() {
  return <Tldraw persistenceKey="semantic-canvas-board" components={components} />
}

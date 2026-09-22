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
import { QuickActions, SnapToggleMenuItem } from './snapToggle'
import { VariantBar, useChromeVariant } from './ui/variants/switcher'

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
  Toolbar: TabletToolbar,
  QuickActions,
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
  // PROTOTYPE (issue #19): chrome design bake-off. The variant bar swaps the
  // Toolbar/StylePanel overrides and scopes the variant's CSS via a root
  // class; 'current' is the shipped chrome. Tldraw is keyed by variant so
  // each design mounts clean (the Board persists via persistenceKey).
  const [variant, pickVariant] = useChromeVariant()
  return (
    <div
      className={`variant-${variant.slug}`}
      style={{ position: 'fixed', inset: 0 }}
    >
      <Tldraw
        key={variant.slug}
        persistenceKey="semantic-canvas-board"
        assetUrls={assetUrls}
        components={{ ...components, ...variant.components }}
        onMount={mount}
      />
      <VariantBar active={variant.slug} onPick={pickVariant} />
    </div>
  )
}

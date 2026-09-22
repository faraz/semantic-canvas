import { Tldraw, type Editor } from 'tldraw'
import 'tldraw/tldraw.css'
import { wireShapeSnap } from './shapeSnap/wire'
import { wireStrokeCapture } from './shapeSnap/capture'

function mount(editor: Editor) {
  const disposeSnap = wireShapeSnap(editor)
  const disposeCapture = wireStrokeCapture(editor)
  return () => {
    disposeSnap()
    disposeCapture()
  }
}

export function App() {
  return <Tldraw onMount={mount} />
}

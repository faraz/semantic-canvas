import type { Editor } from 'tldraw'

// New-board action: wipe the single Board back to blank. With persistenceKey
// set, tldraw persists the emptied store like any other change.
export function clearBoard(editor: Editor) {
  editor.run(
    () => {
      editor.selectNone()
      editor.deleteShapes([...editor.getCurrentPageShapeIds()])
      editor.setCamera({ x: 0, y: 0, z: 1 })
    },
    { ignoreShapeLock: true },
  )
}

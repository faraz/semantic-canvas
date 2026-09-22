// @vitest-environment jsdom
import './tldrawTestShims'
import { describe, expect, it } from 'vitest'
import { createShapeId } from 'tldraw'
import { clearBoard } from './clearBoard'
import { makeTestEditor } from './tldrawTestEditor'



describe('clearBoard', () => {
  it('deletes every shape on the page, locked ones included', () => {
    const editor = makeTestEditor()
    editor.createShapes([
      { id: createShapeId('a'), type: 'geo', x: 0, y: 0 },
      { id: createShapeId('b'), type: 'geo', x: 100, y: 100, isLocked: true },
    ])
    expect(editor.getCurrentPageShapeIds().size).toBe(2)

    clearBoard(editor)

    expect(editor.getCurrentPageShapeIds().size).toBe(0)
  })

  it('resets the camera to the origin', () => {
    const editor = makeTestEditor()
    editor.setCamera({ x: 500, y: -300, z: 2 })

    clearBoard(editor)

    expect(editor.getCamera()).toMatchObject({ x: 0, y: 0, z: 1 })
  })
})

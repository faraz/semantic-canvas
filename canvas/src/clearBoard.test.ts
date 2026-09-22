// @vitest-environment jsdom
import './tldrawTestShims'
import { describe, expect, it } from 'vitest'
import {
  Editor,
  createShapeId,
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  defaultTools,
} from 'tldraw'
import { clearBoard } from './clearBoard'

function makeEditor() {
  return new Editor({
    store: createTLStore({
      shapeUtils: defaultShapeUtils,
      bindingUtils: defaultBindingUtils,
    }),
    shapeUtils: defaultShapeUtils,
    bindingUtils: defaultBindingUtils,
    tools: defaultTools,
    getContainer: () => document.body,
  })
}

describe('clearBoard', () => {
  it('deletes every shape on the page, locked ones included', () => {
    const editor = makeEditor()
    editor.createShapes([
      { id: createShapeId('a'), type: 'geo', x: 0, y: 0 },
      { id: createShapeId('b'), type: 'geo', x: 100, y: 100, isLocked: true },
    ])
    expect(editor.getCurrentPageShapeIds().size).toBe(2)

    clearBoard(editor)

    expect(editor.getCurrentPageShapeIds().size).toBe(0)
  })

  it('resets the camera to the origin', () => {
    const editor = makeEditor()
    editor.setCamera({ x: 500, y: -300, z: 2 })

    clearBoard(editor)

    expect(editor.getCamera()).toMatchObject({ x: 0, y: 0, z: 1 })
  })
})

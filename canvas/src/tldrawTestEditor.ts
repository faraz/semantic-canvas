// Shared headless tldraw Editor for tests. Import tldrawTestShims first in
// the test file (jsdom environment required).
import {
  Editor,
  createTLStore,
  defaultBindingUtils,
  defaultShapeTools,
  defaultShapeUtils,
  defaultTools,
} from 'tldraw'
import { InkDrawShapeUtil } from './ink/InkDrawShapeUtil'

// The production util set: InkDrawShapeUtil replaces the stock draw util
// (same static type 'draw'), exactly as <Tldraw shapeUtils> merges it in the
// app — so every headless test runs against what ships.
const shapeUtils = [
  InkDrawShapeUtil,
  ...defaultShapeUtils.filter((util) => util.type !== 'draw'),
]

export function makeTestEditor(): Editor {
  return new Editor({
    store: createTLStore({
      shapeUtils,
      bindingUtils: defaultBindingUtils,
    }),
    shapeUtils,
    bindingUtils: defaultBindingUtils,
    tools: [...defaultTools, ...defaultShapeTools],
    getContainer: () => document.body,
  })
}

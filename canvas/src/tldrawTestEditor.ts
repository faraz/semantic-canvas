// Shared headless tldraw Editor for tests. Import tldrawTestShims first in
// the test file (jsdom environment required).
import {
  Editor,
  createTLStore,
  defaultBindingUtils,
  defaultShapeUtils,
  defaultTools,
} from 'tldraw'

export function makeTestEditor(): Editor {
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

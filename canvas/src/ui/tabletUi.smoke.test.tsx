// @vitest-environment jsdom
// Smoke render of the tablet UI overrides inside a real <Tldraw> mount.
// Deliberately no persistenceKey: jsdom has no IndexedDB.
import '../tldrawTestShims'
import { describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { Tldraw } from 'tldraw'
import { TabletToolbar } from './TabletToolbar'

;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

// jsdom's HTMLImageElement lacks decode(); tldraw's icon preloader calls it.
HTMLImageElement.prototype.decode ??= function () {
  return Promise.resolve()
}

// jsdom has no CSS Font Loading API; tldraw's FontManager news up FontFace
// instances, load()s them, and adds them to document.fonts (which it also
// iterates for dedup). A resolved load and a plain Set cover that.
class FontFaceShim {
  constructor(
    public family: string,
    _source: string,
    descriptors?: Record<string, string>
  ) {
    Object.assign(this, descriptors)
  }
  load() {
    return Promise.resolve(this)
  }
}
;(globalThis as any).FontFace ??= FontFaceShim
if (!(document as any).fonts) {
  Object.defineProperty(document, 'fonts', {
    value: new Set(),
    configurable: true,
  })
}

// jsdom has no 2D canvas: getContext('2d') returns null, which makes
// tldraw's pattern-fill generator call a bare reject() — an unhandled
// rejection that fails the vitest run. Hand it an inert context instead;
// toBlob stays a jsdom no-op, so the generator just never settles. Other
// context kinds (the minimap probes webgl) keep returning null.
const inertCtx: any = new Proxy(
  {},
  { get: () => () => undefined, set: () => true }
)
const originalGetContext = HTMLCanvasElement.prototype.getContext
HTMLCanvasElement.prototype.getContext = function (
  this: HTMLCanvasElement,
  kind: string,
  ...rest: any[]
) {
  if (kind === '2d') return inertCtx
  return (originalGetContext as any).call(this, kind, ...rest)
} as typeof HTMLCanvasElement.prototype.getContext

describe('tablet ui smoke', () => {
  it('renders the toolbar with the nine tools and no overflow button', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const root = createRoot(el)
    await act(async () => {
      root.render(<Tldraw components={{ Toolbar: TabletToolbar }} />)
    })

    // Every common tool is a first-class toolbar button...
    const toolIds = [
      'draw',
      'select',
      'eraser',
      'rectangle',
      'ellipse',
      'diamond',
      'arrow',
      'line',
      'text',
    ]
    for (const id of toolIds) {
      expect(
        el.querySelector(`[data-testid="tools.${id}"]`),
        `tools.${id} should be in the toolbar`
      ).toBeTruthy()
    }

    // ...and none is demoted to the "..." overflow. jsdom measures the
    // toolbar at width 0, so this only passes because TabletToolbar pins
    // minItems === maxItems; the default toolbar would show the overflow
    // button here.
    expect(el.querySelector('[data-testid="tools.more-button"]')).toBeNull()

    await act(async () => root.unmount())
    el.remove()
  })
})

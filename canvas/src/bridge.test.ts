// Contract tests for the Bridge, against a faked webkit message handler.
// Runs in the plain node environment: the Bridge must cope with any degree
// of window/webkit absence, so each case stubs exactly what it needs.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { postShapeSnapped } from './bridge'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the Bridge', () => {
  it('posts the exact versioned shapeSnapped message to the Shell', () => {
    const postMessage = vi.fn()
    vi.stubGlobal('window', {
      webkit: { messageHandlers: { bridge: { postMessage } } },
    })

    postShapeSnapped()

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith({ v: 1, event: 'shapeSnapped' })
  })

  it('is a no-op when webkit is absent (browser dev)', () => {
    vi.stubGlobal('window', {})

    expect(() => postShapeSnapped()).not.toThrow()
  })

  it('is a no-op when the bridge handler is absent', () => {
    vi.stubGlobal('window', { webkit: { messageHandlers: {} } })

    expect(() => postShapeSnapped()).not.toThrow()
  })

  it('is a no-op when window itself is absent (node)', () => {
    expect(() => postShapeSnapped()).not.toThrow()
  })
})

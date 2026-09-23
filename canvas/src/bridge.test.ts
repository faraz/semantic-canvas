// Contract tests for the Bridge, against a faked webkit message handler
// (Canvas→Shell) and direct window.__bridgeReceive invocation, exactly as
// the Shell's evaluateJavaScript does (Shell→Canvas).
// Runs in the plain node environment: the Bridge must cope with any degree
// of window/webkit absence, so each case stubs exactly what it needs.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  onBridgeMessage,
  postShapeSnapped,
  postStartSessionRequested,
  postStopSessionRequested,
} from './bridge'

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubShell() {
  const postMessage = vi.fn()
  vi.stubGlobal('window', {
    webkit: { messageHandlers: { bridge: { postMessage } } },
  })
  return postMessage
}

describe('the Bridge, Canvas→Shell', () => {
  it('posts the exact versioned shapeSnapped message to the Shell', () => {
    const postMessage = stubShell()

    postShapeSnapped()

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith({ v: 1, event: 'shapeSnapped' })
  })

  it('posts the exact versioned startSessionRequested message', () => {
    const postMessage = stubShell()

    postStartSessionRequested()

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith({
      v: 1,
      event: 'startSessionRequested',
    })
  })

  it('posts the exact versioned stopSessionRequested message', () => {
    const postMessage = stubShell()

    postStopSessionRequested()

    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith({
      v: 1,
      event: 'stopSessionRequested',
    })
  })

  it('is a no-op when webkit is absent (browser dev)', () => {
    vi.stubGlobal('window', {})

    expect(() => postShapeSnapped()).not.toThrow()
    expect(() => postStartSessionRequested()).not.toThrow()
    expect(() => postStopSessionRequested()).not.toThrow()
  })

  it('is a no-op when the bridge handler is absent', () => {
    vi.stubGlobal('window', { webkit: { messageHandlers: {} } })

    expect(() => postShapeSnapped()).not.toThrow()
  })

  it('is a no-op when window itself is absent (node)', () => {
    expect(() => postShapeSnapped()).not.toThrow()
    expect(() => postStartSessionRequested()).not.toThrow()
    expect(() => postStopSessionRequested()).not.toThrow()
  })
})

describe('the Bridge, Shell→Canvas', () => {
  // The Shell calls window.__bridgeReceive via evaluateJavaScript; these
  // tests invoke the installed global the same way.
  function stubCanvasWindow(): Window {
    const fakeWindow = {} as Window
    vi.stubGlobal('window', fakeWindow)
    return fakeWindow
  }

  it('installs window.__bridgeReceive and dispatches sessionStarted', () => {
    const fakeWindow = stubCanvasWindow()
    const receiver = vi.fn()
    onBridgeMessage(receiver)

    fakeWindow.__bridgeReceive!({
      v: 1,
      event: 'sessionStarted',
      port: 8787,
      hostname: 'Farazs-iPad',
    })

    expect(receiver).toHaveBeenCalledTimes(1)
    expect(receiver).toHaveBeenCalledWith({
      v: 1,
      event: 'sessionStarted',
      port: 8787,
      hostname: 'Farazs-iPad',
    })
  })

  it('dispatches sessionStopped and sessionError', () => {
    const fakeWindow = stubCanvasWindow()
    const receiver = vi.fn()
    onBridgeMessage(receiver)

    fakeWindow.__bridgeReceive!({ v: 1, event: 'sessionStopped' })
    fakeWindow.__bridgeReceive!({
      v: 1,
      event: 'sessionError',
      message: 'port in use',
    })

    expect(receiver).toHaveBeenNthCalledWith(1, { v: 1, event: 'sessionStopped' })
    expect(receiver).toHaveBeenNthCalledWith(2, {
      v: 1,
      event: 'sessionError',
      message: 'port in use',
    })
  })

  it('drops malformed and unknown messages silently', () => {
    const fakeWindow = stubCanvasWindow()
    const receiver = vi.fn()
    onBridgeMessage(receiver)

    const receive = fakeWindow.__bridgeReceive!
    expect(() => receive(undefined)).not.toThrow()
    expect(() => receive(null)).not.toThrow()
    expect(() => receive('sessionStarted')).not.toThrow()
    receive({ v: 2, event: 'sessionStopped' }) // future version
    receive({ v: 1, event: 'unknownEvent' })
    receive({ v: 1, event: 'sessionStarted' }) // missing port/hostname
    receive({ v: 1, event: 'sessionStarted', port: '8787', hostname: 5 })
    receive({ v: 1, event: 'sessionError' }) // missing message

    expect(receiver).not.toHaveBeenCalled()
  })

  it('stops dispatching after unsubscribe', () => {
    const fakeWindow = stubCanvasWindow()
    const receiver = vi.fn()
    const unsubscribe = onBridgeMessage(receiver)
    unsubscribe()

    fakeWindow.__bridgeReceive!({ v: 1, event: 'sessionStopped' })

    expect(receiver).not.toHaveBeenCalled()
  })
})

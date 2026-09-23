// @vitest-environment jsdom
// The Bridge seam (#28): the Shell's session events driving the lifecycle
// and the Guest-relay hub, plus shadow recovery on launch. Module-level
// state (the lifecycle singleton, the one-shot recovery check) makes these
// tests order-dependent within this file — recovery first, by design.
import '../tldrawTestShims'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TLDOCUMENT_ID } from '@tldraw/tlschema'
import type { Editor } from 'tldraw'
import { makeTestEditor } from '../tldrawTestEditor'
import { registerSessionEditor, wireSessionToBridge } from './appSession'
import { SESSION_SHADOW_KEY, type SessionShadow } from './lifecycle'
import { roomSnapshotFromStoreSnapshot } from './migration'
import type { SessionHubOptions } from './hub'

function shadowWithDocumentName(name: string): SessionShadow {
  const editor = makeTestEditor()
  editor.updateDocumentSettings({ name })
  const snapshot = roomSnapshotFromStoreSnapshot(editor.store.getStoreSnapshot())
  editor.dispose()
  return { boundary: 'live', writtenAt: 42, snapshot }
}

const receive = (message: unknown) => {
  if (!window.__bridgeReceive) throw new Error('bridge receive global missing')
  window.__bridgeReceive(message)
}

let cleanups: Array<() => void> = []
afterEach(() => {
  for (const cleanup of cleanups.reverse()) cleanup()
  cleanups = []
  localStorage.clear()
  delete (window as { webkit?: unknown }).webkit
})

function register(editor: Editor) {
  const dispose = registerSessionEditor(editor)
  cleanups.push(() => {
    dispose()
    editor.dispose()
  })
  return editor
}

describe('shadow recovery on launch (#28)', () => {
  it('restores a leftover session shadow into the first solo editor, then clears it', () => {
    localStorage.setItem(SESSION_SHADOW_KEY, JSON.stringify(shadowWithDocumentName('rescued')))

    const editor = register(makeTestEditor())

    expect(editor.store.get(TLDOCUMENT_ID)?.name).toBe('rescued')
    expect(localStorage.getItem(SESSION_SHADOW_KEY)).toBeNull()
  })

  it('checks only once per launch: later solo mounts leave the Board alone', () => {
    localStorage.setItem(
      SESSION_SHADOW_KEY,
      JSON.stringify(shadowWithDocumentName('too late'))
    )

    const editor = register(makeTestEditor())

    expect(editor.store.get(TLDOCUMENT_ID)?.name).not.toBe('too late')
    // Not consumed either — an untouched stale shadow is left for debugging.
    expect(localStorage.getItem(SESSION_SHADOW_KEY)).not.toBeNull()
  })
})

describe('wireSessionToBridge (#28)', () => {
  function wireWithFakeHub() {
    const hubs: Array<{ opts: SessionHubOptions; disposed: boolean }> = []
    const unwire = wireSessionToBridge({
      connectHub: (opts) => {
        const record = { opts, disposed: false }
        hubs.push(record)
        return {
          guestCount: () => 0,
          dispose: () => {
            record.disposed = true
          },
        }
      },
    })
    cleanups.push(unwire)
    return hubs
  }

  it('runs the whole cycle: started → room + hub; stopped → hub down, Board folded back', () => {
    const editor = register(makeTestEditor())
    editor.updateDocumentSettings({ name: 'the live Board' })
    const hubs = wireWithFakeHub()

    receive({ v: 1, event: 'sessionStarted', port: 8787, hostname: 'Farazs-iPad' })
    expect(hubs).toHaveLength(1)
    expect(hubs[0].opts.url).toBe('ws://127.0.0.1:8787/host')
    // The room carries the Board the editor held at start.
    const seeded = hubs[0].opts.room.getSnapshot()
    expect(
      seeded.documents.some((d) => (d.state as { name?: string }).name === 'the live Board')
    ).toBe(true)

    // A duplicate report while hosting changes nothing.
    receive({ v: 1, event: 'sessionStarted', port: 8787, hostname: 'Farazs-iPad' })
    expect(hubs).toHaveLength(1)

    receive({ v: 1, event: 'sessionStopped' })
    expect(hubs[0].disposed).toBe(true)

    // The solo remount folds the Session's Board back in and consumes the
    // recovery shadow.
    const soloEditor = register(makeTestEditor())
    expect(soloEditor.store.get(TLDOCUMENT_ID)?.name).toBe('the live Board')
    expect(localStorage.getItem(SESSION_SHADOW_KEY)).toBeNull()
  })

  it('asks the Shell to stand down when the room cannot start', () => {
    const postMessage = vi.fn()
    ;(window as { webkit?: unknown }).webkit = {
      messageHandlers: { bridge: { postMessage } },
    }
    const hubs = wireWithFakeHub()

    // No live editor registered → startSession throws → stand-down request.
    receive({ v: 1, event: 'sessionStarted', port: 8787, hostname: 'Farazs-iPad' })

    expect(hubs).toHaveLength(0)
    expect(postMessage).toHaveBeenCalledWith({ v: 1, event: 'stopSessionRequested' })
  })
})

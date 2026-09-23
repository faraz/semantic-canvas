// @vitest-environment jsdom
// Board migration round-trip (#26): solo snapshot in → real Session room →
// snapshot out preserves shapes, through both the raw converters and the
// full lifecycle controller. Headless editors per repo convention.
import '../tldrawTestShims'
import { describe, expect, it } from 'vitest'
import { createShapeId, loadSnapshot, type Editor } from 'tldraw'
import { makeTestEditor } from '../tldrawTestEditor'
import { createSessionLifecycle, type SessionShadowStore, type SessionShadow } from './lifecycle'
import { roomSnapshotFromStoreSnapshot, storeSnapshotFromRoomSnapshot } from './migration'
import { createSessionRoom } from './room'

function drawBoard(editor: Editor) {
  const box = createShapeId('box')
  const note = createShapeId('note')
  editor.createShapes([
    { id: box, type: 'geo', x: 40, y: 50, props: { w: 120, h: 90 } },
    { id: note, type: 'note', x: 300, y: 200 },
  ])
  return { box, note }
}

function memoryShadow(): SessionShadowStore & { last: () => SessionShadow | null } {
  let entry: SessionShadow | null = null
  return {
    write: (shadow) => void (entry = shadow),
    read: () => entry,
    clear: () => void (entry = null),
    last: () => entry,
  }
}

describe('Board ↔ room snapshot migration', () => {
  it('round-trips shapes through a real room: snapshot in → room → snapshot out', () => {
    const host = makeTestEditor()
    const { box, note } = drawBoard(host)

    const room = createSessionRoom({ initialSnapshot: host.store.getStoreSnapshot() })
    const restoredSnapshot = storeSnapshotFromRoomSnapshot(room.getSnapshot())
    room.close()

    const restored = makeTestEditor()
    loadSnapshot(restored.store, restoredSnapshot)

    expect(restored.getShape(box)).toMatchObject({ type: 'geo', x: 40, y: 50 })
    expect(restored.getShape(note)).toMatchObject({ type: 'note', x: 300, y: 200 })
    expect(restored.getCurrentPageShapeIds().size).toBe(2)
    host.dispose()
    restored.dispose()
  })

  it('keeps session-scope records (instance, camera, pointer) out of the room', () => {
    const editor = makeTestEditor()
    drawBoard(editor)
    const roomSnapshot = roomSnapshotFromStoreSnapshot(editor.store.getStoreSnapshot())
    const typeNames = new Set(roomSnapshot.documents.map((d) => d.state.typeName))
    expect(typeNames).toContain('shape')
    expect(typeNames).toContain('page')
    expect(typeNames).not.toContain('instance')
    expect(typeNames).not.toContain('camera')
    expect(typeNames).not.toContain('pointer')
    expect(typeNames).not.toContain('instance_presence')
    editor.dispose()
  })

  it('supplies the stock schema when a room snapshot carries none', () => {
    const snapshot = storeSnapshotFromRoomSnapshot({ documents: [] })
    expect(snapshot.schema).toBeDefined()
    expect(snapshot.schema.schemaVersion).toBeGreaterThanOrEqual(1)
  })

  it('carries the Board through a full start → stop lifecycle intact', () => {
    const shadow = memoryShadow()
    const lifecycle = createSessionLifecycle({ shadow })

    const host = makeTestEditor()
    const { box } = drawBoard(host)
    lifecycle.start(host.store.getStoreSnapshot())
    // The editor remounts against the room-backed store; the solo editor
    // is gone. On stop, the room state comes back as a Board snapshot.
    const restoredSnapshot = lifecycle.stop()

    const restored = makeTestEditor()
    loadSnapshot(restored.store, restoredSnapshot)
    expect(restored.getShape(box)).toMatchObject({ type: 'geo', x: 40, y: 50 })
    expect(restored.getCurrentPageShapeIds().size).toBe(2)

    expect(shadow.last()).toMatchObject({ boundary: 'stop' })
    expect(lifecycle.getPhase()).toBe('solo')
    host.dispose()
    restored.dispose()
  })
})

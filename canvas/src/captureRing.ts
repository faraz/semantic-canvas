// Shared dev-capture wiring: both console capture handles (__inkCapture and
// __templateCapture) are the same pattern — a ring buffer of completed Ink
// fed by onInkComplete, exposed as a window global for Safari's Web
// Inspector. Disposing unhooks the Ink listener and removes the global.
import { type Editor, type TLShapeId } from 'tldraw'
import { onInkComplete } from './shapeSnap/inkEvents'
import type { InkPoint } from './shapeSnap/recognize'

export interface CaptureRing<Entry> {
  readonly entries: readonly Entry[]
  clear(): void
}

export function wireCaptureRing<Entry, Handle>(
  editor: Editor,
  options: {
    // Window global the console handle is exposed under (e.g. '__inkCapture').
    global: string
    // Ring capacity; the oldest entry falls out first.
    max: number
    // Map a completed stroke of Ink to a buffered entry; undefined skips it.
    entry: (editor: Editor, id: TLShapeId, points: InkPoint[]) => Entry | undefined
    // Build the console handle exposed on window.
    handle: (ring: CaptureRing<Entry>) => Handle
  }
): () => void {
  const entries: Entry[] = []
  const ring: CaptureRing<Entry> = {
    entries,
    clear: () => {
      entries.length = 0
    },
  }
  const globals = window as unknown as Record<string, unknown>
  globals[options.global] = options.handle(ring)

  const dispose = onInkComplete(editor, (id, points) => {
    const entry = options.entry(editor, id, points)
    if (entry === undefined) return
    entries.push(entry)
    if (entries.length > options.max) entries.shift()
  })

  return () => {
    dispose()
    delete globals[options.global]
  }
}

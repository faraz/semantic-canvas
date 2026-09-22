import { describe, expect, it } from 'vitest'
import { createGroupTracker, type GroupMember } from './grouping'
import type { InkPoint } from '../shapeSnap/recognize'

// Manual clock + timer queue so grouping is tested without real timers.
function makeClock() {
  let t = 0
  let nextId = 1
  const timers = new Map<number, { at: number; fn: () => void }>()
  return {
    now: () => t,
    setTimer: (fn: () => void, ms: number) => {
      const id = nextId++
      timers.set(id, { at: t + ms, fn })
      return () => {
        timers.delete(id)
      }
    },
    advance(ms: number) {
      const end = t + ms
      for (;;) {
        let dueId: number | undefined
        let dueAt = Infinity
        for (const [id, timer] of timers) {
          if (timer.at <= end && timer.at < dueAt) {
            dueAt = timer.at
            dueId = id
          }
        }
        if (dueId === undefined) break
        const timer = timers.get(dueId)!
        timers.delete(dueId)
        t = timer.at
        timer.fn()
      }
      t = end
    },
  }
}

function boxStroke(x: number, y: number, size = 100): InkPoint[] {
  return [
    { x, y },
    { x: x + size, y },
    { x: x + size, y: y + size },
    { x, y: y + size },
  ]
}

function makeTracker(overrides: { timeWindowMs?: number; proximityPx?: number; settleMs?: number } = {}) {
  const clock = makeClock()
  const settled: GroupMember[][] = []
  const tracker = createGroupTracker({
    onSettled: (members) => settled.push(members),
    now: clock.now,
    setTimer: clock.setTimer,
    ...overrides,
  })
  return { clock, settled, tracker }
}

describe('createGroupTracker', () => {
  it('merges strokes close in time and space into one group', () => {
    const { clock, settled, tracker } = makeTracker()
    tracker.addInk({ id: 'a', points: boxStroke(0, 0) })
    clock.advance(300)
    tracker.addInk({ id: 'b', points: boxStroke(50, 50) })
    clock.advance(300)
    tracker.addInk({ id: 'c', points: boxStroke(120, 0) })

    expect(settled).toHaveLength(0) // nothing settles while strokes keep coming
    clock.advance(700)
    expect(settled).toHaveLength(1)
    expect(settled[0].map((m) => m.id)).toEqual(['a', 'b', 'c'])
  })

  it('settles by idle timeout when the pen stays up', () => {
    const { clock, settled, tracker } = makeTracker()
    tracker.addInk({ id: 'a', points: boxStroke(0, 0) })
    clock.advance(699)
    expect(settled).toHaveLength(0)
    clock.advance(1)
    expect(settled).toHaveLength(1)
  })

  it('does not merge strokes far apart in time', () => {
    const { clock, settled, tracker } = makeTracker()
    tracker.addInk({ id: 'a', points: boxStroke(0, 0) })
    // Pen goes down before the settle timer fires, but the stroke takes a
    // while: the completion gap exceeds the time window.
    clock.advance(600)
    tracker.holdSettle()
    clock.advance(900)
    tracker.addInk({ id: 'b', points: boxStroke(50, 50) })

    expect(settled).toHaveLength(1) // 'a' settled the moment 'b' broke the window
    expect(settled[0].map((m) => m.id)).toEqual(['a'])
    clock.advance(700)
    expect(settled).toHaveLength(2)
    expect(settled[1].map((m) => m.id)).toEqual(['b'])
  })

  it('does not merge strokes far apart in space', () => {
    const { clock, settled, tracker } = makeTracker()
    tracker.addInk({ id: 'a', points: boxStroke(0, 0) })
    clock.advance(200)
    tracker.addInk({ id: 'b', points: boxStroke(500, 500) }) // > 80px away

    expect(settled).toHaveLength(1)
    expect(settled[0].map((m) => m.id)).toEqual(['a'])
    clock.advance(700)
    expect(settled).toHaveLength(2)
    expect(settled[1].map((m) => m.id)).toEqual(['b'])
  })

  it('merges strokes that only come near within the proximity margin', () => {
    const { clock, settled, tracker } = makeTracker()
    tracker.addInk({ id: 'a', points: boxStroke(0, 0) })
    clock.advance(200)
    tracker.addInk({ id: 'b', points: boxStroke(170, 0) }) // 70px gap < 80
    clock.advance(700)
    expect(settled).toHaveLength(1)
    expect(settled[0].map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('holdSettle postpones settling until the next completed stroke', () => {
    const { clock, settled, tracker } = makeTracker()
    tracker.addInk({ id: 'a', points: boxStroke(0, 0) })
    clock.advance(600)
    tracker.holdSettle()
    clock.advance(300) // original settle deadline passes silently
    expect(settled).toHaveLength(0)
    tracker.addInk({ id: 'b', points: boxStroke(50, 50) })
    clock.advance(700)
    expect(settled).toHaveLength(1)
    expect(settled[0].map((m) => m.id)).toEqual(['a', 'b'])
  })

  it('records geometric snap replacements on the settled members', () => {
    const { clock, settled, tracker } = makeTracker()
    tracker.addInk({ id: 'a', points: boxStroke(0, 0) })
    tracker.noteReplacement('a', 'shape:geo1')
    tracker.noteReplacement('ghost', 'shape:geo2') // unknown ink: ignored
    clock.advance(700)
    expect(settled[0][0].replacementId).toBe('shape:geo1')
  })

  it('flush settles immediately and dispose drops the open group', () => {
    const first = makeTracker()
    first.tracker.addInk({ id: 'a', points: boxStroke(0, 0) })
    first.tracker.flush()
    expect(first.settled).toHaveLength(1)

    const second = makeTracker()
    second.tracker.addInk({ id: 'a', points: boxStroke(0, 0) })
    second.tracker.dispose()
    second.clock.advance(2000)
    expect(second.settled).toHaveLength(0)
  })
})

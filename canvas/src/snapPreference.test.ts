// @vitest-environment jsdom
import './tldrawTestShims'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { isSnapEnabled, setSnapEnabled, subscribeSnapEnabled } from './snapPreference'

describe('snapPreference', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('defaults to on', () => {
    expect(isSnapEnabled()).toBe(true)
  })

  it('turns off and back on', () => {
    setSnapEnabled(false)
    expect(isSnapEnabled()).toBe(false)
    setSnapEnabled(true)
    expect(isSnapEnabled()).toBe(true)
  })

  it('persists: reads go to localStorage, so the value survives relaunch', () => {
    setSnapEnabled(false)
    // The stored value alone determines the answer — a fresh context reading
    // the same storage (relaunch) sees the same preference.
    expect(localStorage.getItem('semantic-canvas.snap-enabled')).toBe('off')
    localStorage.setItem('semantic-canvas.snap-enabled', 'on')
    expect(isSnapEnabled()).toBe(true)
  })

  it('notifies subscribers on every change, until unsubscribed', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSnapEnabled(listener)

    setSnapEnabled(false)
    expect(listener).toHaveBeenCalledTimes(1)
    setSnapEnabled(true)
    expect(listener).toHaveBeenCalledTimes(2)

    unsubscribe()
    setSnapEnabled(false)
    expect(listener).toHaveBeenCalledTimes(2)
  })
})

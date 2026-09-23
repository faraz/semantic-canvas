// The session-UI store: Bridge session events in, render state out.
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyBridgeSessionMessage,
  getSessionUiState,
  joinUrl,
  resetSessionUiStateForTest,
  subscribeSessionUi,
} from './sessionUi'

afterEach(() => {
  resetSessionUiStateForTest()
})

describe('the session-UI store', () => {
  it('starts idle, not hosting, without error', () => {
    expect(getSessionUiState()).toEqual({ hosting: false, error: null })
  })

  it('reflects sessionStarted with the join details', () => {
    applyBridgeSessionMessage({
      v: 1,
      event: 'sessionStarted',
      port: 8787,
      hostname: 'Farazs-iPad',
    })

    expect(getSessionUiState()).toEqual({
      hosting: true,
      port: 8787,
      hostname: 'Farazs-iPad',
      ip: null,
      error: null,
    })
  })

  it('returns to idle on sessionStopped', () => {
    applyBridgeSessionMessage({
      v: 1,
      event: 'sessionStarted',
      port: 8787,
      hostname: 'Farazs-iPad',
    })
    applyBridgeSessionMessage({ v: 1, event: 'sessionStopped' })

    expect(getSessionUiState()).toEqual({ hosting: false, error: null })
  })

  it('surfaces sessionError as not hosting, with the message', () => {
    applyBridgeSessionMessage({
      v: 1,
      event: 'sessionError',
      message: 'port in use',
    })

    expect(getSessionUiState()).toEqual({ hosting: false, error: 'port in use' })
  })

  it('clears a previous error when a session then starts', () => {
    applyBridgeSessionMessage({ v: 1, event: 'sessionError', message: 'oops' })
    applyBridgeSessionMessage({
      v: 1,
      event: 'sessionStarted',
      port: 8787,
      hostname: 'Farazs-iPad',
    })

    expect(getSessionUiState().error).toBeNull()
    expect(getSessionUiState().hosting).toBe(true)
  })

  it('notifies subscribers on every event and honors unsubscribe', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeSessionUi(listener)

    applyBridgeSessionMessage({
      v: 1,
      event: 'sessionStarted',
      port: 8787,
      hostname: 'Farazs-iPad',
    })
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    applyBridgeSessionMessage({ v: 1, event: 'sessionStopped' })
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('builds the join URL from the IP when the Shell reports one', () => {
    expect(joinUrl({ hostname: 'Farazs-iPad', port: 8787, ip: '192.168.1.23' })).toBe(
      'http://192.168.1.23:8787'
    )
  })

  it('falls back to the .local name without an IP', () => {
    expect(joinUrl({ hostname: 'Farazs-iPad', port: 8787, ip: null })).toBe(
      'http://Farazs-iPad.local:8787'
    )
  })
})

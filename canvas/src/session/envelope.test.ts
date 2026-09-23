// The Guest-relay envelope codec (#28): the framing shared with the Shell's
// SessionRelay (mirrored by hand in Swift). Pure encode/decode.
import { describe, expect, it } from 'vitest'
import { decodeEnvelope, encodeEnvelope, type RelayEnvelope } from './envelope'

describe('encodeEnvelope / decodeEnvelope', () => {
  it('round-trips every envelope kind', () => {
    const envelopes: RelayEnvelope[] = [
      { sid: 'guest-1', ev: 'open' },
      { sid: 'guest-1', ev: 'frame', data: '{"type":"ping"}' },
      { sid: 'guest-1', ev: 'close' },
    ]
    for (const envelope of envelopes) {
      expect(decodeEnvelope(encodeEnvelope(envelope))).toEqual(envelope)
    }
  })

  it('carries the wire frame opaquely, JSON and all', () => {
    const data = JSON.stringify({ type: 'push', diff: { nested: ['put', { deep: true }] } })
    const decoded = decodeEnvelope(encodeEnvelope({ sid: 's', ev: 'frame', data }))
    expect(decoded).toEqual({ sid: 's', ev: 'frame', data })
  })

  it('decodes what the Swift relay emits', () => {
    // Literal frames as JSONSerialization writes them (key order arbitrary).
    expect(decodeEnvelope('{"ev":"open","sid":"ABC-123"}')).toEqual({
      sid: 'ABC-123',
      ev: 'open',
    })
    expect(decodeEnvelope('{"data":"{\\"type\\":\\"ping\\"}","sid":"ABC-123","ev":"frame"}')).toEqual({
      sid: 'ABC-123',
      ev: 'frame',
      data: '{"type":"ping"}',
    })
  })

  it('rejects malformed frames with null, never a throw', () => {
    const malformed: unknown[] = [
      undefined,
      null,
      42,
      new Uint8Array([1, 2, 3]), // binary frame
      'not json',
      '[]',
      '"a string"',
      '{}',
      '{"sid":"","ev":"open"}', // empty sid
      '{"sid":42,"ev":"open"}', // non-string sid
      '{"ev":"open"}', // missing sid
      '{"sid":"s"}', // missing ev
      '{"sid":"s","ev":"msg"}', // unknown ev
      '{"sid":"s","ev":"frame"}', // frame without data
      '{"sid":"s","ev":"frame","data":7}', // non-string data
    ]
    for (const raw of malformed) {
      expect(decodeEnvelope(raw)).toBeNull()
    }
  })

  it('ignores extra fields rather than rejecting them', () => {
    expect(decodeEnvelope('{"sid":"s","ev":"close","future":"field"}')).toEqual({
      sid: 's',
      ev: 'close',
    })
  })
})

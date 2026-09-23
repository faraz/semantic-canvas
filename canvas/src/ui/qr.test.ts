// Smoke tests for the vendored QR encoder (qrcodegen.ts): structural
// invariants of the symbol generated for a join URL — enough to catch a
// broken vendoring/module conversion without shipping a QR decoder.
import { describe, expect, it } from 'vitest'
import { QrCode } from './qrcodegen'

const JOIN_URL = 'http://Farazs-iPad.local:8787'

function encode(text: string) {
  return QrCode.encodeText(text, QrCode.Ecc.MEDIUM)
}

// The three 7x7 finder patterns: dark ring, light ring, dark 3x3 core.
function expectFinderAt(qr: InstanceType<typeof QrCode>, ox: number, oy: number) {
  for (let y = 0; y < 7; y++) {
    for (let x = 0; x < 7; x++) {
      const ring = Math.max(Math.abs(x - 3), Math.abs(y - 3))
      const expected = ring !== 2 && ring !== 3 ? true : ring === 3
      expect(qr.getModule(ox + x, oy + y)).toBe(expected)
    }
  }
}

describe('the QR encoder', () => {
  it('produces a symbol sized 17 + 4 x version', () => {
    const qr = encode(JOIN_URL)
    expect(qr.size).toBe(17 + 4 * qr.version)
    expect(qr.version).toBeGreaterThanOrEqual(1)
  })

  it('places the three finder patterns', () => {
    const qr = encode(JOIN_URL)
    expectFinderAt(qr, 0, 0)
    expectFinderAt(qr, qr.size - 7, 0)
    expectFinderAt(qr, 0, qr.size - 7)
  })

  it('alternates the timing patterns', () => {
    const qr = encode(JOIN_URL)
    for (let i = 8; i < qr.size - 8; i++) {
      expect(qr.getModule(i, 6)).toBe(i % 2 === 0)
      expect(qr.getModule(6, i)).toBe(i % 2 === 0)
    }
  })

  it('is deterministic for the same URL', () => {
    const a = encode(JOIN_URL)
    const b = encode(JOIN_URL)
    expect(a.size).toBe(b.size)
    for (let y = 0; y < a.size; y++) {
      for (let x = 0; x < a.size; x++) {
        expect(a.getModule(x, y)).toBe(b.getModule(x, y))
      }
    }
  })

  it('treats everything outside the symbol as light', () => {
    const qr = encode(JOIN_URL)
    expect(qr.getModule(-1, 0)).toBe(false)
    expect(qr.getModule(0, qr.size)).toBe(false)
  })
})

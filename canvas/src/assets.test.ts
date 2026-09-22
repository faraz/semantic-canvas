// Offline guard (issue #10): every tldraw asset URL must be bundler-resolved
// (inlined into the bundle at build time), never an absolute CDN URL — and it
// must survive tldraw's unquoted CSS url() interpolation (icon masks), so no
// quotes, parens, or whitespace. If the first check fails, someone swapped the
// import-based asset helper for a CDN-backed one; if the second fails, icons
// render as solid squares.
import { describe, expect, it } from 'vitest'
import { assetUrls } from './assetUrls'

const allUrls = [
  assetUrls.fonts,
  assetUrls.icons,
  assetUrls.translations,
  assetUrls.embedIcons,
].flatMap((group) => Object.values(group) as string[])

describe('self-hosted tldraw assets', () => {
  it('resolves fonts, icons, translations, and embed icons without a CDN', () => {
    expect(allUrls.length).toBeGreaterThan(0)
    for (const url of allUrls) {
      expect(url).not.toMatch(/^https?:\/\//)
    }
  })

  it('keeps every URL valid inside an unquoted CSS url() token', () => {
    for (const url of allUrls) {
      expect(url).not.toMatch(/['"\s]|\(|\)/)
    }
  })
})

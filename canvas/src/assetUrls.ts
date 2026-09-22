// Self-hosted tldraw assets (issue #10): without this, <Tldraw> loads fonts,
// icons, and translations from cdn.tldraw.com at runtime. The import-based
// helper turns each asset into a bundler import; vite-plugin-singlefile maxes
// assetsInlineLimit, so every asset becomes a data: URL inlined into the one
// index.html the Shell bundles. A meeting must never depend on Wi-Fi.
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'

// tldraw interpolates these URLs into unquoted CSS url() tokens (icon masks).
// Vite's inlined SVG data: URLs keep raw single quotes, which make that CSS
// invalid — the mask is dropped and every icon renders as a solid square. An
// unquoted url() token cannot contain quotes, parens, or whitespace, so
// percent-encode them; percent-decoding still yields the identical SVG.
function cssUrlSafe(url: string): string {
  return url.replace(
    /['"()\s]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`,
  )
}

export const assetUrls = getAssetUrlsByImport(cssUrlSafe)

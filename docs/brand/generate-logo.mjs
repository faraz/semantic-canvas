// Semantic Canvas logo generator.
//
// The mark tells the product's one-sentence story: a rough Apple Pencil
// stroke snapping into perfect geometry. Two-thirds of the ring is
// hand-drawn ink (deterministic seeded wobble); the rest is a crisp
// geometric arc in the app's selection blue, with "snap" sparks at the
// seam where ink becomes geometry.
//
// Usage:
//   node docs/brand/generate-logo.mjs
//
// Always writes the SVGs in docs/brand/. Also rasterizes the AppIcon
// PNGs into shell/SemanticCanvas/Assets.xcassets/ when `sharp` is
// resolvable from the current working directory (npm i sharp somewhere
// and run from that directory); prints a note and skips them otherwise.
import { writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const BRAND_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(BRAND_DIR, '..', '..')
const ICONSET = join(REPO_ROOT, 'shell', 'SemanticCanvas', 'Assets.xcassets', 'AppIcon.appiconset')

const SEED = 21 // chosen wobble; change it and the hand redraws the ring

const INK = '#1f2128'
const BLUE = '#2f80ed' // the app's selection accent, hsl(214, 84%, 56%)
const INK_DARK = '#f4f5f7'
const BLUE_DARK = '#4dabf7'

// ---------- deterministic randomness ----------
function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function smoothNoise(rand, harmonics = 3, freqScale = 1) {
  const comps = Array.from({ length: harmonics }, (_, i) => ({
    f: ((i + 1) * 1.7 + rand() * 1.3) * freqScale,
    p: rand() * Math.PI * 2,
    a: 1 / (i + 1),
  }))
  const norm = comps.reduce((s, c) => s + c.a, 0)
  return (t) => comps.reduce((s, c) => s + Math.sin(t * c.f * Math.PI * 2 + c.p) * c.a, 0) / norm
}

// ---------- rough (hand-drawn) variable-width stroke ----------
// pts: dense centerline samples. Returns a filled path with jittered
// center and breathing width; jitter tapers at the ends so the rough
// stroke meets the clean arc's round caps without a step.
function roughStroke(pts, { baseW, jitterAmp, seed, taperEnds = 0.06, endWidth = 0.55, freqScale = 1, widthVar = 0.16 }) {
  const rand = mulberry32(seed)
  const wobble = smoothNoise(rand, 3, freqScale)
  const widthN = smoothNoise(rand, 3, freqScale)
  const n = pts.length
  const normals = pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]
    const dx = b.x - a.x, dy = b.y - a.y
    const len = Math.hypot(dx, dy) || 1
    return { x: -dy / len, y: dx / len }
  })
  const outer = [], inner = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const wEnd = Math.min(1, Math.min(t, 1 - t) / taperEnds)
    const jw = wEnd * wEnd * (3 - 2 * wEnd)
    const off = wobble(t) * jitterAmp * jw
    const w = baseW * (1 + widthVar * widthN(t)) * (endWidth + (1 - endWidth) * jw)
    const cx = pts[i].x + normals[i].x * off
    const cy = pts[i].y + normals[i].y * off
    outer.push({ x: cx + normals[i].x * w / 2, y: cy + normals[i].y * w / 2 })
    inner.push({ x: cx - normals[i].x * w / 2, y: cy - normals[i].y * w / 2 })
  }
  const fmt = (p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`
  return `M${fmt(outer[0])} L${outer.slice(1).map(fmt).join(' L')} L${inner.slice().reverse().map(fmt).join(' L')} Z`
}

// point on circle, math convention (0deg = east, CCW), y flipped for SVG
const onCircle = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) }
}
const arcSamples = (cx, cy, r, fromDeg, toDeg, n = 260) =>
  Array.from({ length: n }, (_, i) => onCircle(cx, cy, r, fromDeg + ((toDeg - fromDeg) * i) / (n - 1)))

function sparks(cx, cy, r, seamDeg, color) {
  const out = []
  for (const [dA, len] of [[-18, 52], [2, 66], [22, 52]]) {
    const p1 = onCircle(cx, cy, r + 66, seamDeg + dA)
    const p2 = onCircle(cx, cy, r + 66 + len, seamDeg + dA)
    out.push(`<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${color}" stroke-width="30" stroke-linecap="round"/>`)
  }
  return out.join('\n  ')
}

// ---------- the mark ----------
// mode: 'light' | 'dark' — colors for a light or dark surface
// bg: 'tile' (rounded tile), 'square' (full-bleed, for app icon), 'none'
function logo({ mode = 'light', bg = 'tile', mono = null } = {}) {
  const S = 1024, cx = 512, cy = 512, r = 330
  const ink = mono ? mono.ink : mode === 'dark' ? INK_DARK : INK
  const accent = mono ? mono.accent : mode === 'dark' ? BLUE_DARK : BLUE
  const cleanFrom = -55, cleanTo = 100 // right + top: the snapped part
  const rough = roughStroke(arcSamples(cx, cy, r, cleanTo, 305), {
    baseW: 60, jitterAmp: 11, seed: SEED, freqScale: 0.62,
  })
  const p1 = onCircle(cx, cy, r, cleanFrom), p2 = onCircle(cx, cy, r, cleanTo)
  const defs = `<defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="80%">
      ${mode === 'dark'
        ? '<stop offset="0%" stop-color="#23242b"/><stop offset="100%" stop-color="#141519"/>'
        : '<stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#eef1f7"/>'}
    </radialGradient>
  </defs>`
  const bgShape = bg === 'none' ? ''
    : bg === 'square' ? `<rect width="${S}" height="${S}" fill="url(#bg)"/>`
    : `<rect width="${S}" height="${S}" rx="224" fill="url(#bg)"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">
  ${bg === 'none' ? '' : defs}
  ${bgShape}
  <path d="${rough}" fill="${ink}"/>
  <path d="M${p1.x.toFixed(1)} ${p1.y.toFixed(1)} A${r} ${r} 0 0 0 ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}"
        fill="none" stroke="${accent}" stroke-width="62" stroke-linecap="round"/>
  ${sparks(cx, cy, r, 104, accent)}
</svg>`
}

// ---------- SVG deliverables ----------
mkdirSync(BRAND_DIR, { recursive: true })
const svgs = {
  'logo.svg': logo({ mode: 'light', bg: 'tile' }),
  'logo-dark.svg': logo({ mode: 'dark', bg: 'tile' }),
  'mark.svg': logo({ mode: 'light', bg: 'none' }),
  'mark-dark.svg': logo({ mode: 'dark', bg: 'none' }),
}
for (const [name, svg] of Object.entries(svgs)) {
  writeFileSync(join(BRAND_DIR, name), svg)
  console.log('wrote docs/brand/' + name)
}

// ---------- AppIcon PNGs (requires sharp) ----------
let sharp = null
try {
  sharp = createRequire(join(process.cwd(), 'resolve-anchor.js'))('sharp')
} catch {
  console.log('sharp not resolvable from cwd — skipped AppIcon PNGs')
}
if (sharp) {
  mkdirSync(ICONSET, { recursive: true })
  const icons = {
    // "any" appearance must be opaque full-bleed; iOS masks the corners
    'AppIcon-1024.png': logo({ mode: 'light', bg: 'square' }),
    // dark + tinted appearances: transparent, the system supplies the backdrop
    'AppIcon-1024-dark.png': logo({ mode: 'dark', bg: 'none' }),
    'AppIcon-1024-tinted.png': logo({ bg: 'none', mono: { ink: '#ffffff', accent: '#b8b8b8' } }),
  }
  for (const [name, svg] of Object.entries(icons)) {
    await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(join(ICONSET, name))
    console.log('wrote AppIcon.appiconset/' + name)
  }
}

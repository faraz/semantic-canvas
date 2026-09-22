// PROTOTYPE — chrome-variant switcher for the design bake-off (issue #19).
// Throwaway: once a winner is crowned this file and the losing variants go;
// the winner's code is promoted into ui/ as the real chrome.
import { useState } from 'react'
import type { TLComponents } from 'tldraw'
import quietStudio from './quiet-studio'
import stagePresence from './stage-presence'
import tactileToy from './tactile-toy'
import './switcher.css'

export interface ChromeVariant {
  slug: string
  label: string
  components: Partial<TLComponents>
}

// 'current' = the shipped tablet chrome (App's own components, no override).
const baseline: ChromeVariant = { slug: 'current', label: 'Current', components: {} }

export const CHROME_VARIANTS: readonly ChromeVariant[] = [
  baseline,
  quietStudio,
  tactileToy,
  stagePresence,
]

const STORAGE_KEY = 'semantic-canvas.chrome-variant'

export function useChromeVariant(): [ChromeVariant, (slug: string) => void] {
  const [slug, setSlug] = useState<string>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? 'current'
    } catch {
      return 'current'
    }
  })
  const active = CHROME_VARIANTS.find((v) => v.slug === slug) ?? baseline
  const pick = (next: string) => {
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // in-memory only is fine for a prototype
    }
    setSlug(next)
  }
  return [active, pick]
}

export function VariantBar({
  active,
  onPick,
}: {
  active: string
  onPick: (slug: string) => void
}) {
  return (
    <div className="variant-bar">
      {CHROME_VARIANTS.map((v) => (
        <button
          key={v.slug}
          type="button"
          className={
            v.slug === active
              ? 'variant-bar__pill variant-bar__pill--active'
              : 'variant-bar__pill'
          }
          onClick={() => onPick(v.slug)}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

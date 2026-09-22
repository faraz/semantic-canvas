# pencil-probe — PROTOTYPE, throwaway

Answers one question ([Prototype: Apple Pencil ink fidelity through the
WKWebView-hosted tldraw canvas](https://github.com/faraz/semantic-canvas/issues/3)):
does Apple Pencil ink through a WKWebView-hosted tldraw canvas meet the
whiteboard bar — pressure visibly modulates stroke width, palm rejection never
leaves marks, latency unnoticeable while diagramming — on the iPad Pro + Apple
Pencil Pro, compared against the known-good floor of tldraw.com in Safari?

## Run it (Xcode does everything)

1. `open app/PencilProbe.xcodeproj`
2. Target **PencilProbe** → Signing & Capabilities → pick your Team.
3. Select the USB-connected iPad Pro as destination → **Run**.

The built web canvas (`app/PencilProbe/index.html`, one self-contained file)
is committed, so no Node step is needed just to run.

## Judge it

Draw a real meeting diagram — boxes, arrows, labels, a circle around the
important bit — palm resting on the glass, SharePad showing the window on the
Mac. The HUD (bottom-left) shows live `pointerType / pressure / tilt /
coalesced events per frame / fps` so a wrong-feeling stroke can be blamed on
input vs rendering.

Verdicts to report back (fine / annoying / dealbreaker):

1. Latency vs tldraw.com in Safari — any regression?
2. Pressure — width responds mid-stroke? (HUD should show pressure ≠ 0.5 for pen)
3. Palm rejection — stray marks or phantom pans?
4. Fullscreen feel — better than Safari chrome? Anything browser-ish left?
5. SharePad view — crisp, right aspect?

## Rebuild the web canvas (only if editing web/)

```
cd web && npm install && npm run build && cp dist/index.html ../app/PencilProbe/index.html
cd ../app && xcodegen   # only if project.yml changed
```

## Prototype notes / known impurities

- **Dev-mode tldraw build** (`vite build --mode development`): no license key
  needed, watermark shows. Production builds would need the license key story
  (see the licensing research on the map) — deliberately out of this
  prototype's scope.
- tldraw fetches its fonts/icons from its CDN at runtime — iPad needs network
  for canonical rendering; offline you get system-font fallback.
- No persistence anywhere (ephemeral WKWebsiteDataStore, no tldraw
  persistenceKey): every launch is a blank board. Intentional.

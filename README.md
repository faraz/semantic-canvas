# Semantic Canvas

A native iPad whiteboard for drawing live in meetings: a SwiftUI **Shell**
hosting a locally-bundled tldraw **Canvas** in a WKWebView. Apple Pencil ink is
first-class; rough shapes snap to clean geometry as you draw.

See `CONTEXT.md` for the project vocabulary and `AGENTS.md` for how agents work
in this repo. Decision history: the wayfinder map (issue #1) and spec (issue #7).

## Layout

- `canvas/` — the Canvas: React + tldraw, built to a single-file bundle
- `shell/` — the Shell: xcodegen-defined Xcode project, iPad only

## One-time setup

```
cd canvas && npm install
brew install xcodegen   # if not installed
```

## Build & run on the iPad

```
cd canvas && npm run build            # bundles the Canvas
cp dist/index.html ../shell/SemanticCanvas/index.html
cd ../shell && xcodegen               # (re)generate the Xcode project
open SemanticCanvas.xcodeproj         # set your Team once, then Run on the iPad
```

## Development

```
cd canvas
npm test              # vitest
npm run typecheck     # tsc --noEmit
```

The Canvas is built in development mode (`vite build --mode development`):
tldraw requires no license key in dev builds. See the licensing research
(branch `research/tldraw-licensing`) before any production/commercial build.

# Research: shape recognition — tldraw vs PencilKit vs custom

**Ticket:** [#5](https://github.com/faraz/semantic-canvas/issues/5) · **Date:** 2026-09-22 · **Sources:** primary only (tldraw.dev + tldraw GitHub source, developer.apple.com, UW ACE Lab $-recognizer pages/papers, Excalidraw source).

**Question:** Where should draw-to-shape recognition (rough circles/squares/arrows snap to clean geometry as you draw) come from, given the fixed architecture: native Swift shell embedding tldraw (SDK v5.4.2) in a WKWebView?

**Answer in one line:** Neither tldraw nor iPadOS ships usable shape recognition — build it custom in JS on the tldraw side, and the best starting point is porting Excalidraw's MIT-licensed moment-based recognizer (`convertToShape.ts`) wired into tldraw's draw tool.

---

## 1. What tldraw ships today: nothing built-in

- **No draw-to-shape recognition in the SDK or app.** Code search across the repo: `autodraw` 0 hits; docs search `"shape recognition"` 0 hits. The draw tool is a two-state `StateNode` (Idle → Drawing) that records pointer input into `props.segments` with no detection logic: [DrawShapeTool.ts](https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/shapes/draw/DrawShapeTool.ts), [toolStates/Drawing.ts](https://github.com/tldraw/tldraw/blob/main/packages/tldraw/src/lib/shapes/draw/toolStates/Drawing.ts).
- Strokes get **beautification only** — a vendored [perfect-freehand](https://github.com/steveruizok/perfect-freehand) port at `packages/tldraw/src/lib/shapes/shared/freehand/` (streamline ~0.62–0.74, smoothing 0.62, pressure thinning; see `draw/getPath.ts`). perfect-freehand is stroke *rendering*, not recognition (confirmed from its README).
- **The team explicitly declined a community recognition PR.** [PR #7186](https://github.com/tldraw/tldraw/pull/7186) ("autodraw circle replacement") was closed unmerged 2025-12-31 by steveruizok: *"automatic shape detection is something we've discussed… it would be a bigger feature. I really like ProCreate's implementation / UX."* mimecuvalo: *"we'd probably want to do this as a holistic recognition for lots of things… we'd go rather deep."* Companion [issue #7187](https://github.com/tldraw/tldraw/issues/7187) was imported to tldraw's internal Linear (ENG-3876) and closed — the `completed` state reason is misleading; it is **not implemented**, just on their internal backlog with no timeline (re-triaged Jan 2026).
- **No official example** demonstrates recognition (full `apps/examples` listing checked). Closest building blocks: [custom-tool](https://tldraw.dev/examples/custom-tool), [tool-with-child-states](https://tldraw.dev/examples/tool-with-child-states), [after-create-update-shape](https://tldraw.dev/examples/after-create-update-shape), [store-events](https://tldraw.dev/examples/store-events), [canvas-events](https://tldraw.dev/examples/canvas-events).

### Editor API surface for building it custom (all verified)

| Need | API |
|---|---|
| Read stroke points | `TLDrawShape.props.segments` — **v5 stores points delta-encoded base64** (first point Float32, deltas Float16), not a plain array. Decode with the public helper [`getPointsFromDrawSegments(segments, scaleX, scaleY): Vec[]`](https://tldraw.dev/reference/tldraw/getPointsFromDrawSegments) or lower-level [`b64Vecs`](https://github.com/tldraw/tldraw/blob/main/packages/tlschema/src/misc/b64Vecs.ts). Schema: [TLDrawShape.ts](https://github.com/tldraw/tldraw/blob/main/packages/tlschema/src/shapes/TLDrawShape.ts) |
| Detect stroke completion | Drawing state sets `props.isComplete = true` on pointer-up. Hook `editor.sideEffects.registerAfterChangeHandler('shape', …)` filtering `type === 'draw' && props.isComplete` (or `registerAfterCreateHandler`). Docs: [side effects](https://tldraw.dev/sdk-features/side-effects), [StoreSideEffects](https://tldraw.dev/reference/store/StoreSideEffects) |
| Swap stroke for clean geometry | [`Editor.createShape` / `updateShapes` / `deleteShapes`](https://tldraw.dev/reference/editor/Editor); clean shapes are ordinary `type: 'geo'` / `type: 'arrow'` creates |
| Deeper integration | `DrawShapeTool`, `Drawing`, `DrawShapeUtil` are all `@public` exports — subclass and run recognition in `onPointerUp` before finalize, register via the `tools` prop ([custom tools docs](https://tldraw.dev/docs/tools)). `DrawShapeOptions` exposes `maxPointsPerShape` |

Current SDK: **tldraw@5.4.2** (npm latest, 2026-09-10). Production use requires a tldraw license key (dev-only is free).

## 2. What iPadOS provides: nothing public for shapes

- **PencilKit has no public shape recognition through iOS/iPadOS 27.** Full framework symbol index enumerated — no shape-detection/snap API exists. Apple Notes' draw-and-hold snapping is **private system behavior**: Apple staff on [forums thread 650386](https://developer.apple.com/forums/thread/650386): *"Shape Detection is only supported in Notes, Screenshots & Markup… The 'Snap to Shape' menu item isn't supposed to show up in a PKCanvasView"* (its appearance was a bug). A Jan 2026 re-ask got no reply.
- **New in iOS 27, [`PKStrokeRecognizer`](https://developer.apple.com/documentation/pencilkit/pkstrokerecognizer) is handwriting-to-TEXT only** (on-device, async, 29 languages). Notably it is canvas-independent — *"it doesn't automatically observe your canvas"*; you feed it a `PKDrawing` you construct (WWDC26 session 203: works with "any canvas, not just PKCanvasView"). **No shapes.**
- **Vision/VisionKit: no sketch-shape classifier** through iOS 27 (full symbol-index sweeps). [`VNDetectContoursRequest`](https://developer.apple.com/documentation/vision/vndetectcontoursrequest) extracts contour geometry from raster images but classifies nothing.
- **Scribble is text-only** and works automatically in WebKit editable fields (WWDC20 session 10106: *"standard editable web content and forms in web pages through WebKit… work out of the box"*). A canvas is not editable text, so Scribble neither helps nor interferes with drawing; at most suppress it near text fields via `UIScribbleInteraction`. PaperKit (iOS 26/27) has inserted vector shapes (`ShapeMarkup`) but no documented recognition of hand-drawn strokes.
- **Reachability from the WKWebView architecture** (mostly moot since there's nothing to reach for shapes, but relevant for the future):
  - Apple Pencil input reaches web content as **Pointer Events with pressure** (Safari 13 Release Notes: *"Added support for the Pointer Events API enabling consistent access to mouse, trackpad, touch, and Apple Pencil events"*). Pencil *hover* in web content could not be verified from Apple primary docs — flagged unverified.
  - Programmatic stroke construction is fully public: `PKStrokePoint` → `PKStrokePath(controlPoints:)` → `PKStroke(ink:path:…)` → `PKDrawing(strokes:)`; iOS 27 adds `PKStrokePath.init(bezierPath:…)` with an article explicitly targeting third-party canvases: [Importing external drawing data into PencilKit](https://developer.apple.com/documentation/pencilkit/importing-external-drawing-data-into-pencilkit). Bridged via [`WKScriptMessageHandler`](https://developer.apple.com/documentation/webkit/wkscriptmessagehandler) (`window.webkit.messageHandlers.*.postMessage`), JS stroke points can be shipped native-side — useful **later for handwriting-to-text** via `PKStrokeRecognizer`, not for shapes.
  - Bonus: [`UICanvasFeedbackGenerator.pathCompleted(at:)`](https://developer.apple.com/documentation/uikit/uicanvasfeedbackgenerator) (iOS 17.5) is the system haptic Apple documents for "path completion or shape recognition" — Apple supplies the *haptic* for when **your own** recognizer fires. Worth bridging one message for.

## 3. Custom-build options in JS

### Excalidraw's moment-based recognizer — strongest option

Excalidraw ships a full production draw-to-shape recognizer, **MIT-licensed**, at [`packages/element/src/convertToShape.ts`](https://raw.githubusercontent.com/excalidraw/excalidraw/master/packages/element/src/convertToShape.ts) (merged [PR #9313](https://github.com/excalidraw/excalidraw/pull/9313), 2026-07-23; improved [#11752](https://github.com/excalidraw/excalidraw/pull/11752)). It is a *"moment-based shape recognizer"* (its own header comment), not a template matcher:

- Recognizes **rectangle, diamond, ellipse, arrow, line**; falls back to freedraw when unsure (nearest-prototype in tolerance-normalized feature space with a max-distance cutoff).
- Resamples to N=64; features include endpoint `gapRatio` (open vs closed, 0.15 threshold), elongation via principal axes, `majorSkew ≥ 0.3` ⇒ arrow vs line, `hullFillRatio` (~1 rect, ~π/4 ellipse, ~0.5 diamond), `cornerTurnShare`, aspect-invariant `kurtosisProduct` (≈1.83 rect / 2.25 ellipse / 3.24 diamond), `shaftDeviationRatio` straightness check.
- **Deliberately not rotation-invariant** ("A 45° rectangle = diamond" — source comment) — exactly what shape snapping needs.
- **Fitting is included**, not just classification: closed shapes snap to the stroke's bounding box; arrow tip = original point nearest the bbox-perimeter point farthest from stroke start. O(n), runs live, 25px minimum-size gate.

~500 lines, recognition + fitting designed together, production-proven. Port it to run against `getPointsFromDrawSegments` output.

### The $-family (UW ACE Lab) — viable fallback, more assembly required

All under [depts.washington.edu/acelab/proj/dollar/](https://depts.washington.edu/acelab/proj/dollar/index.html), official JS implementations on the project pages (verified live), **New BSD license**:

| Recognizer | What | Notes |
|---|---|---|
| **$1** (Wobbrock, Wilbur, Li — UIST 2007) | Unistroke template matcher, ~100 lines | **Rotation-invariant by design** (stated in the paper) — cannot distinguish square vs diamond or circle vs ellipse without modification |
| **$N** | Multistroke extension | Combinatoric overhead |
| **$P** | Point-cloud, stroke-order-agnostic | |
| **$Q** (Vatavu et al., MobileHCI 2018) | Optimized $P, 142× faster | Speed irrelevant at ~5 templates |

**Key limitation of the whole family: they are classifiers, not fitters.** After "circle," you still need a fitting layer — e.g. ShortStraw corner finding (Wolin/Eoff/Hammond, SBIM 2008, [diglib.eg.org](https://diglib.eg.org/items/9fc7bbef-5b6f-430e-b586-2a00883a362f)), IStraw (Xiong & LaViola, SBIM 2009, [diglib.eg.org](https://diglib.eg.org/items/142bb032-081d-4d8d-a550-7924cd765289)), or direct least-squares ellipse fitting (Fitzgibbon/Pilu/Fisher, IEEE TPAMI 21(5) 1999, [code](https://homepages.inf.ed.ac.uk/rbf/CVonline/LOCAL_COPIES/FITZGIBBON/ELLIPSE/)).

### npm ecosystem — mostly dead; vendor instead

- `outlines` ($P wrapper): abandoned 2017. `unistroke` / `OneDollar.js`: dead 2014/2016. `qdollar-super-quick-recognizer` (TS $Q, BSD-3, published 2026-09-10): fresh, unproven. `@smartupcorp/onedollar-unistroke-recognizer` (TS $1, BSD-3, 2026-04). `circle-fit` (MIT, least-squares circle fit): stable, tiny, useful. `fit-curve`: Schneider curve fitting — smoothing, not recognition.
- Verdict: vendoring the official ~100–300-line UW BSD files (or porting Excalidraw's ~500 lines) beats any of these dependencies.

## 4. Comparison and recommendation

| Option | Ships recognition? | Fits geometry? | Works in WKWebView+tldraw? | Cost |
|---|---|---|---|---|
| tldraw SDK built-in | No (declined PR; internal backlog, no timeline) | — | — | Wait indefinitely |
| PencilKit / Vision / Scribble | No public shape API through iOS 27 (Notes' snapping is private) | — | Moot — nothing to bridge to | — |
| Custom JS: Excalidraw port | Yes — rect/diamond/ellipse/arrow/line + freedraw fallback | **Yes, built in** | Yes — pure JS on decoded draw points | ~500 lines MIT + tldraw wiring |
| Custom JS: $1/$Q + own fitting | Classification only | No — build fitting layer; must also defeat $1's rotation invariance | Yes | More total work than the port |

**Recommendation (architecture fixed: Swift shell + WKWebView + tldraw):** Build recognition **custom in JS on the tldraw side** by porting Excalidraw's moment-based recognizer, wired via `registerAfterChangeHandler` on `isComplete` draw shapes (simplest) or a `DrawShapeTool` subclass (for recognize-before-finalize / draw-and-hold UX), decoding points with `getPointsFromDrawSegments` and replacing the stroke with `geo`/`arrow` shapes. Keep $1/$Q + ShortStraw/least-squares as the fallback recipe only if the port's feature thresholds don't transfer well to tldraw's smoothed strokes. Use the native shell for polish, not recognition: fire `UICanvasFeedbackGenerator.pathCompleted(at:)` over the JS bridge when a snap lands, and keep `WKScriptMessageHandler` + `PKStrokeRecognizer` (iOS 27) in the back pocket for future handwriting-to-text.

**Watch item:** tldraw has recognition on its internal backlog (ENG-3876) with stated interest in a "holistic," ProCreate-style implementation — if it ships, evaluate replacing the custom layer.

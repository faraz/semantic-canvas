# Research: PKToolPicker (system pen palette) driving the WKWebView Canvas

**Ticket:** [#20](https://github.com/faraz/semantic-canvas/issues/20) · **Date:** 2026-09-23 · **Sources:** primary only (developer.apple.com doc JSON endpoints, WWDC19/20/24 session transcripts, Apple Developer Forums incl. Apple staff replies). Builds on [shape-recognition research](https://github.com/faraz/semantic-canvas/blob/research/shape-recognition/docs/research/shape-recognition.md) (#5), which covered PencilKit basics; not re-covered here.

**Question:** Can PencilKit's PKToolPicker — the floating system palette with pencil/pen/marker/highlighter/eraser and colors — be shown in our WKWebView-only Shell and drive the tldraw Canvas over the Bridge?

**Answer in one line:** **Conditional GO** — Apple's documented API contract permits the tool picker without any PKCanvasView (any `UIResponder` can host it, confirmed by WWDC24: *"PKToolPicker can be used with PKCanvasView, your own drawing canvas, or a combination of both"*), and `PKToolPickerObserver` delivers everything needed to drive tldraw styles Shell→Canvas; but the one load-bearing detail — first-responder mechanics next to a WKWebView, which manages its own responder status — is undocumented and needs a half-day on-device probe before committing.

---

## 1. Presentation: no PKCanvasView required — but the first responder is the whole game

### The documented contract

- **Per-instance picker (iOS 14+), never the shared one.** [`PKToolPicker()`](https://developer.apple.com/documentation/pencilkit/pktoolpicker/init()) creates an app-owned instance; iOS 18 adds [`init(toolItems:)`](https://developer.apple.com/documentation/pencilkit/pktoolpicker/init(toolitems:)) for a custom tool set. The old window-shared [`shared(for:)`](https://developer.apple.com/documentation/pencilkit/pktoolpicker/shared(for:)) picker is deprecated — and is specifically hazardous for us: an iOS 17.4 WebKit crash ([forums thread 747050](https://developer.apple.com/forums/thread/747050)) was traced to the *shared* window picker applying itself to WKWebView text inputs; the fix was switching to the per-instance init. WWDC20 (session 10107) adds the classic footgun: *"you must always retain your own tool picker instance by having an Ivar reference it"* — an unretained picker silently never appears.
- **Visibility is keyboard-like, keyed to first responder.** [`setVisible(_:forFirstResponder:)`](https://developer.apple.com/documentation/pencilkit/pktoolpicker/setvisible(_:forfirstresponder:)) registers visibility *for a responder*; the palette shows while any registered object **is** first responder. The parameter doc says *"Typically, you specify a view capable of becoming the first responder"* — the parameter is `UIResponder`, **not** `PKCanvasView`, and no Apple documentation anywhere requires a PKCanvasView. An Apple Frameworks Engineer's standard debugging advice ([thread 130547](https://developer.apple.com/forums/thread/130547)) is literally to check `isFirstResponder == true` on the registered object.
- **Explicit Apple statement that non-PencilKit canvases are supported.** WWDC24 session 10214 ("Squeeze the most out of Apple Pencil"), verbatim: *"PKToolPicker can be used with PKCanvasView, your own drawing canvas, or a combination of both"* and *"With custom tools, your app does the rendering, and PencilKit does the tool picking."* Our tldraw canvas is exactly "your own drawing canvas."
- The picker *"automatically adds its palette view to the current window… a person may reposition it anywhere within the current window"* ([PKToolPicker overview](https://developer.apple.com/documentation/pencilkit/pktoolpicker)). Set [`showsDrawingPolicyControls`](https://developer.apple.com/documentation/pencilkit/pktoolpicker/showsdrawingpolicycontrols) `= false` (WWDC20 guidance for Pencil-only apps) and use [`stateAutosaveName`](https://developer.apple.com/documentation/pencilkit/pktoolpicker/stateautosavename) so the presenter's tools persist across launches. Bonus: on Pencil Pro, squeeze presents the picker positioned at the pencil pose *"in all apps"* (WWDC24 10214).
- Caveat for later: *"The tool picker doesn't display in Mac apps built with Mac Catalyst"* (class overview). iPad-only today, so not a blocker.

### The undocumented part: WKWebView and first responder

Whether registering the **WKWebView itself** works is not determinable from Apple sources:

- WKWebView aggressively manages its own responder status; the object that actually becomes first responder for web content is its internal `WKContentView`, not the WKWebView. Whether `setVisible(_:forFirstResponder:)` matches by exact object or by responder chain is **undocumented**.
- [Forums thread 655061](https://developer.apple.com/forums/thread/655061) asks precisely our scenario (PKToolPicker + WKWebView) and has **zero replies**, including from Apple.
- Threads [688096](https://developer.apple.com/forums/thread/688096) and [661607](https://developer.apple.com/forums/thread/661607) suggest the registered responder must be in a window and actually hold first-responder status at display time.

**This is empirical-only.** The design that sidesteps it: register a minimal transparent **host view** (`canBecomeFirstResponder = true`) layered with the WKWebView — not the webview itself — and keep it first responder. Smallest experiment (~40 lines of Swift, on device):

1. UIViewController with a WKWebView (the existing pencil-probe bundle) plus an overlaid zero-alpha `FirstResponderHostView`.
2. Retained `PKToolPicker` ivar; in `viewDidAppear`: `picker.setVisible(true, forFirstResponder: host)`, `picker.addObserver(self)`, `host.becomeFirstResponder()` — does the palette appear over tldraw?
3. Variant (a): register the WKWebView itself and call `webView.becomeFirstResponder()` — does exact-object vs responder-chain matching matter?
4. Variant (b): focus a tldraw text field (keyboard up → WKContentView takes first responder) — does the palette hide, and does it return on `host.becomeFirstResponder()` after blur?
5. Log every observer callback and `frameObscured(in:)` while drawing, floating and docked.

## 2. What tool changes deliver, and the tldraw mapping over the Bridge

### Observer payloads

[`PKToolPickerObserver`](https://developer.apple.com/documentation/pencilkit/pktoolpickerobserver) (`@MainActor`, all methods optional) delivers: `toolPickerSelectedToolItemDidChange` (iOS 18+; the iOS 13–18 `selectedTool` variant is deprecated), `toolPickerIsRulerActiveDidChange`, `toolPickerVisibilityDidChange`, `toolPickerFramesObscuredDidChange`. Callbacks pass the picker; read `selectedToolItem` off it.

A selected [`PKInkingTool`](https://developer.apple.com/documentation/pencilkit/pkinkingtool) carries everything we need: `inkType` (`pen`/`pencil`/`marker` iOS 13; `monoline`/`fountainPen`/`watercolor`/`crayon` iOS 17; `reed` iOS 26), `color: UIColor`, `width: CGFloat` (with `InkType.defaultWidth`/`validWidthRange` for normalization). [`PKEraserTool`](https://developer.apple.com/documentation/pencilkit/pkerasertool): `eraserType` (`vector`/`bitmap`, iOS 16.4 `fixedWidthBitmap`) + `width` (16.4+). Plus `PKLassoTool`. Selecting system inking items with **no** PKCanvasView observing is fine by design (WWDC24's whole custom-canvas story), though side effects are worth one probe assertion (see §5).

### Mapping onto tldraw (values verified against tldraw@5.4.2 in-repo)

| PencilKit | tldraw | Fidelity notes |
|---|---|---|
| `pen`, `pencil`, `monoline`, `fountainPen`, `watercolor`, `crayon`, `reed` | tool `draw` | Ink character (texture, pressure curve) is tldraw's, not PencilKit's — the palette picks, tldraw renders |
| `marker` | tool `highlight` | Best match: both are wide translucent chisel strokes |
| `PKEraserTool` (any `eraserType`, any width) | tool `eraser` | tldraw erases whole shapes only; `vector`/`bitmap`/width distinctions are dropped |
| `PKLassoTool` | tool `select` | Marquee, not lasso — acceptable |
| Ruler active | no-op | No tldraw counterpart |
| `color: UIColor` | nearest of the 13 `DefaultColorStyle` values (`black`, `grey`, `light-violet`, `violet`, `blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`, `light-red`, `red`, `white`) | **Quantization**: the palette offers a full color picker; snap to nearest palette hex (resolve the UIColor in light trait, RGB-distance against tldraw's light theme) on the Shell side so the Bridge vocabulary stays closed |
| `width` | `DefaultSizeStyle` bucket `s`/`m`/`l`/`xl` | Normalize within the ink's `validWidthRange`, then quartile |

### Bridge extension: the first Shell→Canvas messages

The Bridge is Canvas→Shell only today (`canvas/src/bridge.ts`; the comment designates the tldraw license key as the first future Shell→Canvas message — this work would land the same versioned `{ v, event }` scheme it anticipates). Transport: Shell calls `webView.evaluateJavaScript` into a receive function the Canvas registers; unknown/malformed messages ignored silently, mirroring the Shell side.

```ts
// Shell → Canvas (new direction)
export type ShellMessage =
  | { v: 1; event: 'penToolChanged';
      tool: 'draw' | 'highlight' | 'eraser' | 'select';
      color?: TLDefaultColorStyle; size?: TLDefaultSizeStyle }
  | { v: 1; event: 'penPaletteVisibility'; visible: boolean }
  // rect in Canvas CSS points, null when nothing is obscured (docked palette case)
  | { v: 1; event: 'penPaletteObscured';
      rect: { x: number; y: number; w: number; h: number } | null }
```

Canvas handling is three lines per message: `editor.setCurrentTool(tool)`, `editor.setStyleForNextShapes(DefaultColorStyle, color)`, `editor.setStyleForNextShapes(DefaultSizeStyle, size)`; `penPaletteObscured` feeds Stage Presence layout (§4).

## 3. iOS 18+: our shape tools inside the system palette

Yes — this is exactly what the API is for. [`PKToolPickerCustomItem`](https://developer.apple.com/documentation/pencilkit/pktoolpickercustomitem) (iOS 18+) with its [`Configuration`](https://developer.apple.com/documentation/pencilkit/pktoolpickercustomitem/configuration) (`identifier`, `name`, `defaultColor`, `allowsColorSelection`, `defaultWidth`, `widthVariants: [CGFloat: UIImage]`, `imageProvider`, `viewControllerProvider`, `toolAttributeControls`) lets us add Rectangle/Ellipse/Diamond/Arrow items with our glyphs, color and width wells riding the system UI. WWDC24 10214: *"The custom item opens up PKToolPicker to any non-PencilKit tool you can imagine!"* (and, reassuring for mixed setups: *"Drawing is turned off on any observing PKCanvasView when a custom tool item is selected"* — moot for us, no PKCanvasView). [`accessoryItem`](https://developer.apple.com/documentation/pencilkit/pktoolpicker/accessoryitem) (iOS 18+) adds one `UIBarButtonItem` — Apple's own example use case is *"showing a menu for adding different shapes to the canvas"*, i.e. our shape tray could become the palette's accessory menu. `init(toolItems:)` composes system inks + our custom items in one palette. This is the future path that could retire the dock's shape section entirely; it raises the iOS floor for that feature to 18, and item selection arrives via the same observer (`selectedToolItemIdentifier`) → same `penToolChanged`-style Bridge message with a shape payload.

## 4. Risks and the Stage Presence collision

- **Palette vs. bottom dock.** The floating palette is user-repositionable anywhere in the window; in compact widths (Split View, Slide Over, narrow Stage Manager) it docks **full-width at an edge — typically the bottom**, exactly where the Stage Presence dock lives. Mitigation exists and is documented: [`frameObscured(in:)`](https://developer.apple.com/documentation/pencilkit/pktoolpicker/frameobscured(in:)) returns the portion of a view the palette obscures — per WWDC19 (Introducing PencilKit), floating counts as *not* obscuring, docked *does* — bridged as `penPaletteObscured` so the dock can shift or yield. Caveat from Apple DTS ([thread 785194](https://developer.apple.com/forums/thread/785194)): `toolPickerFramesObscuredDidChange` fires sparsely — poll `frameObscured` at layout time rather than trusting the callback.
- **Touch stealing.** Within its own frame the palette consumes touches (it's a window-level overlay). Whether anything outside its frame is affected is undocumented — probe question. Practical consequence regardless: a floating palette dragged over the right-edge shape rail or dock blocks those hit targets; Stage Presence's ghosting (opacity-only, hit targets frozen) doesn't help if the palette physically covers chrome.
- **First-responder tug-of-war with web text input.** tldraw's text and note tools focus contenteditable in the WKWebView → `WKContentView` takes first responder → with keyboard-like visibility semantics the palette may hide mid-session, and must be re-asserted after blur. Undocumented; probe variant (b). Also verify the per-instance picker doesn't disturb web text inputs (the 17.4 crash was shared-picker-specific, but worth one assertion).
- **Fullscreen chrome.** `persistentSystemOverlays(.hidden)` + `statusBarHidden` (our `SemanticCanvasApp`) govern *system* overlays (home indicator); the palette is added to the app's own window and no documented interaction exists. Expected fine; confirm visually in the probe.
- **UX duplication — a product decision, not a bug.** The palette duplicates the Stage Presence style panel (color, size) with a *larger* vocabulary (any color, continuous width) that we quantize down to 13 colors x 4 sizes — the user picks teal, tldraw draws `light-blue`. Running both stylers simultaneously guarantees drift and confusion. The honest options: (a) pen styling ruled by the system palette, style panel hidden/reduced while the palette is visible; or (b) our chrome stays canonical and the palette is off. Also: unlike our chrome, the palette does not participate in the ghost choreography — it will not dim during a stroke; it's a system-rendered element the audience will always see. Mode decision for Faraz before any integration lands.
- **Housekeeping:** retain the picker in an ivar (never-appears bug); per-instance init only; iPad-only is fine but Catalyst would not display the picker.

## 5. Verdict and next step

**Conditional GO.** The API contract is explicitly designed for non-PencilKit canvases (WWDC24), the observer delivers a complete, cleanly mappable payload, and the obscured-frame API answers the dock collision. The single blocker-class unknown is first-responder mechanics beside a WKWebView — unanswered in Apple docs and forums — plus three smaller empirical questions.

**Recommended follow-up — prototype ticket ("pen-palette-probe", same shape as pencil-probe #3):** extend the `prototype/pencil-probe` pattern (throwaway xcodegen app + committed tldraw bundle) with the ~40-line experiment from §1. Half a day on the iPad Pro. Must answer:

1. Does the palette appear registered to a transparent host view over the WKWebView? To the WKWebView itself?
2. Does web text focus (keyboard) hide it, and can we bring it back reliably?
3. Are touches outside the palette frame delivered untouched to tldraw (draw right up to its edge)?
4. What does `frameObscured(in:)` report floating vs docked in a narrow window, and does the observer callback fire?
5. With a system ink selected and no PKCanvasView anywhere, are there any side effects (gesture interference, drawing policy prompts)?

Success bar: palette visible over the tldraw Board, tool/color/width changes logged in the observer while drawing stays unaffected. If it passes, the integration is the Bridge extension of §2 (first Shell→Canvas messages) plus the §4 mode decision; if question 1 fails both ways, this is a NO-GO and Stage Presence remains the only pen chrome.

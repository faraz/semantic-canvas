# Research: tldraw-mods (tldrawmods.dev) — integration path and licensing

Resolves issue #18 (parent spec #7). Researched 2026-09-22 against primary sources: the
tldrawmods.dev site, the source repo [btn0s/tldraw-mods](https://github.com/btn0s/tldraw-mods)
(cloned at HEAD), the npm registry, and an actual run of the CLI (`init` +
`add toolbar-icons landmark browser`) in a throwaway directory, reading every emitted file.

## Verdict

| Mod | Verdict | One-line reason |
|---|---|---|
| toolbar-icons | **No-go** | Unlicensed code and unlicensed PNG sprite of unknown provenance; sprite also lacks cells for our ellipse/diamond/line tools |
| landmark | **No-go on vendoring; technique is a clean-room candidate** | Unlicensed source; but it is plain tldraw-SDK code and the design (frame-like shape + zoom-invariant label chip) is reimplementable from scratch |
| browser | **No-go** | Requires live network (its entire purpose is embedding remote web pages in an iframe) — incompatible with our fully-offline requirement; also unlicensed |

**The blanket blocker is licensing: the mod source carries no license at all** (details below).
Nothing from `workspace/` may enter this repo. Ideas and API usage patterns are not
copyrightable; reimplementing the landmark concept from our own code is fine.

## 1. What the CLI emits, and what it targets

### The platform targets the tldraw offline desktop app's per-document script system, not the SDK

- The repo README (source: `README.md` at HEAD) is explicit: "Add-ons for the
  [tldraw offline](https://offline.tldraw.com) desktop app… Each `.tldraw` file can carry its
  own code, and the app runs it whenever the file is opened."
- The workspace `tsconfig.json` the CLI writes maps `tldraw`, `react`, and
  `tldraw-offline/script-context` to type files **inside the installed desktop app**:
  `/Applications/tldraw offline.app/Contents/Resources/sdk-types/…` and
  `…/Resources/script-context.d.ts` (source: `cli/index.mjs`, embedded `tsconfig` template).
- `src/config.tsx` default-exports `async function (ctx: ConfigScriptContext)` — "the same
  function the app runs for config.js" (source: `workspace/src/mod.ts` comment). It mutates
  `ctx.config.shapeUtils`, `ctx.config.tools`, `ctx.config.components`.
- `build.mjs` bundles everything with esbuild, marking `react`, `react-dom`, and `tldraw` as
  `external` "so the script binds to the app's own instances", and `apply.mjs` writes the bundle
  into the open document's "script workspace" via the desktop app's local HTTP API
  (`http://localhost:<port>` with a bearer token read from
  `~/Library/Application Support/tldraw/server.json`) (sources: `workspace/build.mjs`,
  `workspace/apply.mjs`).

### But the shape/tool code itself is plain tldraw SDK code

The offline-app coupling is confined to the wiring (`config.tsx`, `mod.ts`, `apply.mjs`). The
mods themselves import only from `tldraw`, `@tldraw/tlschema` (a
`declare module` augmentation of `TLGlobalShapePropsMap`), `react`, `lucide-react`, and local
helpers. Every SDK symbol they use exists in **tldraw@5.4.2 as installed in `canvas/`**
(verified by grepping our `canvas/node_modules` type declarations): `ShapeUtil`,
`HTMLContainer`, `Rectangle2d`/`Group2d`, `T`, `resizeBox`, `BaseBoxShapeTool`,
`getEfficientZoomLevel`, `excludeFromShapeBounds`, `getIndicatorPath` (Path2D), `isFrameLike`,
`getAriaDescriptor`, `markHistoryStoppingPoint`, `TLUiIconJsx`, `editor.textMeasure`, and the
`data-testid="tools.<id>"` attribute (generated in
`tldraw/dist-esm/lib/ui/components/primitives/menus/TldrawUiMenuItem.mjs`).

So: the code **would largely compile against tldraw@5.4.2 / React 19** after (a) replacing the
`ModConfig`/`ConfigScriptContext` wiring with our own `shapeUtils`/`tools`/`components` props,
and (b) removing the styling stack — the mods use Tailwind 4 utility classes, `cn`,
`lucide-react`, and a shared `tool-chrome.tsx`; our `canvas/` build has none of that (plain CSS,
`vite-plugin-singlefile`). Portability is not the blocker. Licensing is.

### The documented install command does not actually work

`npx tldraw-mods` **404s — the package is not published to npm** (`npm view tldraw-mods` →
E404; no scoped variant exists either). `cli/index.mjs` is a ~150-line wrapper around the
`shadcn` CLI (pinned 4.21.0). I ran it from the cloned repo: `init` and
`add toolbar-icons landmark browser` work, fetching files from the GitHub-hosted shadcn
registry (`https://raw.githubusercontent.com/btn0s/tldraw-mods/HEAD/registry.json`). The
emitted files are byte-identical to `workspace/src/` in the repo (verified with `diff -r`).

## 2. Licensing — hard no-go for vendoring

Checked everywhere a grant could live:

- **No LICENSE/COPYING/NOTICE file anywhere in the repo** (`find -iname '*license*'` etc.: zero
  hits outside node_modules).
- **GitHub reports `licenseInfo: null`** for btn0s/tldraw-mods (`gh repo view --json licenseInfo`).
- **`workspace/package.json`** — the package containing all mod source — is `"private": true`
  with **no `license` field**.
- **No license headers** in any `.ts/.tsx/.mjs` source file (grep for
  license/copyright/SPDX: zero hits).
- **`registry.json`** (the mod manifest): no license metadata.
- **tldrawmods.dev and tldrawmods.dev/protocol**: no license, copyright, or terms mentioned.
- The **only** grant in the whole project is `"license": "MIT"` in `cli/package.json` — it
  covers the CLI wrapper alone (and ships no license text; the package is unpublished anyway).

Under copyright default, the mod source and assets are **all rights reserved**. Per the ticket's
own rule — "nothing unlicensed enters the repo" — vendoring any of `toolbar-icons.tsx`,
`toolbar-strip.ts`, `landmark.tsx`, `browser.tsx`, `tool-chrome.tsx`, `ui.ts`, or `config.tsx`
is a **hard no-go** unless the author (btn0s) adds a license or grants one. That is also the
recommended unblock path: an issue/PR asking for a LICENSE file would settle it; MIT on the CLI
suggests the author is not hostile to permissive licensing.

## 3. Per-mod detail

### toolbar-icons — no-go (license + coverage gap)

What it is (source: `workspace/src/mods/toolbar-icons.tsx`, 26 lines +
`workspace/src/toolbar-strip.ts`): pure CSS injected via an `InFrontOfTheCanvas` `<style>` tag.
It un-masks `.tlui-icon` under `[data-testid="tools.<id>"]` buttons and shows a **base64
data-URI PNG sprite** (128px cells, ~250 KB source file) with hover/active scale transforms.
No components, no shapes.

- Would technically bind to our custom `TabletToolbar` (`canvas/src/ui/TabletToolbar.tsx`),
  since our `*ToolbarItem`s render the same `data-testid="tools.<id>"` buttons in
  tldraw@5.4.2.
- But the sprite only has cells for select, hand, draw, eraser, arrow, text, note, asset,
  rectangle. Our toolbar also shows **ellipse, diamond, line** — no cells exist, so we'd get a
  mixed 3D/flat icon set even if we could use it.
- The sprite's provenance is unstated ("rendered 3D icons") and it is **unlicensed** — cannot be
  vendored, and it is **not a usable asset source for design ticket #19**. If #19 wants this
  look, we must render our own 12-cell sprite; the CSS technique (unmask `.tlui-icon`,
  background-position into a sprite, scale on hover/active) is trivially reimplementable.

### landmark — no-go on vendoring; best clean-room candidate

What it is (source: `workspace/src/mods/landmark.tsx`, 125 lines): a `LandmarkShapeUtil`
(`TLBaseShape<'landmark', {w,h,label}>`) drawing a dashed SVG outline with a label chip that
stays constant screen size (`scale(1/zoom)` in the view; chip geometry divided by zoom in
`getGeometry` as a `Group2d` label rect with `excludeFromShapeBounds`). `isFrameLike()` gives
frame-style hit-testing (click inside selects contents, not the outline). A
`BaseBoxShapeTool` subclass places it; a helper wraps the current selection with padding and
enters label editing.

- Fully offline, no network, no app-specific APIs. All APIs verified present in tldraw@5.4.2.
- Integration sketch (clean-room, ~1 day): our own `LandmarkShapeUtil` + tool registered via
  `shapeUtils`/`tools` props on `<Tldraw>`, a toolbar button appended in `TabletToolbar`
  (`TldrawUiMenuItem` with `editor.setCurrentTool`), label editing via tldraw's editing-shape
  state, plain CSS instead of Tailwind, no `tool-chrome` dependency (its field/chrome helpers
  are ~130 lines we don't need for a single label input).
- Vendoring the file itself: **blocked by license**.

### browser — no-go (offline requirement; also license)

What it is (source: `workspace/src/mods/browser.tsx`, 144 lines): a shape whose component
renders a **sandboxed `<iframe>` pointed at a user-entered http(s) URL**, with an address bar,
reload, and phone/tablet/desktop viewport presets. `normalizeUrl` allows only `http:`/`https:`
(plus localhost), rejects credentials and file/executable schemes.

- Its entire purpose is loading **live remote web pages**. We ship fully offline: judged against
  that requirement it is dead on arrival — an empty chrome around a blank iframe.
- Even ignoring that: inside our `file://`-origin WKWebView, remote iframes mean mixed-origin
  content, App Transport Security constraints, and no service-worker/cache story; and many
  sites refuse framing via `X-Frame-Options`/CSP (the mod's own registry docs admit "Some sites
  refuse to be embedded and will show blank", source: `registry.json` browser entry).
- A hypothetical offline variant (iframe onto bundled local HTML) would be a different feature
  and shares nothing worth taking. **No-go.**

## 4. Telemetry / remote fetches

- **Emitted runtime code: zero network calls** except the browser mod's user-supplied iframe
  `src` (its purpose). Grep of all emitted sources for
  `fetch(|XMLHttpRequest|sendBeacon|analytics|telemetry|posthog|sentry|https?://` finds nothing
  else. The toolbar-icons sprite is an embedded data URI, not a remote asset.
- **Install-time only:** `cli/index.mjs` fetches `registry.json` from
  `raw.githubusercontent.com`, and the wrapped shadcn CLI downloads the listed files. Normal
  shadcn-model behavior; nothing phones home.
- `apply.mjs` talks only to the desktop app's local API on `localhost`.
- (A comment in `command-bar.tsx` mentions preserving the *app's* "analytics" when reusing
  native actions — that refers to the tldraw offline app itself, not mod code.)

## Implications for design ticket #19

- **No usable icon assets come out of this**: the 3D toolbar sprite is unlicensed and
  incomplete for our tool set. #19 must source or render its own icons.
- The **landmark pattern is a proven design** worth adopting clean-room: `isFrameLike()` +
  `Group2d` label geometry with `excludeFromShapeBounds` + `scale(1/zoom)` chip is the right
  SDK recipe for zoom-stable region labels, and every API it needs exists in 5.4.2.
- The toolbar-icons **CSS mechanism** (targeting `[data-testid="tools.<id>"] .tlui-icon`) works
  against our TabletToolbar unchanged in 5.4.2 — a viable technique for any icon restyle in #19.
- Watch the upstream repo: if btn0s adds a LICENSE, the vendoring calculus for landmark (and the
  sprite, if extended) flips.

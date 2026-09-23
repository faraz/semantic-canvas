# Research: local multiplayer — the iPad hosts the Board, a Mac browser joins

Resolves issue #22 (parent spec #7, whose out-of-scope note "sharing is SharePad's
job" this ticket re-examines for LOCAL same-network enrichment). Researched
2026-09-23 against primary sources: the shipped `@tldraw/sync@5.4.2` and
`@tldraw/sync-core@5.4.2` packages (installed in a throwaway directory and read
file-by-file — nothing was added to this repo), tldraw.dev's sync docs and pricing
pages, Apple's Network.framework documentation and TN3179, and the FlyingFox
repository. Licensing builds on the prior research in
[tldraw-licensing.md](tldraw-licensing.md) (branch `research/tldraw-licensing`).

## Verdict

**iPad-as-host is feasible and recommended.** The pivotal finding: `@tldraw/sync-core`
is pure JavaScript with zero Node dependencies, so `TLSocketRoom` — tldraw's
authoritative sync server — runs inside the Canvas page in the WKWebView. The
Shell embeds one small Swift server (FlyingFox, MIT) on one port that (a) serves
our self-contained `index.html` to the Mac browser and (b) accepts its WebSocket
connection, relaying frames to the Canvas over a **loopback WebSocket** — not over
the Bridge, whose main-thread `postMessage`/`evaluateJavaScript` path is the wrong
tool for a ~60 Hz frame stream. The iPad's own editor joins the room through an
in-process socket (zero network hops). The existing Board seeds the room's initial
snapshot and folds back into `persistenceKey` persistence when the session ends;
solo behavior is untouched.

- **Licensing: sync is included.** `@tldraw/sync-core`'s own package metadata marks
  it `premium: false`, a feature of `tldraw:sdk-core`; our dev-mode posture
  (forced `NODE_ENV=development`, non-HTTPS origins) needs no key on either device.
- **Effort: ~2 weeks** (Canvas session module 3–5 d, Shell server + session UI
  2–4 d, integration/QA 2–3 d).
- **Fallback** (Node helper on the Mac, plausibly carried by SharePad) is 2–4 days
  of work but inverts ownership: the Board's authority would live on the Mac.

---

## 1. tldraw sync anatomy

### useSync — the client

`useSync(opts)` (in `@tldraw/sync`) returns a `RemoteTLStoreWithStatus`; its
`.store` is passed to `<Tldraw store={...}>` — it **replaces** `persistenceKey`
(the two are alternative store sources). Options:

- `uri` — the WebSocket URL of the room, **or** `connect` (see below);
- `assets: TLAssetStore` — required; without it, images/files are inlined as
  base64. For an ink-first LAN session a trivial inline store is acceptable at
  first;
- `users` (renamed from `userInfo` in 5.x), `getUserPresence`,
  `onCustomMessageReceived`, `themes`.

Reserved query params `sessionId`/`storeId` are appended automatically. The client
pings every 5000 ms and expects a pong; it reconnects automatically after drops.

**Custom transports are first-class.** `UseSyncOptionsWithConnectFn` accepts
`connect: (query: {sessionId, storeId}) => TLPersistentClientSocket`, where the
socket contract is `{ connectionStatus, sendMessage, onReceiveMessage,
onStatusChange, restart(), close() }`. This is what lets the iPad's own editor
join its in-page room with no network at all.

### TLSocketRoom — the server

`new TLSocketRoom(opts)` (in `@tldraw/sync-core`) is the per-document authority.
The docs are explicit that there must be **exactly one room instance globally per
document** or clients overwrite each other — fine for us, since our app has exactly
one Canvas page.

- **Persistence seam:** `storage?: TLSyncStorage`. Ships with
  `InMemorySyncStorage({snapshot, onChange})` (onChange is microtask-coalesced;
  throttle further yourself) and `SQLiteSyncStorage` (injected DB). The older
  `initialSnapshot` / `onDataChange` / `getCurrentSnapshot` / `updateStore`
  surface is deprecated in favor of `storage`.
- **Key methods:** `handleSocketConnect({sessionId, socket, isReadonly?, meta?})`,
  `handleSocketMessage(sessionId, msg)` (for runtimes where you can't attach
  listeners to a socket), `handleSocketError/Close`, `sendCustomMessage`,
  `closeSession`, `loadSnapshot` (disconnects all clients), `close`. Also
  `authorizeRecord`, `onSessionRemoved`, `onCommittedChanges`, `clientTimeout`.
- **Sockets are duck-typed.** The expected shape is `WebSocketMinimal`:
  `{ addEventListener?, removeEventListener?, send(data: string),
  close(code?, reason?), readyState }` — the listener methods are optional. Any
  object satisfying this works: a real WebSocket, a loopback relay shim, or an
  in-process fake. Server sends are plain `JSON.stringify` strings.

### Wire protocol

**JSON text frames**, `TLSYNC_PROTOCOL_VERSION = 8`. Client→server messages are
chunked at 256 KB with `"{numRemaining}_"` prefixes (a Cloudflare limit; the
`JsonChunkAssembler` inside sync-core reassembles them — transparent to any relay,
since chunks are ordinary text frames). Server→client is unchunked, including the
initial `connect` hydration which carries the whole document. Message types:
client sends `connect`/`push`/`ping`; server sends `connect` (hydrationType
`wipe_all` | `wipe_presence`), `patch`, `push_result`
(`commit`/`discard`/`rebaseWithDiff`), `pong`, `custom`. Diffs are `NetworkDiff`
put/patch/remove records; outgoing data is debounced at ~60 Hz.

### What the server owns

The room holds the authoritative document `AtomMap`, tombstones (pruned at a max
of 5000), and a monotonic `documentClock`. Presence is ephemeral (separate
`PresenceStore`, never persisted). Reconnecting clients catch up via their
`lastServerClock` — incremental `wipe_presence` when possible, `wipe_all`
otherwise. The persisted form is `RoomSnapshot = { clock?, documentClock?,
documents: [{state, lastChangedClock}], tombstones?, schema? }` — the migration
path for our existing Board (§3).

### Environment requirements — the pivotal finding

**`@tldraw/sync-core` is pure JS.** The complete bare-import set of its shipped
dist is `@tldraw/state`, `@tldraw/store`, `@tldraw/tlschema`, `@tldraw/utils`,
and `nanoevents`. No `node:` imports, no `fs`/`http`/`crypto`. The `ws` package
appears only in doc comments and shipped test files — a phantom, never imported
at runtime (**re-check on every upgrade**). Runtime globals used: `setTimeout`,
`Date.now`, `TextDecoder`, `structuredClone` (ponyfilled). The `engines:
node>=22` field is advisory only. **Verdict: `TLSocketRoom` runs inside the
WKWebView's Canvas page.**

### Licensing verdict

Sync is a non-premium feature of the SDK license we already operate under:

- `@tldraw/sync-core`'s `package.json` carries
  `tldraw_product: { stableId: "tldraw:sync", type: "feature",
  parent: "tldraw:sdk-core", premium: false }`;
- all three packages ship byte-identical `LICENSE.md` files pointing at the SDK
  license; license-key/watermark enforcement lives entirely in the editor package
  (zero hits in the sync dists);
- tldraw.dev/pricing lists multiplayer synchronization as included in the SDK
  license; tldraw.dev/docs/sync says the demo server (`demo.tldraw.xyz`) is
  prototyping-only (public, wiped ~daily) and production means self-hosting —
  which is exactly what we'd be doing, on the iPad itself.

Our posture (per [tldraw-licensing.md](tldraw-licensing.md)): the bundle forces
`NODE_ENV=development`, and the Mac browser loads it over plain `http://` — both
of which the SDK treats as development, so **no key is needed on either device,
the watermark shows, and no telemetry is sent**. A future hobby/commercial key
covers sync with no separate license. One nuance flagged in §5: the Mac leg is
non-HTTPS by construction, so it would ride dev mode even in a "production" future.

---

## 2. Recommended architecture: iPad as host

```
Mac browser ──http GET /──────► FlyingFox (Shell, one port)──serves index.html
Mac browser ──ws /connect─────► FlyingFox ◄──envelope {sid,ev,data} over
                                              one loopback ws /room──► Canvas page
                                                                        │
                                             per-session WebSocketMinimal shims
                                                                        ▼
   iPad editor ──useSync(connect: in-process socket)──────────► TLSocketRoom
                                                                        │
                                                    InMemorySyncStorage.onChange
                                                                        ▼
                                                     shadow snapshot → persistenceKey
```

### The serving leg: FlyingFox in the Shell

Network.framework can act as a WebSocket *server* natively
(`NWProtocolWebSocket.Options.setClientRequestHandler` in the listener's
protocol stack; frames via `receiveMessage` with `Metadata.opcode`), but it has
**no HTTP server API**, and the Mac needs the app served to it. Rather than
hand-rolling HTTP next to a raw `NWListener`, embed **FlyingFox**
(github.com/swhitty/FlyingFox — MIT, actively maintained, Swift Concurrency):
it does static file serving **and WebSocket upgrade on the same port**, covering
both legs with one dependency. (Survey of alternatives: GCDWebServer is archived,
Swifter dormant — both ruled out; Telegraph works but has a slow release cadence.)

Routes:

- `GET /` → the bundled `index.html` (our vite-single-file build is genuinely
  one self-contained file, so this is trivial — no asset manifest to serve);
- `WS /connect` → remote clients (the Mac's `useSync({uri})`);
- `WS /room` → one connection, accepted **only from loopback** (check peer
  address): the Canvas page's relay hub.

### The frame path — why loopback WS beats the Bridge

The obvious relay — FlyingFox frame → `evaluateJavaScript` into the page, page →
`postMessage` back — is the wrong hot path. Apple's docs are explicit that
`WKScriptMessageHandler` delivery and `evaluateJavaScript` both run on the
**main thread**, message bodies are limited to plist types (no binary; no
documented size limit — undocumented, a risk in itself), and the initial `connect`
hydration can be a multi-hundred-KB string needing careful escaping. At ~60 Hz per
guest, that's main-thread jank stacked on top of rendering.

Instead the Canvas page opens **one outbound WebSocket to
`ws://127.0.0.1:<port>/room`**. FlyingFox pairs each remote guest socket with
envelope frames `{sid, ev: "open"|"msg"|"close", data}` on that hub connection;
page-side, a thin shim per `sid` implements `WebSocketMinimal` (its `send`
wraps the envelope) and is handed to `room.handleSocketConnect`. Frames then ride
real OS-level sockets end to end — off the main thread, with real backpressure —
and chunking works untouched because chunks are ordinary text frames. The Bridge
stays what it is today: a low-rate control channel (start/stop session, port
number, the URL to display), reusing the versioned `{v, event}` scheme.

Latency budget: LAN WebSocket 1–5 ms + sub-millisecond loopback hop; sync-core's
own 60 Hz debounce dominates. This is comfortably real-time.

**Flag (unverified):** the Canvas page is loaded via `loadFileURL` (file://
origin). `ws://127.0.0.1` from that page should work, but App Transport Security
may require `NSAllowsLocalNetworking` (or `NSAllowsArbitraryLoadsInWebContent`)
in the Shell's Info.plist. Verify first in the spike — it's a one-key fix but a
hard blocker if forgotten.

### The host editor's own connection

The iPad's editor uses `useSync({connect})` returning an in-process
`TLPersistentClientSocket` wired directly to `room.handleSocketConnect` with a
paired fake `WebSocketMinimal` — no loopback, no serialization beyond the
protocol's own JSON. Host and guests are then uniform sync clients of one room,
which is exactly the topology sync-core's one-room invariant wants.

### Discovery

TN3179 ("Understanding local network privacy") draws a sharp asymmetry:
**listening for and accepting incoming TCP connections does not require the
local-network permission; all Bonjour operations do** (Info.plist
`NSLocalNetworkUsageDescription` + `NSBonjourServices`; the
`com.apple.developer.networking.multicast` entitlement is *not* needed for
declared service types). And no modern browser surfaces Bonjour service browsing
anyway — advertising `_semcanvas._tcp` would only help a future SharePad-side
auto-discovery, not a human with Safari.

So the pragmatic MVP: **skip Bonjour entirely — zero permission prompts** — and
display the join URL in the session UI as both a QR code and text. macOS resolves
`<device-name>.local` system-wide via mDNS (Apple support doc 101903 / RFC 6762),
and iPads answer for their hostname without any app-level advertising, so
`http://<ipad-name>.local:<port>` typed into the Mac browser works; show the
numeric `http://<ip>:<port>` alongside as the fallback that always resolves.

### Permissions and lifecycle

- **Suspension kills listeners.** Apple DTS guidance: close listeners when the
  app becomes eligible for suspension, reopen on foreground. Hosting therefore
  means staying foreground — already true in the meeting flow (the app is being
  screen-shared through SharePad). Set `isIdleTimerDisabled` while a session is
  live so the screen never locks mid-meeting; `UIRequiresPersistentWiFi` keeps
  Wi-Fi associated.
- **Guest lifecycle:** guest WS drop → envelope `close` → `handleSocketClose` →
  presence evaporates (it's ephemeral). Guests' `useSync` auto-reconnects after
  blips. Host app suspension drops all guests; the document survives because the
  room's storage lives in the page and write-through persistence (§3) has the
  latest state.
- **Session lifecycle:** "Start session" (Bridge control message) → Shell starts
  FlyingFox, reports port/URL → Canvas seeds and opens the room, connects the hub
  socket → UI shows QR. "End session" tears down in reverse; the Board folds back
  to solo persistence.

### Effort: ~2 weeks

| Piece | Work | Estimate |
|---|---|---|
| Canvas session module | room hosting, in-process socket, hub-relay shims, mode switch, snapshot migration + write-through | 3–5 days |
| Shell | FlyingFox integration, loopback-only `/room` guard, session control messages, QR/URL UI, idle-timer handling | 2–4 days |
| Integration | two-device testing, reconnect/teardown edges, ATS verification, licensing sanity | 2–3 days |

---

## 3. Interplay with persistenceKey

`useSync`'s store replaces `persistenceKey` — they cannot be combined on one
`<Tldraw>`. The clean shape:

- **Solo (default):** exactly today — `persistenceKey="semantic-canvas-board"`,
  tldraw's IndexedDB persistence, no session code on any path. Spec #7's "fully
  functional with no network" requirement is untouched.
- **Start session:** snapshot the live editor's store (documented snapshot API),
  map its records into `RoomSnapshot.documents` (`{state, lastChangedClock: 0}`),
  seed `InMemorySyncStorage({snapshot})`, start the room, and **remount**
  `<Tldraw>` with the `useSync` store. The existing Board *is* the room's initial
  state.
- **During session:** the storage's coalesced `onChange` writes a shadow copy of
  the `RoomSnapshot` to our own IndexedDB/localStorage key (throttled). We do
  **not** write into tldraw's own `persistenceKey` IndexedDB — its format is
  internal and undocumented; the shadow copy uses only public snapshot APIs.
- **End session (and crash recovery):** remount with `persistenceKey` and load
  the final (or last-shadowed) snapshot into the editor via the documented
  load-snapshot API; `persistenceKey` persistence then resumes owning it. On next
  solo launch, if a shadow newer than the last clean teardown exists, replay it
  the same way.

The remount is the one visible seam (a brief editor re-instantiation on
start/end of a session); acceptable for an explicit session boundary.

---

## 4. Fallback: a Mac-side helper (Node), possibly inside SharePad

The documented happy path for `TLSocketRoom` is Node (tldraw's
`simple-server-example` template; also a Cloudflare Durable Objects template). A
tiny helper on the Mac — a few dozen lines: `ws` + static file serving of the
same `index.html` + one `TLSocketRoom` — would host the room; the iPad and the
Mac browser both join as ordinary `useSync({uri})` clients. SharePad, which is
already running on the Mac during every meeting, is a natural carrier for it.

Honest tradeoffs:

| | iPad-as-host (recommended) | Mac helper (fallback) |
|---|---|---|
| Effort | ~2 weeks | 2–4 days |
| Room runtime | in-page (novel, but verified pure-JS) | Node (documented, boring) |
| Board authority | stays on the iPad — the Board's home | moves to the Mac while synced |
| Solo/offline story | unchanged; session is additive | iPad must export/import its Board into a foreign room; ownership inverts |
| Dependencies | none beyond the app | the Mac must be present and awake; a second codebase (SharePad or standalone) must ship a copy of the canvas bundle and track protocol v8 across upgrades |
| Version skew | impossible — the Mac loads the exact bundle the iPad serves | real — helper's bundle and iPad's bundle must match |
| Spec posture | consistent with "the whole product is the native app" | re-introduces the coupling #7 scoped out |

The helper is the right *escape hatch* if the spike hits a wall (e.g. an
unfixable WKWebView networking restriction), and its client-side work (the
`useSync` mode of the Canvas) is shared with the recommended path — so building
iPad-as-host first forecloses nothing.

---

## 5. Decision points for Faraz

1. **Host topology:** iPad-as-host (~2 weeks, Board authority stays home) vs
   Mac/SharePad helper (2–4 days, ownership inverts, version skew to manage).
   Recommendation: iPad-as-host; the helper remains the escape hatch.
2. **Session UX:** explicit "Start session" action (recommended — matches the
   permission-free, foreground-only lifecycle) vs always-listening. Hosting
   pins the app foreground and disables the idle timer — acceptable in the
   meeting flow?
3. **Discovery:** QR + `http://<name>.local:<port>` with zero permission prompts
   (recommended) vs advertising `_semcanvas._tcp` via Bonjour — which triggers
   the local-network prompt and plist keys, and only pays off if SharePad later
   auto-discovers sessions.
4. **Guest capability:** full read-write editing for the Mac (recommended for
   "add content") vs `isReadonly` guests — the room supports per-session
   read-only cheaply if a view-only mode is ever wanted.
5. **Licensing posture for the Mac leg:** the Mac loads the bundle over plain
   `http://`, which the SDK permanently treats as a development environment
   (keyless, watermarked). Fine under today's personal/hobby posture; if the app
   ever goes commercial, confirm with tldraw how a LAN-served, non-HTTPS guest
   page should be licensed (the licensing research already flags native/origin
   binding as a talk-to-tldraw item).
6. **Persistence seam:** accept the editor remount at session start/end and the
   shadow-snapshot recovery model (§3), vs pushing for seamless in-place store
   swapping (more engineering, fights the SDK's store model).

---

## Sources

| Source | What it establishes |
|---|---|
| `@tldraw/sync@5.4.2` shipped dist (npm, read in a throwaway install) | `useSync` options incl. `connect` custom transport, `TLPersistentClientSocket`, `users` rename, ping interval, reserved query params |
| `@tldraw/sync-core@5.4.2` shipped dist | `TLSocketRoom` API, `TLSyncStorage`/`InMemorySyncStorage`/`SQLiteSyncStorage`, `WebSocketMinimal` duck type, protocol v8 message set, 256 KB client-side chunking, 60 Hz debounce, tombstone cap, `RoomSnapshot` shape, one-room invariant; complete bare-import set proving pure-JS; `ws` confirmed phantom; `tldraw_product { premium: false }` metadata |
| `LICENSE.md` inside all three installed packages | byte-identical SDK license; no sync-specific terms |
| https://tldraw.dev/docs/sync | demo server is prototyping-only; production = self-host; Cloudflare + Node templates; room-per-document model |
| https://tldraw.dev/pricing | multiplayer synchronization included in the SDK license |
| [docs/research/tldraw-licensing.md](tldraw-licensing.md) (branch `research/tldraw-licensing`) | dev-mode detection (non-HTTPS ⇒ development, keyless, no telemetry), hobby posture, native-license flag |
| https://developer.apple.com/documentation/network/nwprotocolwebsocket (incl. `Options.setClientRequestHandler`) and https://developer.apple.com/documentation/network/nwlistener | Network.framework server-side WebSocket support, listener protocol stack, frame metadata opcodes |
| https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy | listening/accepting requires no local-network permission; all Bonjour operations do; loopback and WKWebView traffic exempt; multicast entitlement not needed for declared service types |
| https://support.apple.com/101903 (with RFC 6762) | macOS resolves `<name>.local` system-wide via mDNS |
| Apple DTS guidance (developer forums, Quinn "The Eskimo!") | listeners die on suspension; close when suspension-eligible, reopen on foreground |
| https://github.com/swhitty/FlyingFox | MIT, maintained, Swift Concurrency, HTTP + WebSocket upgrade on one port, static files; GCDWebServer archived / Swifter dormant / Telegraph slow-cadence (their repos) |
| https://developer.apple.com/documentation/webkit/wkscriptmessagehandler and evaluateJavaScript docs | main-thread delivery, plist-only body types, no binary — why the Bridge is control-plane only |
| `canvas/src/App.tsx`, `canvas/vite.config.ts`, `shell/SemanticCanvas/CanvasHostView.swift`, `canvas/src/bridge.ts` (this repo) | current `persistenceKey`, single-file dev-mode bundle, `loadFileURL` file:// origin, one-way versioned Bridge |

**Explicitly unverified (spike items):** ATS/`NSAllowsLocalNetworking` behavior
for `ws://127.0.0.1` from a file://-loaded WKWebView page; programmatic retrieval
of the device's `.local` hostname for display; FlyingFox throughput with
multi-hundred-KB hydration frames (expected fine, untested).

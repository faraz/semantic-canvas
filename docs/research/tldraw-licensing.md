# tldraw SDK Licensing — Primary-Source Research

**Date:** 2026-09-22
**Scope:** tldraw.dev pages, the license text and license-enforcement source code in github.com/tldraw/tldraw, and official tldraw.dev blog announcements. No third-party sources used. Every claim is cited inline. Where primary sources are silent, this is stated explicitly.

**Context:** Faraz holds a tldraw hobby ("hobbyist") license for semantic-canvas, a personal canvas app. Distribution is personal-first (own iPad, sideload/TestFlight), with a possible future commercial App Store release.

---

## TL;DR

- **Hobby license is free, discretionary, non-commercial only, and keeps the "made with tldraw" watermark.** It is meant for "personal projects and early experiments … ideas that aren't a business yet" (https://tldraw.dev/get-a-license/hobby). No revenue or company-size thresholds are published anywhere in primary sources.
- **The license text itself never defines "commercial use."** The default SDK license (LICENSE.md) only permits *development* use; any *production* use requires a separately issued trial, commercial, or hobby license key (https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md; https://tldraw.dev/community/license). The hobby/commercial boundary is enforced at issuance (tldraw reviews each hobby request), not by published criteria.
- **A commercial App Store release requires a commercial license: annual, "value-based pricing," talk-to-sales — no public dollar amounts exist** (https://tldraw.dev/pricing; https://tldraw.dev/sdk-features/license-key). A 100-day free trial and startup discounts exist.
- **License keys are client-side, offline, public, and encode allowed hosts + license type + expiry.** Annual keys expire with a 30-day grace period, after which **the SDK stops rendering the editor — including in already-shipped app versions** (https://tldraw.dev/sdk-features/license-key). This is the single biggest risk for a native App Store binary.
- **Native apps are supported in practice:** the FAQ officially blesses embedding the SDK in a WebView inside a native app (https://tldraw.dev/faq), and the SDK source contains a `NATIVE_LICENSE` flag that matches license "hosts" as regexes against the full URL (e.g. custom `app-bundle:` protocols) (LicenseManager.ts in the repo). But **no public docs page describes native licensing — it has to be arranged with tldraw directly.**
- **Telemetry:** hobby, trial, and unlicensed-production deployments ping tldraw's CDN with license ID, license type, SDK version, environment, and the full page URL; commercial licenses send nothing; nothing is ever sent from development environments (https://tldraw.dev/sdk-features/license-key; LicenseManager.ts). Note: one tldraw.dev page contradicts another on whether hobby pings (see §4).
- **Termination is automatic on breach or on filing an IP claim against tldraw *or any tldraw user*; Delaware law governs; redistribution is allowed only as part of another application, never standalone** (https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md).

---

## 1. What exactly does the hobby (hobbyist) tier cover?

**Price: free ($0).**
- Pricing page: "Just building for fun? Get a free hobby license." (https://tldraw.dev/pricing)
- FAQ ("Is the tldraw SDK free to use?"): "In development, yes. In production, mostly no. To use the SDK in production you will need to have a free trial license, a commercial license or a **free hobby license**." (https://tldraw.dev/faq)

**Intended scope (exact text):**
> "The hobby license is for personal projects and early experiments; student work, research, side projects, prototypes, and ideas that aren't a business yet." (https://tldraw.dev/get-a-license/hobby)

**Discretionary and reviewed per-project:**
> "For non-commercial projects, we also provide a discretionary hobby license. You can request a hobby license by completing this form. When you submit the form, our team may issue a license or reach out to learn about your project." (https://tldraw.dev/community/license)
> "They're discretionary: we review each request." (https://tldraw.dev/sdk-features/license-key)

**Watermark is NOT removed — it is a condition:**
> "When using the tldraw SDK under a hobby license, the 'made with tldraw' watermark must be shown on the canvas." (https://tldraw.dev/community/license)
> "Projects using a hobby license key display a 'made with tldraw' watermark on the canvas." (https://tldraw.dev/get-a-license/hobby)
The license-types table on https://tldraw.dev/sdk-features/license-key lists Hobby as: Watermark **Yes**, Duration **"Varies"**, Purpose "Non-commercial projects."

**What it unlocks:** production deployment. Under the default license, production use is prohibited entirely; a hobby key is one of the three things that permits it (https://tldraw.dev/community/license).

**Distribution of an app to others:** Not restricted anywhere in primary sources beyond (a) the app must be non-commercial, and (b) the SDK may only be redistributed "as part of another application" with the license text included (https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md, Conditions). No user-count, download-count, or audience limits are published. **Not found in primary sources:** any explicit statement about whether a free personal app distributed on the App Store qualifies as hobby use. The hobby application form asks for a "Project website" and "Project domain" (https://tldraw.dev/get-a-license/hobby), which shows the process assumes web deployment; native distribution under hobby is simply not addressed.

**Revenue/size thresholds:** **Not found in primary sources.** No dollar-revenue, funding, or team-size threshold appears on tldraw.dev or in LICENSE.md. The only line drawn is "ideas that aren't a business yet" (https://tldraw.dev/get-a-license/hobby).

**Duration/expiry of hobby keys:** Listed only as "Varies" (https://tldraw.dev/sdk-features/license-key). The expiry date of Faraz's specific key is encoded in the key itself (every key encodes an expiration date — same page). **The published terms of the hobby license agreement itself are not found in primary sources** — LICENSE.md only says "Alternative licenses are available from tldraw for commercial and non-commercial use" (https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md).

---

## 2. Where is the hobbyist/commercial boundary? Exact license-text definitions

**Key finding: the license text contains no definition of "commercial use," "non-commercial," or "hobby" at all.** The default license's only axis is development vs. production. Verbatim from LICENSE.md (https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md):

> "**'Production Environment'** means any production deployment of the Software that operates on servers, cloud platforms, web applications, or where the software is used to provide functionality to end users, customers, or the public. Production Environment excludes internal development."
>
> "**'Development Environment'** means any internal hosting or deployment of the Software for development, testing, or staging purposes, operated by your organization and not accessible to end users, customers, or the public."
>
> Conditions: "In exchange for these permissions, you agree: — Not to use the Software in Production Environments. …"
>
> Commercial license section: "In the case that tldraw makes the Software available to you under the terms of a separate commercial agreement, you are permitted to use the Software in Production Environments for the specified period beginning from the date of the agreement's License Key issuance."

So the structure is: **default license = development only; production requires a separately granted license (trial / commercial / hobby)**, and the hobby-vs-commercial distinction lives in tldraw's discretionary issuance process, not in published legal text. The docs state the boundary operationally:

> "Commercial licenses remove the watermark and **are required for any commercial use in production**." (https://tldraw.dev/sdk-features/license-key)
> "a hobby license for non-commercial projects" (https://tldraw.dev/community/license)

**Not found in primary sources:** any current, binding definition of what makes a project "commercial." The only definitional guidance ever published was in the Dec 2023 blog post — "Examples of non-commercial use include using tldraw in a hobby project, a student project, or to contribute bug fixes" and "I'm using tldraw in a commercial product but we're pre-funding / pre-revenue / testing it out. Do I still need a license? Yes." — but that post is explicitly stamped "**This article is out of date. tldraw has moved to a new licensing model.**" (https://tldraw.dev/blog/license-update-for-the-tldraw-sdk), so it cannot be relied on. The current model was announced with SDK 4.0:

> "Under the terms of the new license, the tldraw SDK is only permitted to be used in development environments. To use the SDK in production environments, you must have either a trial license, a commercial license, or a hobby license. This policy is enforced through the license keys that come with each license. The SDK will only work in production when it has a valid license key." (https://tldraw.dev/blog/tldraw-sdk-4-0, Apr 9 2025)

Practical implication: **charging for the app (paid App Store listing, IAP, subscriptions) or operating it as a business would take it out of "ideas that aren't a business yet" and require a commercial license.** Where exactly a free app with, say, a tip jar falls is not answered by any primary source — it would be tldraw's discretionary call.

---

## 3. What would a commercial App Store release require and cost?

**Required tier:** a commercial license. "Commercial licenses remove the watermark and are required for any commercial use in production." (https://tldraw.dev/sdk-features/license-key)

**Pricing:** No dollar amounts are published anywhere on tldraw.dev.
- "The SDK License — Get full access to the tldraw SDK for your product. Multiplayer sync included. Commercial license for production use / Full SDK feature access / **Value-based pricing** / Host anywhere / Support available / 100-day free trial … No credit card required." (https://tldraw.dev/pricing)
- Process: "You can request a commercial license by completing this form. When you submit the form, our sales team will be in touch to learn about your requirements and discuss pricing. Startup pricing may be available for small teams." (https://tldraw.dev/community/license)
- "Early-stage startup? Discounted pricing is available for new companies. Apply for startup pricing." (https://tldraw.dev/pricing)
- **Per-seat vs. flat: not found in primary sources.** Only "value-based pricing" is stated. (https://tldraw.dev/pricing)

**Term:** Commercial licenses are **annual** ("Commercial — Watermark: No — Duration: Annual", https://tldraw.dev/sdk-features/license-key). Perpetual licenses existed historically but "we no longer sell these licenses (except in exceptional cases)" (same page).

**Trial path:** free 100-day trial, key emailed immediately, "one trial per company or project" / "one trial license per commercial unit" (https://tldraw.dev/sdk-features/license-key; https://tldraw.dev/community/license). Trial keys stop working immediately at expiry with no grace period (https://tldraw.dev/sdk-features/license-key).

**Multiple domains:** one license covers them — "Do I need separate licenses for different domains? Nope! We map all relevant domains you plan to host the SDK on to a single license." (https://tldraw.dev/faq)

**Premium modules** are "in development" with no pricing yet (https://tldraw.dev/pricing). The license code already contains gated feature flags for `collaboration` and `commenting` (packages/editor/src/lib/license/LicenseManager.ts, https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/license/LicenseManager.ts), so expect some features to become license-flag-gated.

---

## 4. Surprising / notable terms

### Redistribution restrictions (LICENSE.md, verbatim)
> "Not to distribute the Software or modifications of the Software as a standalone product, but only as part of another application."
> "To include a verbatim copy of this License in any distribution of the Software."
> "Not to remove any copyright or other notices from the Software."
> "Not to make the Software available under a license that supersedes or negates the effect of this License."
> "Not to disable, change, or interfere with the Software's License Key enforcement."
(https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md)

Shipping semantic-canvas with tldraw bundled inside is the permitted pattern ("Bundle the Software with your own projects" is an enumerated permission), but the app bundle must carry the license text and keep notices intact.

### Telemetry / phone-home (docs + source code)
- License text authorizes it: "The Software includes technical measures to verify License Key validity, detect deployment environments, enforce usage restrictions based on license type, and ensure proper watermark display. **The Software may collect and transmit usage data to tldraw for license compliance purposes.**" (https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md, "Technical enforcement")
- Per-license behavior (https://tldraw.dev/sdk-features/license-key, "Data collection" table): Commercial → **none**; Hobby → "License ID, license type, SDK version, and page URL"; Trial → same; Unlicensed → "SDK version and page URL (production only)". "Nothing is sent from development environments."
- Mechanics (repo source, packages/editor/src/lib/license/LicenseManager.ts): the ping is a `fetch` of `https://cdn.tldraw.com/.../watermarks/watermark-track.svg` with query params `version`, `license_type`, `license_id`, `sku` (evaluation/annual/perpetual), `url` (full `window.location.href`), and `environment` (NODE_ENV). `getTrackType()` returns `null` (no ping) for commercial-no-watermark licenses and in development; it pings for unlicensed-production, evaluation, and watermark-showing (hobby) states. Key signature verification itself is fully local ("The SDK decodes and verifies the key's signature locally without making network requests to a license server," https://tldraw.dev/sdk-features/license-key).
- **Discrepancy between two tldraw.dev pages:** https://tldraw.dev/community/license says "When using the tldraw SDK under a commercial **or hobby** license, no information is sent to tldraw," while https://tldraw.dev/sdk-features/license-key and the shipped code say hobby *does* ping. The code and the license-key page agree with each other; treat the community page as stale on this point.
- Separate from license pings, the FAQ notes anonymous usage info is also collected "from requests for our static assets (such as our default fonts, icons and watermark)" unless you self-host static assets (https://tldraw.dev/faq, "Does the SDK collect diagnostics?"). Note the same answer says self-hosting all static assets stops external requests "on a normal license" — the hobby watermark ping is called out as its own collection channel.

### Expiry and version pinning — critical for shipped apps
(all from https://tldraw.dev/sdk-features/license-key)
- "Each key encodes the allowed hosts…, the license type…, and the expiration date."
- **Annual/perpetual grace:** "Annual and perpetual licenses have a 30-day grace period after expiration. During this period, the SDK continues working but logs a message to the console. … **After the grace period the SDK stops rendering the editor.**"
- **Trial:** "Evaluation (trial) licenses have no grace period. They stop working immediately on expiration."
- **Perpetual = version pinning:** "Perpetual licenses don't have a time-based expiration. Instead, they're tied to a version: they work with any patch release indefinitely, but major or minor versions released after the license expiration date (plus the 30-day grace period) require renewal." (No longer sold except in exceptional cases.)
- **Unlicensed production:** "the SDK logs errors to the console and, after five seconds, stops rendering the editor."
- **Consequence for a native binary:** because keys are validated purely client-side against the device clock and are baked into the shipped bundle, an annual key expiring means **existing installed app versions lose the editor 30 days later**, even offline, unless the app can fetch an updated key remotely or a perpetual/native arrangement is negotiated. Hobby duration is unspecified ("Varies") — check the expiry encoded in the actual key.

### License key mechanics in shipped apps
(https://tldraw.dev/sdk-features/license-key)
- Keys are public and safe to embed in frontend code; passed via `licenseKey` prop on `Tldraw`/`TldrawEditor`/`TldrawImage`, or auto-detected from env vars (`TLDRAW_LICENSE_KEY`, `NEXT_PUBLIC_TLDRAW_LICENSE_KEY`, `VITE_TLDRAW_LICENSE_KEY`, etc., checked in both `process.env` and `import.meta.env`).
- Works offline; validated on the client via signature check (ECDSA public key is hardcoded in LicenseManager.ts).
- **Domain allowlist:** "License keys specify which domains they work on. … An exact host like example.com matches example.com and www.example.com. A wildcard like *.example.com matches any subdomain. Some enterprise licenses allow * for any domain. If you deploy to a domain not covered by your license, the SDK treats it as unlicensed."
- **Development detection:** "The SDK treats the environment as development if any of these are true: the protocol is not HTTPS, the hostname is localhost or a loopback address (127.x.x.x, ::1), or NODE_ENV is not 'production'." In development no key is needed. Keys are only verified when `crypto.subtle` is available.

### Watermark requirements
- Condition of the hobby license: watermark "must be shown on the canvas" (https://tldraw.dev/community/license).
- The license text's technical-enforcement clause covers "ensur[ing] proper watermark display" (https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md).
- The shipped watermark component embeds this notice (packages/editor/src/lib/license/Watermark.tsx, https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/license/Watermark.tsx): "The tldraw watermark is part of tldraw's license. It is shown for unlicensed or 'licensed-with-watermark' users. **By using this library, you agree to preserve the watermark's behavior, keeping it visible, unobscured, and available to user-interaction.**" Hiding or covering it would also violate the "not to disable, change, or interfere with the Software's License Key enforcement" condition in LICENSE.md.

### Termination / revocation
> "Your license to use the Software will terminate automatically if you breach any terms of this License or initiate a copyright, trade secret, or patent claim against tldraw, any of its affiliates, **or any user of the Software (including as modified by you)**." (https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md)

- Note the breadth: suing *any tldraw user* over copyright/trade-secret/patent terminates your license.
- **No unilateral at-will revocation clause was found in the license text.** The discretion sits at issuance (hobby licenses are "discretionary") and at renewal (annual terms). Trademark permissions, by contrast, are explicitly revocable at will: "tldraw reserves the right in its sole discretion to (i) terminate, revoke, modify, or otherwise change permission to use the trademarks at any time" (https://tldraw.dev/legal/trademark-guidelines).

### Trademark policy (binding via the license's condition "To comply with tldraw's trademark policy")
(https://tldraw.dev/legal/trademark-guidelines)
- "You may not use or register our marks or variations of them as part of your trademark, business, product, service, app, domain name, social media account or business indicator."
- "Do not use the 'tl' prefix in a way that could mistakenly imply that your product is related to tldraw. For example, an analytics product that uses tldraw should not use the name 'tlanalytics'."
- You *may* truthfully say your product is built with / integrates tldraw. ("semantic-canvas" as a name is fine; don't brand it with tldraw marks or a tl- prefix.)

### Other legal terms (LICENSE.md)
- Governing law: "This License is governed by the laws of Delaware, and the parties consent to exclusive jurisdiction in Delaware courts. The parties waive all defenses of lack of personal jurisdiction and forum non-conveniens."
- Warranty/liability disclaimers must be passed downstream: "You must pass this disclaimer on whenever you distribute the Software or derivative works" (and likewise for the liability limitation).
- "This License may be assigned by tldraw without your prior consent."
- **No "no dev-tools" / "no competing product" clause exists in the license text** — nothing like a field-of-use restriction against building whiteboard products was found in primary sources. (The only adjacent restriction is the trademark policy's confusion rules and the no-standalone-redistribution condition.)
- One trial per "commercial unit"/"company or project"; the SDK license page linked from docs at https://tldraw.dev/legal/tldraw-license **returned HTTP 404 on 2026-09-22** — the canonical, retrievable license text is the repo's LICENSE.md.

---

## 5. The iPad / native-app scenario

**Official position that native embedding is supported (FAQ, verbatim):**
> "Does the SDK work on mobile? Yes. The SDK works within mobile browsers but **you can also embed the SDK in a WebView to use it within a native app**. Multi-touch controls and stylus inputs are fully supported and the UI adapts to vertical screen sizes." (https://tldraw.dev/faq)

**But the public licensing docs only describe domain-based validation.** The license-key page's "Domain validation" section speaks exclusively of hostnames and domains (https://tldraw.dev/sdk-features/license-key), and the hobby application form requires a "Project domain" (https://tldraw.dev/get-a-license/hobby). **No tldraw.dev docs page describing how licensing works for apps not served from a domain was found in primary sources.**

**The SDK source code, however, shows native licensing exists as a first-class mechanism** (packages/editor/src/lib/license/LicenseManager.ts, https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/license/LicenseManager.ts):
- A dedicated flag: `// Native means the license is for native apps which switches on special-case logic. NATIVE_LICENSE: 1 << 5`.
- For native licenses, each entry in the key's `hosts` list is treated as a **regex matched against the full `window.location.href`** rather than a hostname: `// Native license support — In this case, 'normalizedHost' is actually a protocol, e.g. 'app-bundle:' … return new RegExp(normalizedHostOrUrlRegex).test(window.location.href)`. So a native key can be bound to a custom WebView scheme/URL pattern instead of a web domain — the moral equivalent of binding to an app bundle.
- Desktop-shell awareness: `// Tauri uses 'tauri://localhost' on macOS and Linux and 'http://tauri.localhost' on Windows` — hostnames ending in `.localhost` are treated as development only when `NODE_ENV !== 'production'`.
- VS Code webviews are matched by `extensionId` query param when `window.location.protocol === 'vscode-webview:'`.

**What this means for semantic-canvas on iPad:**
- **Personal sideload/TestFlight builds today:** a development build (NODE_ENV not 'production', or served over plain http/localhost in the WebView) runs without any key at all — "In development environments, the SDK works without a license key" (https://tldraw.dev/sdk-features/license-key) — and sends no telemetry. Strictly, though, LICENSE.md defines a Development Environment as "not accessible to end users" and "for development, testing, or staging purposes"; using the app as a daily driver on a personal iPad sits in a gray zone the primary sources don't address. The hobby key is the clean answer: it exists precisely to permit production use of a non-commercial personal project (https://tldraw.dev/community/license), with the watermark kept visible.
- **A production (NODE_ENV=production) native build needs a key whose `hosts` match whatever origin the WKWebView serves** (e.g. a custom scheme or local server origin). Whether tldraw issues hobby keys with native-style host bindings is **not found in primary sources** — the hobby form only asks for a web domain. Faraz should ask tldraw (sales@tldraw.com per the SDK's own error messages) to bind his existing hobby key appropriately, or confirm the WebView origin matches the key's allowed hosts.
- **Offline operation is fine:** "License keys are validated on the client. You can use them offline." (https://tldraw.dev/community/license); the FAQ confirms the SDK "uses an offline store by default" (https://tldraw.dev/faq).
- **A future commercial App Store release** would need a commercial (annual) license negotiated with sales; given the code's `NATIVE_LICENSE` support, native binding is technically available even though it is unadvertised. Budget for the annual-expiry problem (§4): shipped binaries with a baked-in expired key stop rendering the editor 30 days after expiry, so plan either a remotely-fetchable key, timely renewals + app updates, or negotiate perpetual/native terms explicitly.

---

## Sources

All fetched 2026-09-22.

| URL | What it establishes |
|---|---|
| https://raw.githubusercontent.com/tldraw/tldraw/main/LICENSE.md | Canonical license text: dev-only default, Production/Development definitions, conditions, termination, technical enforcement, Delaware law. |
| https://github.com/tldraw/tldraw/blob/main/LICENSE.md | Same license text in repo context (canonical location). |
| https://tldraw.dev/legal/tldraw-license | Linked from docs as the license page but **returned HTTP 404** on fetch date. |
| https://tldraw.dev/community/license | License overview: three license types, hobby watermark requirement, key required in production, client-side/offline keys, data-collection summary (partly stale re: hobby pings), source-available-not-open-source. |
| https://tldraw.dev/sdk-features/license-key | License key mechanics: client-side signature validation, env vars, license-type table (hobby = watermark, "Varies" duration), dev-mode detection, domain validation/wildcards, 30-day grace period, perpetual version pinning, per-type data collection, troubleshooting/expiry behavior. |
| https://tldraw.dev/pricing | Pricing page: value-based commercial pricing (no dollar amounts), 100-day trial, startup discount, free hobby license, premium modules "in development". |
| https://tldraw.dev/faq | FAQ: "free to use?" answer, commercial apps allowed, diagnostics/static-asset collection, single license for multiple domains, **WebView-in-native-app support**, offline store default, source-available. |
| https://tldraw.dev/get-a-license/hobby | Hobby scope wording ("aren't a business yet"), watermark statement, form fields (Project website/domain). |
| https://tldraw.dev/legal/trademark-guidelines | Trademark policy: no marks in app/product names, no "tl" prefix, revocable at will, acceptable truthful uses. |
| https://tldraw.dev/blog/tldraw-sdk-4-0 | Official announcement (Apr 9, 2025) of the current model: dev-only default license enforced via license keys; trial/commercial/hobby for production. |
| https://tldraw.dev/blog/license-update-for-the-tldraw-sdk | Dec 2023 announcement of the older dual-license model; page itself is stamped "out of date" — used only to show the old definitions no longer apply. |
| https://tldraw.dev/blog | Blog index used to locate the licensing announcements. |
| https://tldraw.dev/installation | Installation docs: `licenseKey` prop, static-assets self-hosting. |
| https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/license/LicenseManager.ts (raw: https://raw.githubusercontent.com/tldraw/tldraw/main/packages/editor/src/lib/license/LicenseManager.ts) | Enforcement source: `NATIVE_LICENSE` flag and regex-vs-full-URL host matching, Tauri/VS Code special cases, loopback/dev detection, grace-period constant, telemetry ping contents (`watermark-track.svg` with license_id/sku/url/env), commercial = no ping. |
| https://github.com/tldraw/tldraw/blob/main/packages/editor/src/lib/license/Watermark.tsx (raw: https://raw.githubusercontent.com/tldraw/tldraw/main/packages/editor/src/lib/license/Watermark.tsx) | Watermark component: embedded notice requiring the watermark be kept "visible, unobscured, and available to user-interaction". |

**Explicitly not found in primary sources:** a legal-text definition of "commercial use"; revenue/size thresholds for hobby eligibility; hobby-license agreement terms as a document; commercial pricing amounts or per-seat/flat structure; any docs page on licensing apps not served from a domain (native licensing is evidenced only in source code); whether an App Store-distributed free personal app qualifies for hobby.

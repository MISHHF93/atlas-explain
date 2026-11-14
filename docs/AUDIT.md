# Production launch audit

Date: 2026-11-13 · Commit audited: `8026eec` (main) · Live site: https://atlas-explain.web.app

This audit comes before any changes. It lists everything a paying member of the public should not see, and every UX, account, billing, security and launch gap between today's build and a full production launch. Each item names the PR in the shipping order that fixes it:

| PR | Scope |
|----|-------|
| 2 | Copy and UX cleanup |
| 3 | Design system |
| 4 | Onboarding |
| 5 | Auth and account |
| 6 | Monetization (waits for pricing approval) |
| 7 | Production hardening |
| 8 | Store and SEO |

Severity: **P0** blocks a public launch. **P1** must be fixed before launch. **P2** is polish.

## How it was audited

- Every public route and app route was loaded from the live site in headless Chrome. Desktop shots were taken at 1440 px and mobile shots at a true 390 px with device emulation. None of the 12 routes scrolls sideways at 390 px. Popup states were rendered from `extension/dist` at 380 × 600, and the side panel at 420 × 900.
- **Signed-in states were audited from code, not on screen.** Headless Chrome cannot complete Google or email-link sign-in without a real account. The signed-in account sheet, saved history and plan view were read in `src/wallet/account.ts`, `src/web/app.ts` and `src/platform/web/*`. They will be screenshotted by hand in PR 5.
- Strings were found with a full grep over `src/`, `extension/src/` and every HTML page, then each hit was checked in context.
- Baseline: `npm run release:check` passes all 10 steps on `main`. (It crashes under Git Bash on this machine because of the shell environment. It runs clean from PowerShell. This is a tooling note, not a product bug.)

---

## 1. Developer-facing strings and elements

### 1a. "Run ATLAS on your computer" / localhost wording (P0)

Every public visitor sees these. ATLAS on localhost is the owner's private desk, not something the public has.

| File:line | What the user sees |
|---|---|
| `src/core/popup-copy.ts:21` | `ATLAS_DESK_URL = "http://localhost:3000/markets"`. Linked from the "Open the ATLAS desk" menu item in both the app and the popup. |
| `src/core/popup-copy.ts:27-30` | Signal card: "Connect ATLAS … Open the ATLAS Markets desk in this tab". |
| `src/core/popup-copy.ts:62-73` | Header chip: "ATLAS local", "Hosted app" ("This web app never calls localhost…"), "Not connected" ("Start ATLAS on this computer (localhost:3000)"). The popup shows **Not connected** to every user by default. |
| `src/core/assets.ts:369-373` | "Connect ATLAS (run it on this computer)", "…ATLAS on this computer at localhost:3000…" |
| `src/core/assets.ts:202, 250, 354, 390, 397` | "No data on this computer", "ATLAS is not answering at localhost:3000.", "This ATLAS build has no Explain asset route yet. Update ATLAS." |
| `src/core/atlas-mcp.ts:56, 72` | The same localhost errors. |
| `src/connectors/atlas-local.ts:10, 12` | "This web app never calls localhost…", "ATLAS is not answering at localhost:3000." |
| `src/core/kraken.ts:26-28`, `src/core/coingecko.ts:24-26` | "Paper predictions come from ATLAS on your computer… Connect ATLAS to see them." |
| `src/core/digest.ts:94, 112, 116` | "Open ATLAS on this computer to load today's digest." |
| `src/core/market-digest.ts:65, 68` | "Connect ATLAS on this computer to see today's grounded digest." |
| `src/core/market-digest.ts:72-75` | A "Not connected yet" list: "ATLAS does not filter news by symbol yet", "has no read-only route yet". These are internal roadmap notes. |
| `src/web/app.ts:113` | Menu: "Open the ATLAS desk" opens localhost. |
| `src/web/app.ts:319` | "Open ATLAS on this computer to load today's digest." |
| `src/web/app.ts:363` | "The live light is read by the Chrome extension on the ATLAS desk." |
| `src/wallet/assets.ts:132, 230` | "ATLAS has no assets with data on this computer yet." Steps: "Start ATLAS on this computer (it serves localhost:3000)." |
| `extension/src/popup.ts:102` | Menu: "Open the ATLAS desk". |
| `extension/src/popup.ts:152` | The same digest line. |
| `extension/src/popup.ts:227` | "Tip: open http://localhost:3000/markets in this tab, then reopen the popup." |
| `src/core/extension-prompt.ts:15` | The permission note explains `http://localhost:3000` to every user, in Settings and in Privacy. |
| `src/wallet/legal.ts:23` | The privacy summary explains the localhost permission. |
| `src/wallet/legal.ts:36` | Install step: "open the ATLAS Markets desk and click the icon to read the signal light". |
| `how-it-works.html:42` | "Today's digest and ATLAS leans come from ATLAS running on your own computer… show 'Connect ATLAS'". |

**Fix (PR 2):** detect ATLAS once (`canReachLocalAtlas` / `probeAtlasLocal` already exist). When it is absent, which is the case for every public user, hide the Signal tab, the desk menu item, the leans, the ATLAS digest card and the "Connect" cards. Keep one optional line in How it's built for the owner. In PR 7, move the localhost host permission to `optional_host_permissions`.

### 1b. Build, config and SDK internals shown in the UI (P0)

| File:line | What the user sees |
|---|---|
| `src/web/app.ts:456, 558, 564, 1265-1268` | Account → AI: "Loading Remote Config…", then "Inference preference: prefer_on_device. Cloud model: gemini-3.5-flash-lite." or "Remote Config could not be read." On the live site the line stayed on "Loading Remote Config…". |
| `src/web/app.ts:635-658` | `renderSetup()`: if the config is missing, users see "Create a Firebase project… Copy the web config into .env.local… Run npm run dev." |
| `src/web/app.ts:741` | "This build has no Firebase project…" |
| `src/web/app.ts:1317-1319` | "The raw model text is in the browser console." |
| `src/web/app.ts:1322` | "Use desktop Chrome 139 or newer with the Prompt API flag on". Users should not be asked to flip Chrome flags. |
| `src/web/app.ts:234, 957-975` | A "Preview prompt" button prints the raw prompt and the mode enum (`prefer_on_device`). |
| `src/web/app.ts:330` | "Edit the move card (JSON)": a raw JSON editor in the main user flow. |
| `src/core/inference-path.ts:88` | "The inference mode comes from Remote Config". |
| `src/wallet/legal.ts:24`, `privacy.html:35` | "chosen in Remote Config". |
| `src/core/timeouts.ts:29, 34` | "(App Check)" in error text. |
| `src/wallet/cards.ts:190`, `src/web/app.ts:785, 1258` | The source chip and notes show the raw model id ("Cloud · gemini-3.5-flash-lite"). |
| `src/web/app.ts:1349` | `DEMO_RUN.cloudModel = "gemini-2.5-flash-lite"`. A stale model id in a preview fixture. |
| `src/wallet/digest.ts:20, 33` | "Friday, … - America/Toronto" is shown to every visitor, wherever they are. |
| `extension/src/popup.ts:279` | The Settings badge reads "Preview" outside Chrome. |

**Fix (PR 2):** user copy says "On this device" or "Cloud", with no SDK, config or model names. The model name moves to How it's built. Setup steps go to the README only. Production shows "Explanations are unavailable right now" with a retry.

### 1c. Fixture, placeholder, preview and demo code in the shipped bundle (P0: hard rule "no fixture data")

| File:line | Problem |
|---|---|
| `src/wallet/box-preview.json` (94 kB, emitted as `assets/box-preview-*.js`) | Captured Kraken and IEX bars from a build machine, loaded by `?assets=box` in the web app (`src/web/app.ts:391`) and the popup (`extension/src/popup.ts:672`). The label says "Box preview: real Kraken and IEX bars run through the ATLAS route on the build box". |
| `src/web/app.ts:1189-1202, 1326-1351` | The `?demo=run\|loading\|error`, `?tab=`, `?sheet=`, `?menu=` and `?onboarding=` preview switches, plus the hard-coded `DEMO_RUN` answer. |
| `extension/src/popup.ts:549-563, 690-709` | `?demo=answer\|loading\|error\|offline\|limit` plus a forced green or red light ("13 of 200 labelled outcomes"). |
| `src/core/samples.ts:105, 182` | The NVDA −6% card: "PLACEHOLDER… Every figure is a placeholder." It is a selectable sample in Explain → "Explain a market move". |
| `src/core/billing.ts:128` | `PRO_PRICE_ID = "price_pro_placeholder"`. |
| `public/demo/trading-terms.html:13, 16, 21` | "Static demo page", "Chart placeholder". This could be the onboarding practice page, but only after it is rewritten. |

**Fix (PR 2):** delete `box-preview.json` and every preview switch from production builds. Store screenshots get a dev-only route behind `import.meta.env.DEV`. Remove the placeholder sample. Rewrite the demo page as the "Try it here" practice page for onboarding (PR 4).

### 1d. Hackathon scaffolding and "beta / draft / coming soon" in the user flow (P1)

| File:line | Text |
|---|---|
| `index.html:96`, `how-it-works.html:71`, `support.html:50`, `privacy.html:50`, `terms.html:31`, `404.html:29` | The footer on every page: "Free during the beta. Built for #BuildHybridAI with Firebase AI Logic and Gemini." |
| `index.html:7` | The meta description names "Gemini Nano… Firebase AI Logic". |
| `index.html:22, 48` | "Chrome extension · On-device Gemini Nano", "Built for #BuildHybridAI with Firebase AI Logic". |
| `index.html:29`, `how-it-works.html:48`, `support.html:37` | "Chrome Web Store listing coming soon", "Soon". |
| `index.html:83`, `support.html:32, 42`, `how-it-works.html:37` | "Firebase AI Logic with App Check", "Chrome 139". |
| `privacy.html:6, 21-24, 33, 35, 38, 40, 42` | "Privacy (draft)", a "Draft · not final" badge, "[TODO legal name]", "[TODO privacy email]", "[TODO date]". |
| `terms.html:6, 21-24, 25` | The same, plus "[TODO: refund and cancellation policy; GST/HST.]" and "[TODO: liability cap.]". |
| `src/wallet/legal.ts:6, 18` | "DRAFT for review, not final… Full draft: docs/legal/TERMS_DRAFT.md." |
| `src/core/popup-copy.ts:93` | "Free during beta. Billing is built in and switched off." |
| `src/core/billing.ts:122, 219, 266, 277` | "Pro — coming after beta", "Billing is off. During beta every Pro entitlement is free", "Pro is coming after beta." |
| `extension/src/popup.ts:430, 703` | "Highlight-to-explain is a Pro entitlement. Pro is coming after beta." |
| `404.html:22` | "It may have moved when the site and the app were split." |
| `src/core/learn.ts:17`, `src/core/glossary.ts:14-44` | The "How ATLAS researches" learning group (shadow, signal15, live_lock, drop_study). This is internal research vocabulary. |

**Fix:** the hybrid AI stays visible in the product as an "On this device / Cloud" chip on every answer and one plain line on the home page. All technical and hackathon detail moves to one discreet **How it's built** page, linked from the footer, for judges (PR 2). Legal pages get production text (PR 7). The ATLAS research glossary group is hidden unless ATLAS is detected (PR 2).

### 1e. Console output (P2)

`src/core/monitor.ts:73-74` (the console sink is always on: `src/main.ts:8`, `extension/src/popup.ts:39`), `src/wallet/error-boundary.ts:52, 65` and `src/web/app.ts:1318` (the raw model text is logged). **Fix (PR 7):** turn the console sink on only in dev builds and send reports to the scrubbed monitoring sink.

---

## 2. UX problems

### Web app (`/app`)

1. **Today is mostly dead ends (P0).** The order is: live crypto snapshot → "Connect ATLAS on this computer" digest card → "Today's brief · Not ready yet" → "Paper signal light: Connect ATLAS" (grey) → "Next" rows (`src/web/app.ts:371-381`). For a public visitor, three of the five blocks say something is missing. **PR 2:** Today becomes the live snapshot, a one-line market summary with source and time, "Explain a term" and the extension prompt. The ATLAS blocks appear only when ATLAS is present.
2. **Explain has two products on one screen (P1).** The text composer sits on top. Under it, "Explain a market move" opens samples, a raw JSON editor, private notes, a watchlist, Preview prompt and a second, Firestore-backed "Recent explanations" list, beside the local "History" (`src/web/app.ts:323-356`). **PR 2:** keep one composer and one history. The move-card flow only opens from a deep link (ATLAS desk or asset page) and shows a read-only card with no JSON.
3. **Onboarding teaches the wrong things (P1).** It has four slides (`src/wallet/cards.ts:401-420`). One explains a light that is always grey. There is no "try it now" step, no install step and no pin step, so nothing is aimed at a first answer within 30 seconds. **PR 4.**
4. **Asset detail leads with a feature the user cannot have (P1).** It shows "PAPER LEAN · ATLAS NOT CONNECTED", "Hit rate —", "Sample —", "Explain the light in depth" (`src/wallet/assets.ts:269-330`). **PR 2:** hide the lean card when no lean exists, and keep only a single line saying predictions are withheld.
5. **Window mismatch on asset detail (P1).** BTC showed "+0.19% since 00:00 UTC" next to a red 48-hour sparkline. Both are true, but they read as a contradiction. **PR 2:** label the chart window clearly ("Last 48 hours"), or match the windows.
6. **The Account tab has no sign-in, export or delete (P0).** Signed out, Account shows the plan, theme, an AI line about Remote Config, legal links and About (`src/web/app.ts:461-482`). Sign-in lives only in the header icon. There is no data export, no account deletion and no billing section. **PR 5.**
7. **The plan card repeats itself (P2).** "Free during beta" appears up to three times in the popup's Settings, and a five-row entitlement table is shown while everything is free. **PR 2/6.**
8. **The email input is styled differently (P2).** It uses a light grey field, not the dark input token (`src/wallet/account.ts:65`). **PR 3.**
9. **Prompt for email (P2).** Finishing an email link on another device uses `window.prompt` (`src/web/app.ts:591`). **PR 5:** use an in-page field.
10. **The "Checking this browser" engine label can stick (P1).** `readEngineState` awaits `LanguageModel.availability()` with no deadline (`src/core/hybrid-engine.ts:46-55`). It stayed on "Checking" after 9 s in headless Chrome. **PR 7:** add a 3 s deadline that falls back to "cloud".
11. **The 404 sheet over Today (P2)** for unknown `/app/*` paths is fine, but its copy should match the site's 404 page. **PR 2.**

### Extension popup and side panel

12. **The header says "Not connected" to everyone (P0)** (`src/core/popup-copy.ts:73`). **PR 2:** show the engine state ("On this device" / "Cloud") or nothing.
13. **The Signal tab is a dead end (P0)** for anyone without ATLAS: "Connect ATLAS" plus a localhost tip. **PR 2:** hide the tab when ATLAS is absent. That leaves 4 tabs: Explain, Assets, Learn, Settings.
14. **The free plan blocks the core feature (P0).** `freeEntitlements()` sets `extensionHighlightToExplain: false` (`src/core/billing.ts:143`), so the day billing goes live, free users lose highlight-to-explain, which is what the store listing promises. **PR 6:** core features are free, and the cloud quota is the paid lever (see PRICING.md).
15. **The limit card contradicts itself (P1).** The title is "Free during beta" while the body says "free cloud explanations are used up", and it shows the disclaimer twice. **PR 2/6.**
16. **The "Today's digest" row shows "Today"** in the popup while the web app says "Not ready yet" for the same visitor. **PR 2:** use one source of truth.
17. **Popup budget (P1).** `popup.js` is 114.5 kB of the 120 kB budget, with 55 kB of CSS. Removing the preview switches, sample fixtures and ATLAS-only code paths (lazy-loaded) in PR 2 should recover room before onboarding and billing UI are added.

### Public site

18. **The hero screenshot shows dev states (P1).** `public/shots/popup-*.png` show "Not connected" and "Today's digest · Not ready yet". **PR 8:** retake them after PR 2.
19. **The install path is a developer path (P1, until the store listing is live).** "Add to Chrome" downloads a zip and asks for Developer mode. **PR 8:** point to the Chrome Web Store URL once it is published, behind one constant. Keep the zip only on How it's built.
20. **Support runs through GitHub issues (P1).** Consumers will not have GitHub accounts. **PR 7:** add a support email (owner) and a privacy email.
21. **The nav sends "Privacy" to the top level (P2).** The nav should be How it works · Pricing · Web app · Support, with Privacy and Terms in the footer. **PR 2.**

### Design consistency (PR 3)

22. There are three stylesheets with overlapping rules: `wallet.css` (1151 lines), `site.css` and `app.css`, plus `extension/popup.css`. Tokens exist (`src/brand/tokens.css`) but there are hard-coded colours and radii in the component CSS. The serif display headings, sans body text and uppercase labels mix with no defined scale for the app. Chips, rows, cards and disclosures each have 2–3 visual variants.
23. Text size floor: `--atlas-text-2xs` is 11 px. No CSS uses anything smaller, which meets the rule. Contrast of the `fine` text on dark cards needs measuring in PR 3 (it looks near 4.5:1).

---

## 3. Accounts, data and billing gaps

| Gap | Where | PR |
|---|---|---|
| No account deletion (Auth user + all Firestore data) | none exists | 5 |
| No data export | none exists | 5 |
| Settings sync covers the theme only; text history is localStorage only | `firestore.rules:33-41`, `src/web/app.ts:809-823` | 5 |
| **The quota is client-enforced.** The client increments `users/{uid}/usage/{day}` itself. A modified client skips the increment. Anonymous ids reset when storage is cleared. | `src/platform/web/usage.ts`, `firestore.rules:7-27` | 6/7 |
| The entitlement is read from `customers/{uid}/subscriptions` on the client. There is no server-verified claim, and the extension cannot read it directly. | `src/platform/web/stripe-payments.ts:70` | 6 |
| No Customer Portal, receipts, plan change, coupons or pricing page | none exists | 6 |
| The project is on Spark (no Cloud Functions) | `docs/MONETIZATION.md` | owner → 6 |

**Architecture note for PR 6/7. This decision affects the hackathon story, so it is flagged here.** Firebase AI Logic calls go straight from the browser to Gemini. App Check proves the call came from our site, but nothing on the server can count calls per user. Real server-side quota therefore needs the metered cloud fallback to pass through a Cloud Function (`explainCloud`). That function verifies App Check and the user, increments the counter in a transaction and checks the plan, then calls Gemini on the server.

Proposal: keep the Firebase AI Logic hybrid path (on-device first, cloud fallback) exactly as it is while `billing_enabled` is false, which covers hackathon judging. When `billing_enabled` is true, the client keeps on-device Gemini Nano through AI Logic and sends cloud fallbacks to `explainCloud`. The on-device/cloud chip stays visible either way.

---

## 4. Production readiness gaps

| Area | Finding | PR |
|---|---|---|
| CSP | `connect-src` and `frame-ancestors` allow `http://localhost:3000` and `127.0.0.1:3000` in production (`firebase.json:15`). `style-src 'unsafe-inline'`. | 7 |
| Extension permissions | `host_permissions` includes `http://localhost:3000/*` (`extension/manifest.json:34`), which reviewers will question. Move it to `optional_host_permissions`, requested only by the owner. | 7 |
| API key restriction | It can't be verified from the repo. The owner should restrict the browser key to `atlas-explain.web.app`, `atlas-explain.firebaseapp.com` and the extension origin. | owner |
| Rules tests | `test/firestore-rules.test.ts` greps the rules text. No emulator tests. No Storage rules (Storage is unused, so it should be deny-all). | 7 |
| Monitoring | Sinks exist, but only the console sink is wired. No production error reporting. | 7 |
| Analytics | None. Funnel events (install, first explanation, sign-in, upgrade) are missing. No consent notice. | 7 |
| Offline | Explain handles offline. Today and Assets have no cached last-known state. | 7 |
| Legal | Drafts carry `[TODO]` markers (12 in `docs/legal/*`). No refund policy and no cookie/analytics notice. | 7 (+ lawyer) |
| Data licensing | `price_provider` defaults to `kraken`. Public Kraken/CoinGecko endpoints are not licensed for a paid product. A paid commercial plan must be in place before `billing_enabled=true`. | 7 (checklist) + owner |
| Grounded digest for the public | The "daily market digest grounded in real data" currently exists only from ATLAS on localhost. A public digest needs a server job (scheduled function) that builds it from the licensed feed and writes it to Firestore with source and time. | 7 (needs the data plan to be sold in Pro) |
| SEO | No `robots.txt`, `sitemap.xml`, Open Graph or Twitter tags, OG image or canonical links. | 8 |
| Store package | Screenshots show dev states. The listing copy and permission justifications need the localhost permission removed or justified. | 8 |

---

## 5. What is already good, and stays

- The hybrid path works and is honest: the badge names the path that actually ran.
- The trade-word scan, the education-only system prompt and recommendation refusal, and redaction of account-like numbers before anything is sent.
- Strict owner-only Firestore rules with a deny-all default. App Check is enforced on AI Logic.
- Timeouts on device init, Remote Config and explain. Per-browser abuse limits.
- Live prices always carry source attribution and time. Missing data is shown as missing.
- Routes are lazy-loaded, the bundle budget and manifest least-privilege checks run in `release:check`, and the mobile layout has no horizontal scroll at 390 px.

## 6. Owner-only steps (not attempted)

1. Chrome Web Store developer account, listing submission and the published store URL.
2. A Stripe account. Product and prices created from `docs/PRICING.md`. Keys stored as Firebase secrets.
3. Firebase console: upgrade to Blaze; enable the Google and email-link providers; add authorized domains; confirm App Check enforcement on AI Logic, Firestore and Functions; set budget alerts; restrict the browser API key.
4. Buy a commercial market-data plan before `billing_enabled` is set to true.
5. A support email and a privacy email (for example `support@` and `privacy@` on a domain you own).
6. A legal review of privacy, terms, refunds and the cookie notice, and a GST/HST registration decision.

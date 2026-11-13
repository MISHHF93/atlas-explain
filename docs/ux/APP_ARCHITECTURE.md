# ATLAS Explain: product architecture (site, extension, app)

Written 13 Nov 2026 against main `3370b22`. Owner direction (13 Nov, 6:05 PM Toronto): **the Chrome extension is the first product.** The website is built around it, the web app at `/app` is its companion, and phone-store builds (Capacitor, iOS, Android) are deferred.

The rules do not change: education only (no buy/sell wording), selected text only (never balances or account details), no made-up numbers (honest grey, "withheld", "not ready" and "Connect ATLAS" states), price attribution always visible, billing built in and switched off, fonts at 11px or larger, design tokens only, WCAG AA, keyboard and reduced motion. The #BuildHybridAI judge flow (on-device ⇄ cloud engine strip, Firebase AI Logic hybrid inference) must keep working at every step.

## 1. Audit of the current state (main `3370b22`)

| Area | Finding | Impact |
|---|---|---|
| Information architecture | `/` was both the marketing page and the app: a static hero beside a 360px wallet. There was no real website and no real application, and no address for any screen. | High |
| Routing | One `index.html` with a catch-all rewrite. Screens were tabs with no URL; asset detail, sign-in and legal were sheets reachable only by clicking. No deep links, no Back button, no 404 (every path returned the wallet). | High |
| Extension as product | The landing pushed "Try it in the wallet" first; the extension was a secondary link to a sheet with developer build steps. No download, no store path, no FAQ, no support page. | High |
| Legal | Privacy and Terms lived only in in-app sheets and markdown drafts. The Chrome Web Store and the OAuth consent screen need stable public URLs. | High (store) |
| Caching | `/` (the most-visited HTML) was cached for an hour, so every deploy needed Ctrl+Shift+R. Only `/index.html` was `no-cache`. | Medium |
| Layout | The web app reused the popup frame at 360–384px on desktop: lots of empty page, small type, sheets covering the whole frame. | Medium |
| Explain page | Move-card first (sample chips, JSON editor). The core loop people want, paste or select text → plain answer → follow-ups → save, is in the extension but not the web app. | High (phase 3) |
| Data views | Asset rows have price, change, badge and light, but no sparkline in the row; the detail is a sheet; digest cards lack per-line sources. | Medium (phase 3) |
| Extension popup | Polished, under budget (114 kB of 120 kB). Sign-in link pointed at `/?account=open`. | Low |

## 2. Route map

| Path | Served by | What it is |
|---|---|---|
| `/` | `index.html` (static) | Extension-first landing: **Add to Chrome**, how it works (select → explain → on-device first), hybrid diagram, popup screenshots, privacy promises, short FAQ, web-app link |
| `/how-it-works` | `how-it-works.html` | Select-text loop, hybrid AI (and that Gemini Nano is desktop-Chrome only; phones use the labelled cloud), where numbers come from, why lights are grey/withheld, **#install** (store "coming soon" + zip download + Load unpacked steps) |
| `/support` | `support.html` | Support channels (GitHub issues, privacy requests), full FAQ (`#faq`), troubleshooting |
| `/privacy`, `/terms` | static | Full legal drafts, marked **Draft · not final** |
| `/download/atlas-explain-chrome.zip` | build output | The same zip as the store upload, until the listing is live |
| `/app` | `app.html` (one lazy app bundle) | **Today**: market digest, today's brief, paper signal light, next steps |
| `/app/explain` | app | Explain (rebuilt in phase 3) |
| `/app/assets`, `/app/assets/:symbol` | app | Catalog; each asset has its own address (detail opens over the list) |
| `/app/learn` | app | Glossary and learn path |
| `/app/account` | app | Plan, sign-in state, appearance, AI, legal, about |
| `/signin` | app | Sign-in (Google, email link); `?next=/app/...` returns there |
| anything else | `404.html` / in-app not-found | Real 404 status on the site; "Page not found" sheet inside `/app` |

Old links keep working: `/#c=…` (ATLAS desk move links) → `/app/explain#c=…`; `/?account=open` (old extension builds) → `/signin`; `/?signin=email&oobCode=…` (email links already sent) → `/signin?…`; preview flags (`?tab=`, `?demo=`, …) → the matching `/app` route; `#/privacy`, `#/terms` → the pages. Logic in `src/app/routes.ts`, tested in `test/routes.test.ts`.

Hosting: explicit rewrites only (`/app`, `/app/**`, `/signin` → `app.html`; clean URLs for site pages). No catch-all, so unknown paths get `404.html` with a 404 status. All HTML and route paths are `no-cache`; hashed assets stay immutable. `bridge.html` is unchanged for the extension.

## 3. Screens (wireframe notes)

- **Landing (`/`).** Sticky header: logo · How it works · Web app · Support · Privacy · [Add to Chrome]. Hero left: tag, serif headline "Select any market term. Get it in plain language.", one-line lede, [Add to Chrome] (primary, large) + [Try it in your browser], fine print "store listing coming soon". Hero right: real popup screenshot. Then: 3-step flow cards; hybrid diagram; three popup screenshots with captions; privacy bullets; 4 FAQ items; closing CTA band; footer with disclaimer and links. Phone: single column, nav collapses to the header CTA + footer links.
- **App shell (`/app/**`).** Phone (360px+): header (logo, connection pill, account, menu), one scrolling column, bottom tabs Today · Explain · Assets · Learn · Account, safe-area padding. Desktop (900px+): header across, left rail with the same five items, centred 46rem reading column, sheets become a 34rem right drawer, onboarding becomes a centred dialog.
- **Today.** Title + date; market digest card (grounded only in live ATLAS; otherwise "Connect ATLAS… nothing is estimated"); today's brief (ready / not ready with reason); paper signal light (grey, withheld); "Explain a move or a term", "Get the Chrome extension".
- **Explain (phase 3 target).** One input "Paste or type a term, sentence or move" with Explain; engine line (On-device / Cloud, why); answer card (plain answer, two sides, what would change, source of engine); follow-ups (Simpler · Example · Why it matters); related terms; Save → History panel (right column on desktop, below on phone). Move cards from the desk still load through `#c=`.
- **Assets / asset detail.** Rows: symbol badge, name, sparkline, price, change with window, source + time, status light with one-line reason. Detail: price, chart, what moved, filings and news (when ATLAS provides per-symbol data; otherwise "not connected"), "Why is the light grey?" in plain words, Explain this.
- **Account.** Plan (free during beta), sign-in/out, appearance, AI route, legal, about.

## 4. Phases (each a small green squash-merged PR)

1. **Site + routes (this PR).** Extension-first landing, how it works, support/FAQ, privacy, terms, 404; `/app` with real routes and deep links; full-page responsive app layout; legacy redirects; no-cache HTML; zip download.
2. **Chrome Web Store readiness.** Manifest least-privilege audit with a justification per permission, single purpose, no remote code, MV3 CSP; icons 16/32/48/128; listing assets (1280×800, 640×400 screenshots, 440×280 small tile, 1400×560 marquee) under `store/`; `docs/CHROME_STORE.md` (listing text, privacy-practices answers, permission justifications, privacy URL, submission steps); rebuilt zip; popup and side panel polished to match the site.
3. **Explain rebuild.** Text-first loop on `/app/explain` (paste/select → answer → follow-ups → related → history), engine indicator, mobile-first.
4. **Data views.** Asset rows with sparkline/source/time/reason, a full asset detail page, digest cards with sources and timestamps, skeletons with timeouts.
5. **Deferred by the owner.** PWA install polish, Capacitor iOS/Android, app-store submissions.

## 5. Owner steps (not code)

- Register the Chrome Web Store developer account (one-time US$5) and submit with `docs/CHROME_STORE.md` (phase 2). Then send the listing URL so the **Add to Chrome** buttons can point straight at it.
- Firebase console: enable Google and Email-link sign-in (see `docs/LAUNCH_CHECKLIST.md`).
- Pick a support email for the legal pages and the store listing.

# Handover: ATLAS Explain production launch

You are the lead engineer and product designer for ATLAS Explain. Pick up the production launch where the last session stopped. Read this whole file before acting.

## The product

ATLAS Explain is a Chrome extension (MV3), a website and web app, and a hosted MCP connector for AI assistants. It explains market jargon in plain language. **Owner decision, 15 Nov 2026: keep both the extension and the connector.** The connector is the main way to reach other tools (Claude, other assistants, and any trading platform's own AI that supports MCP); the extension stays because it is the #BuildHybridAI entry (Gemini Nano on the device) and explains highlights on any page. Both use the same shared code and data, so never fork one from the other. Gemini Nano runs on the device first; when that isn't available, Gemini answers in the cloud through Firebase AI Logic. The answer always says which one ran.

- Repo: `MISHHF93/atlas-explain`. Local path: `C:\Users\borah\atlas-explain` (Windows).
- Live site: https://atlas-explain.web.app. Data site: https://atlas-explain-data.web.app.
- Firebase project: `atlas-explain`. Unpacked extension id: `ppobolmelmhmaofinpcihihlnhokiomm`.
- The project is entered in Google's #BuildHybridAI hackathon. Deadline: **30 Nov 2026, 2 PM PT**. Keep the on-device/cloud hybrid working and visible everywhere.

## Hard rules (never break these)

1. Education only. Never use buy, sell or trade-advice wording. A trade-word scan in `release:check` enforces this.
2. Never read account balances or account details. The extension reads only the text the user selects, plus the page title and site name, and only when asked.
3. No fake, placeholder or fixture data in the product. Show missing data honestly, with the reason. ATLAS prediction "leans" stay withheld (grey) unless the models are cleared for public use (the `clearedForPublic` gate).
4. Never commit secrets or edit `.env`. Never force push. Never overwrite local changes.
5. Never commit Stripe keys. Use Firebase secrets or env config, and document the owner's exact setup steps.
6. The Remote Config flag `billing_enabled` controls going live. It stays **false** until the owner flips it after hackathon judging.
7. **Zero budget.** The owner can pay only the one-time US$5 Chrome Web Store fee. Use only free, public or government data and free tiers. Scheduled jobs run on GitHub Actions, not Cloud Functions (no Blaze plan). Ask before adding anything that costs money.
8. The popup bundle budget is 120 kB (currently about 106 kB). Heavy code loads lazily, and guard tests enforce this.

## How to work here

- Run tests and `npm run release:check` from **PowerShell**. Vitest crashes under Git Bash.
- Deploy the website with `npx firebase-tools deploy --only hosting --non-interactive`. Add functions or Firestore rules to that deploy only when they change.
- Rebuild the extension with `npm run build:extension`, which writes `extension/atlas-explain-chrome.zip`.
- Firestore rules tests: `npm run test:rules`. These need Java 21; a portable JDK was used last time, nothing was installed system-wide. CI also runs them.
- `gh` is not signed in. Push branches and give the owner the compare URL.
- Many files use CRLF line endings. For multi-line edits, write a small Node script instead of a shell heredoc.
- Take screenshots at 1440 px and 390 px wide. At 390 px, use the CDP device-metrics override, because headless window sizes clip.
- Store images: run `node store/src/capture.mjs` against `npx vite --config vite.extension.config.ts --port 4780`. Then serve the web app with `npx vite preview --port 4173` and run `node store/src/generate.mjs`. Both need only Node and Chrome. Use `localhost`, not `127.0.0.1`, because Vite listens on IPv6.
- App Check (reCAPTCHA Enterprise) blocks headless Chrome, so cloud answers can't be tested headlessly.
- Small PRs. For each one: release:check, deploy, rebuild, screenshots, commit with a clear message, push, compare URL.

## The plan: 8 PRs, in order

| # | PR | Status | Branch |
|---|---|---|---|
| 1 | Audit and pricing (`docs/AUDIT.md`, `docs/PRICING.md`) | Done; pricing approved | `docs/production-audit` |
| 2 | Copy and UX cleanup; ATLAS-only parts hidden from the public | Done | `feat/copy-ux-cleanup` |
| — | Multi-asset catalog M1–M7, free data only (see below) | Done | stacked on PR 2 |
| 3 | Design system: type, spacing and radius tokens, enforced by tests | Done | in the stack |
| 4 | Onboarding: `/welcome` page on install, "Try a sample now" | Done | in the stack |
| 5 | Account: Google and email-link sign-in, download my data, delete my account | Done | `feat/account` |
| 6 | Monetization without a server (Stripe Payment Links, plan sync job) | Built and merged, switched off; owner setup pending | `feat/monetization-spark` |
| 7 | Hardening: tighter CSP, consented analytics, legal pages, Firestore rules tests | Done | `feat/hardening` |
| 8 | Store and SEO: meta/OG tags, robots.txt, sitemap.xml, store images, CHROME_STORE.md, optional localhost permission | Done; deployed 14 Nov 2026 | `feat/store-seo` (commit `19c89e5`) |

**One-page app (14 Nov 2026).** After a visual audit the owner asked for the web app on one page. `/app` is now one scrolling page: Explain, Today, Learn, Assets. There is no sidebar or bottom bar: the header has the logo (back to Explain) and three links, Today, Learn and Assets. Account and settings are a sheet behind the header account button. The extension popup is unchanged. Crypto prices are kept in the browser between loads (`atlas-explain-live-prices`), reused for a minute and shown for up to 15 minutes if the free feed refuses a request, always with their own time. Details: `docs/ux/APP_ARCHITECTURE.md`. Store screenshots of the web app and the click path in `docs/DEMO.md` predate this and need redoing.

**Site map (agreed 14 Nov 2026).** The public site is four pages: Home, Support, Privacy, Terms. "How it works" is folded into Home (`/#how-it-works`, `/#install`); `/how-it-works` redirects to `/`. Welcome opens only after install. "How it's built" stays for the hackathon judges until 30 Nov 2026, then should be folded into Home too. The extension popup has three tabs (Explain, Learn, Assets); Settings is a sheet opened from its menu, and the Signal tab still appears only while ATLAS is running.

**One back end, one front end (owner direction, 14 Nov 2026).** The owner wants no duplicated front ends or back ends. Step 1 is done: `src/platform/web/explain-service.ts` is the one back end. The web app (`backend.ts`) and the extension's bridge page (`src/bridge/main.ts`) both start Firebase, read settings, check limits, call the model and count usage through it; neither has its own copy. Two things stay separate on purpose: the popup tries Gemini Nano itself first (no Firebase is loaded in the popup), and the bridge page still exists because App Check cannot attest an extension page. Step 2, in progress: one front end. Done so far: Settings is built once in `src/wallet/settings.ts` (`buildSettings`) and used by both surfaces; a surface only passes what it can do (the popup: page tools, account row, ATLAS permission; the web app: the full Your data group, usage statistics, Terms). Explain is also built once now: `src/wallet/explain-panel.ts` (`explainPanel`) owns the box, the button, progress, the answer card with follow-ups and related terms, errors and Recent. A surface supplies only `ask` (`askWeb` in `src/web/app.ts`, `askPopup` in `extension/src/popup.ts`) and where history is kept. The web app still stores history under `atlas-explain-text-history` in its old shape (it is part of Download my data) and converts at the edge. Audit on 15 Nov 2026 of what each surface still builds itself. Shared now, one module each: Settings (`src/wallet/settings.ts`), Explain (`src/wallet/explain-panel.ts`), Learn (`src/wallet/learn-section.ts`, learn path and glossary, loaded on demand on both), Assets (`src/wallet/assets-controller.ts`), the onboarding screens (`onboarding()` in `src/wallet/cards.ts`), the header status pill (`connectionFor`), the digest card wording (`buildMarketDigest`). Asking about an asset or a term behaves the same on both: go to Explain and answer now. What each entry file still does itself, on purpose, because the platform differs: how it gets an answer (`askWeb` / `askPopup`), where it keeps history and progress (localStorage / chrome.storage), sign-in (the web app signs in; the popup reads the account through the bridge), Today (the web page shows live crypto movers; the popup has no Today tab, only an ATLAS digest row for ATLAS users), page tools (pin button, side panel, reading the highlight: popup only), routing and addresses (web only). The web app's market-move flow (reached from ATLAS desk links) keeps only its inputs (the move card, samples, question, private notes); since 15 Nov 2026 its answers, follow-ups, errors and Recent come from the shared Explain panel (`askMove` in `src/web/app.ts`). Move answers are still saved to the account (Firestore) and included in Download my data; the separate "Recent explanations" list that showed them inside the move box was removed, and they appear in the shared Recent on this browser instead. The two entry files cannot become one file: Chrome loads the popup from the extension package and the web app from the website, so each needs its own short launcher.

**State on 14 Nov 2026:** every PR above, plus the audit, pricing and catalog docs, is merged into `main`. `main` is the only branch, locally and on GitHub; all other branches were checked for unmerged work and then deleted. Work on new short-lived branches off `main`, then merge back. The live site matches `main`.

## Approved pricing (docs/PRICING.md)

- **Free:** unlimited on-device answers, 10 cloud answers a day with Gemini Flash-Lite.
- **Pro:** US$5.99 a month or US$47.99 a year. 300 cloud answers a day with Gemini Flash, and history synced to the account.
- No trial. A FOUNDER coupon. Refundable on request within 14 days.
- **Owner decision, 14 Nov 2026: no card on file, so no Blaze plan.** The `explainCloud` function and the Firebase Stripe extension are dropped. Do not ask again unless the owner raises it.
- Architecture on the free plan (`docs/MONETIZATION.md`): Stripe Payment Links for checkout, Stripe's portal link to cancel, and a GitHub Actions job (`billing-sync.yml`) that reads Stripe with a read-only key and writes `users/{uid}/plan/current`. The app counts cloud answers itself; no server enforces the limit.
- Sold at first: a higher daily cloud limit (`pro_cloud_daily_limit`, default 100, not 300) and the larger watchlist. Free is 10 a day once billing is on. The stronger-model row is not sold. Synced history is still free for any signed-in account; gating it is an open owner decision.
- **Gemini free-tier terms (checked 14 Nov 2026):** the cloud fallback may not be offered to users in the EEA, Switzerland or the UK on the free tier, and Google may use free-tier prompts to improve its products. The privacy page now says the second part; the first needs an owner decision (`docs/legal/REVIEW_NOTES.md` point 11).

## Multi-asset catalog (done; plan in docs/ux/MULTI_ASSET_CATALOG.md, $0 a month)

- One `Asset` schema (`src/core/asset-schema.ts`). Every figure names its source and licence (`docs/legal/DATA_SOURCES.md`).
- Free sources:
  - CoinGecko (keyless; the default crypto price source)
  - US Treasury, ECB, Bank of Canada, EIA (optional free key)
  - SEC EDGAR (stocks and ETFs from filings)
  - GDELT ("in the news today")
- An hourly GitHub Actions job (`.github/workflows/market-data.yml`, `scripts/data/build-data.ts`) publishes `market.json` and `news.json` to the data site. Owner secrets: `FIREBASE_SERVICE_ACCOUNT`, `EIA_API_KEY` (optional), `SEC_USER_AGENT`.
- Index, futures and options pages are education only, with no licensed index levels.
- Watchlist (max 50; on the device or synced). Real coin icons from CoinGecko. Logo.dev company logos only if the owner adds a `pk_` token. No government or exchange logos.
- Paid feeds are listed only in a "later, if revenue allows" appendix. **Get the owner's OK before adding any provider that needs a paid plan.**

## Open work, in priority order

1. **Keep `main` green:** run release:check before every push. Never force push.
   - **GitHub Actions is not running (found 14 Nov 2026).** Every job fails in two seconds with "The job was not started because your account is locked due to a billing issue", and no run has ever succeeded. So CI (including the Firestore rules tests on the emulator) is not checking anything, the hourly market-data job is not refreshing the data site (its files were last published by hand at 01:55 UTC on 14 Nov), and the plan sync job for PR 6 cannot run. Only the owner can fix this, in GitHub → Settings → Billing and plans. Until then, release:check on this machine is the only gate, and the rules tests for PR 6 have not been run anywhere (this machine has Java 17; the emulator needs Java 21).
2. **PR 6, monetization:** merged into `main` on 14 Nov 2026. Still to do: the owner's Stripe and GitHub steps (`docs/MONETIZATION.md`, "Go-live"); the first real run of the sync job (its live calls have never run against Stripe or Firestore); the EEA/UK decision above. The Stripe key goes only in GitHub Actions secrets.
3. **PR 5 follow-ups:**
   - Done and merged (`feat/email-link-confirm-field`): the `window.prompt` for cross-device email-link sign-in is now an in-app "Finish signing in" sheet (`emailConfirmPanel` in `src/wallet/account.ts`; preview it in dev with `/app?sheet=confirm-email`). Not yet tried with a real link on a second device; the owner should do that once after deploy.
   - Optionally sync text-explanation history to the account.
4. **Store submission support:**
   - When the owner sends the store item id, add it to `ALLOWED_EXTENSION_IDS` in `src/bridge/protocol.ts` and to `frame-ancestors` in `firebase.json`, then redeploy.
   - When the listing is live, set `CHROME_STORE_URL` in `src/core/links.ts`, then rebuild and redeploy hosting. The build (`src/site/frame.ts`) then turns every primary "Open the web app" button into "Add to Chrome", shows the store steps instead of the "not in the store yet" note, and the app's extension sheet gets its store button.
5. **Optional:** replace the store screenshots that show the popup's built-in sample answer with a real on-device answer captured in the owner's own Chrome.
6. **Platform scan (`feat/platform-scan`, 15 Nov 2026):** Today shows GDELT headlines with "Explain" (they show an honest "nothing recent enough" note until the hourly data job runs again); Learn links to the practice page; crypto charts have 24H/7D/30D ranges and a price readout; spread, stop-limit and yield-curve terms have diagrams; and a read-only MCP server for AI assistants.
7. **Online only (15 Nov 2026, owner decision):** people never download anything. The website no longer offers the extension zip (`/download/**` redirects to `/#install`) or build steps. Until the store listing is live, Home says "The extension is not in the Chrome Web Store yet" and points to the web app. The MCP server is hosted on Cloudflare Workers free plan (`src/mcp/http.ts`, `src/mcp/worker.ts`, `wrangler.toml`); there is no download-and-run version. It is live at `https://atlas-explain-mcp.atlas-explain.workers.dev/mcp?v=2` (the `?v=2` is deliberate: see "If Claude shows Couldn't register" in `docs/MCP.md`) (deployed 15 Nov 2026 from the owner's Cloudflare account; `MCP_URL` in `src/core/links.ts` is set, so Support shows the connector steps). Redeploy it with `npm run deploy:mcp` after changing `src/mcp/`. Since 15 Nov 2026 it also has structured output (outputSchema/structuredContent on every data tool), an interactive MCP App chart for price_history (`src/mcp/chart-app.ts`), three prompts, icons, and `server.json` for the MCP Registry (owner publishes it; see `docs/MCP.md`, "Getting listed"). It has seven tools matching the app (glossary and learning path, asset details, official figures including SEC company figures, live crypto prices and price history with a Kraken fallback, headlines); see `docs/MCP.md`. While GitHub Actions is locked, the data site can be refreshed by hand: `node scripts/data/build-data.ts` then `npx firebase-tools deploy --only hosting --config firebase.data.json --project atlas-explain` (done 15 Nov 2026, 22:25 UTC; EIA skipped without its key). The repository stays public with one footer "Source" link, because the hackathon needs it. Developer docs (README, DEMO) still describe loading the unpacked build for testing.
8. **One site frame (15 Nov 2026):** the seven public pages hold only `<!-- site:header page -->` and `<!-- site:footer -->` markers; `src/site/frame.ts` is the one header and footer, filled in by the build (vite.config.ts) and by tests (`test/site-page.ts`). The store link and the MCP address are also filled in at build time, so `src/site/site.ts` only handles old-link redirects. Change navigation there, never in a page.
9. **Hackathon:** before 30 Nov, re-check `docs/SUBMISSION.md` and `docs/DEMO.md` against the current app. The demo shortcuts are Alt+Shift+E to open the popup and Alt+Shift+X to explain the highlight.

## Owner-only steps (list them, never attempt them)

The full list is in `docs/LAUNCH_CHECKLIST.md`:

- the Chrome Web Store developer account (US$5), upload and submission (`docs/CHROME_STORE.md` section 5)
- the Stripe account and keys
- Firebase console switches (Blaze plan, Remote Config flags such as `billing_enabled` and `analytics_enabled`, reCAPTCHA domains)
- any paid data plan
- the support email
- redeploying the hosted MCP server needs the owner's Cloudflare sign-in on this computer (`npx wrangler@4 login`, done 15 Nov 2026)
- legal review of `privacy.html` and `terms.html` (see `docs/legal/REVIEW_NOTES.md`)
- GitHub Actions secrets, and unlocking the GitHub account's billing so Actions can run
- submitting the sitemap in Google Search Console

## First thing to do

Run `git status` and `npm run release:check` (in PowerShell) on `main` to confirm the state is green. Then check whether the owner has unlocked GitHub Actions (see open work, item 1).

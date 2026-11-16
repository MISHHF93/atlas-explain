# Handover: ATLAS Explain production launch

You are the lead engineer and product designer for ATLAS Explain. Pick up the production launch where the last session stopped. Read this whole file before acting.

## The product

ATLAS Explain is a hosted MCP connector for AI assistants, plus a website and web app. It explains market jargon in plain language. **Owner decision, 15 Nov 2026 (final): MCP first, app second, and no Chrome extension.** Earlier the same day the owner chose to keep both the extension and the connector, then reversed it: "there is no point of making a Chrome extension if it's an MCP". The extension, its build, the bridge page, the practice page (/welcome) and the Chrome Web Store assets were deleted on branch `feat/drop-extension`. The website leads with the connector (Home hero, header button and the first footer link go to `/connect`); the web app is the second option, in Home's "Or use the web app" section (`#browser`). Support answers connector questions first, and How it's built opens with the connector. Keep the hybrid-AI explanation on Home and How it's built: the #BuildHybridAI entry now rests on the web app, which runs Gemini Nano through Firebase AI Logic in desktop Chrome. Gemini Nano runs on the device first; when that isn't available, Gemini answers in the cloud through Firebase AI Logic. The answer always says which one ran.

- Repo: `MISHHF93/atlas-explain`. Local path: `C:\Users\borah\atlas-explain` (Windows).
- Live site: https://atlas-explain.web.app. Data site: https://atlas-explain-data.web.app.
- Firebase project: `atlas-explain`.
- The project is entered in Google's #BuildHybridAI hackathon. Deadline: **30 Nov 2026, 2 PM PT**. Keep the on-device/cloud hybrid working and visible everywhere.

## Hard rules (never break these)

1. Education only. Never use buy, sell or trade-advice wording. A trade-word scan in `release:check` enforces this.
2. Never read account balances or account details. The web app uses only the text the user types, and the connector only what the assistant sends it, and only when asked.
3. No fake, placeholder or fixture data in the product. Show missing data honestly, with the reason. ATLAS prediction "leans" stay withheld (grey) unless the models are cleared for public use (the `clearedForPublic` gate).
4. Never commit secrets or edit `.env`. Never force push. Never overwrite local changes.
5. Never commit Stripe keys. Use Firebase secrets or env config, and document the owner's exact setup steps.
6. The Remote Config flag `billing_enabled` controls going live. It stays **false** until the owner flips it after hackathon judging.
7. **Zero budget.** There is no budget at all (the US$5 Chrome Web Store fee is no longer needed). Use only free, public or government data and free tiers. Scheduled jobs run on GitHub Actions, not Cloud Functions (no Blaze plan). Ask before adding anything that costs money.
8. The web app's entry bundle budget is 150 kB (`scripts/bundle-budget.mjs`). Heavy code loads lazily, and guard tests enforce this.

## How to work here

- Run tests and `npm run release:check` from **PowerShell**. Vitest crashes under Git Bash.
- Deploy the website with `npx firebase-tools deploy --only hosting --non-interactive`. Add functions or Firestore rules to that deploy only when they change.
- Firestore rules tests: `npm run test:rules`. These need Java 21; a portable JDK was used last time, nothing was installed system-wide. CI also runs them.
- `gh` is not signed in. Push branches and give the owner the compare URL.
- Many files use CRLF line endings. For multi-line edits, write a small Node script instead of a shell heredoc.
- Take screenshots at 1440 px and 390 px wide. At 390 px, use the CDP device-metrics override, because headless window sizes clip.
- App Check (reCAPTCHA Enterprise) blocks headless Chrome, so cloud answers can't be tested headlessly.
- Small PRs. For each one: release:check, deploy, screenshots, commit with a clear message, push, compare URL.

## The plan: 8 PRs, in order

| # | PR | Status | Branch |
|---|---|---|---|
| 1 | Audit and pricing (`docs/AUDIT.md`, `docs/PRICING.md`) | Done; pricing approved | `docs/production-audit` |
| 2 | Copy and UX cleanup; ATLAS-only parts hidden from the public | Done | `feat/copy-ux-cleanup` |
| — | Multi-asset catalog M1–M7, free data only (see below) | Done | stacked on PR 2 |
| 3 | Design system: type, spacing and radius tokens, enforced by tests | Done | in the stack |
| 4 | Onboarding: "Try a sample now" in the app (the `/welcome` install page was removed with the extension) | Done | in the stack |
| 5 | Account: Google and email-link sign-in, download my data, delete my account | Done | `feat/account` |
| 6 | Monetization without a server (Stripe Payment Links, plan sync job) | Built and merged, switched off; owner setup pending | `feat/monetization-spark` |
| 7 | Hardening: tighter CSP, consented analytics, legal pages, Firestore rules tests | Done | `feat/hardening` |
| 8 | Store and SEO: meta/OG tags, robots.txt, sitemap.xml, store images, CHROME_STORE.md, optional localhost permission | Done; deployed 14 Nov 2026 | `feat/store-seo` (commit `19c89e5`) |

**One-page app (14 Nov 2026).** After a visual audit the owner asked for the web app on one page. `/app` is now one scrolling page: Explain, Today, Learn, Assets. There is no sidebar or bottom bar: the header has the logo (back to Explain) and three links, Today, Learn and Assets. Account and settings are a sheet behind the header account button. The extension popup is unchanged. Crypto prices are kept in the browser between loads (`atlas-explain-live-prices`), reused for a minute and shown for up to 15 minutes if the free feed refuses a request, always with their own time. Details: `docs/ux/APP_ARCHITECTURE.md`. Store screenshots of the web app and the click path in `docs/DEMO.md` predate this and need redoing.

**Site map (agreed 14 Nov 2026, updated 15 Nov).** The website opens first at the root; the app is under /app. The public site is Home, AI assistants (/connect), Support, Privacy and Terms, with one shared header and footer (`src/site/frame.ts`): How it works, Web app, AI assistants, Support, and "Sign in" (your initials and "Account" when signed in on this browser). "Sign in" leads to the Sign in page at /signin (Google or email link, or "Continue without an account"), then into the app; the app header has "Sign in" or an account menu (Account and settings, Your data, Sign out). Signing in stays optional. "How it works" is folded into Home (`/#how-it-works`); `/how-it-works` redirects to `/`, and `/welcome` and `/download/**` redirect to `/connect`. "How it's built" stays for the hackathon judges until 30 Nov 2026, then should be folded into Home too.

**One back end, one front end (owner direction, 14 Nov 2026).** With the extension gone there is one of each: `src/platform/web/explain-service.ts` is the back end, and the web app (`src/web/app.ts`) mounts the shared wallet parts (`src/wallet/`: Settings, Explain panel, Learn, Assets, onboarding). Some shared modules keep names from the extension era (`src/core/extension-prompt.ts`, `src/core/popup-copy.ts`); they are used by the web app and the connector, so rename them only in a change of their own.

**State on 15 Nov 2026:** every PR above and every later feature branch is merged into `main`, and the live site and the MCP server match `main`. Feature branches are kept on GitHub after merging (all merged; check with `git branch --no-merged main`). Work on new short-lived branches off `main`, run release:check, then merge back. For the hackathon, `docs/SUBMISSION.md` is the checklist, `docs/DEVPOST.md` the write-up draft and `docs/DEMO.md` the shot list.

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
- An hourly GitHub Actions job (`.github/workflows/market-data.yml`, `scripts/data/build-data.ts`) publishes `market.json`, `news.json` and `crypto.json` (prices and 30 days of hourly closes for the ten coins, from Kraken with CoinGecko as backup; the MCP connector reads crypto only from here, so it calls no third-party API itself) to the data site. Owner secrets: `FIREBASE_SERVICE_ACCOUNT`, `EIA_API_KEY` (optional), `SEC_USER_AGENT`.
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
4. **Chrome extension removed (15 Nov 2026):** nothing to submit to the Chrome Web Store. `docs/AUDIT.md` and `docs/ux/` still describe the extension as history; don't follow them for current work.
6. **Platform scan (`feat/platform-scan`, 15 Nov 2026):** Today shows GDELT headlines with "Explain" (they show an honest "nothing recent enough" note until the hourly data job runs again); Learn links to the practice page; crypto charts have 24H/7D/30D ranges and a price readout; spread, stop-limit and yield-curve terms have diagrams; and a read-only MCP server for AI assistants.
7. **Online only (15 Nov 2026, owner decision):** people never download anything. The MCP server is hosted on Cloudflare Workers free plan (`src/mcp/http.ts`, `src/mcp/worker.ts`, `wrangler.toml`); there is no download-and-run version. It is live at `https://atlas-explain-mcp.atlas-explain.workers.dev/mcp?v=2` (the `?v=2` is deliberate: see "If Claude shows Couldn't register" in `docs/MCP.md`) (deployed 15 Nov 2026 from the owner's Cloudflare account; `MCP_URL` in `src/core/links.ts` is set, so Support shows the connector steps). Redeploy it with `npm run deploy:mcp` after changing `src/mcp/`. Since 15 Nov 2026 it also has structured output (outputSchema/structuredContent on every data tool), an interactive MCP App chart for price_history (`src/mcp/chart-app.ts`), three prompts, icons, and `server.json` for the MCP Registry (owner publishes it; see `docs/MCP.md`, "Getting listed"). Since 15 Nov 2026 it is dual-era: MCP 2026-07-28 (stateless: `server/discover`, per-request `_meta`, header validation, `resultType`, caching hints) alongside the `initialize`-based versions; the glossary is also served as resources; server version 1.4.0. It has seven tools matching the app (glossary and learning path, asset details, official figures including SEC company figures, live crypto prices and price history with a Kraken fallback, headlines); see `docs/MCP.md`. While GitHub Actions is locked, the data site can be refreshed by hand: `node scripts/data/build-data.ts` then `npx firebase-tools deploy --only hosting --config firebase.data.json --project atlas-explain` (done 15 Nov 2026, 22:25 UTC; EIA skipped without its key). The repository stays public with one footer "Source" link, because the hackathon needs it.
8. **One site frame (15 Nov 2026):** the seven public pages hold only `<!-- site:header page -->` and `<!-- site:footer -->` markers; `src/site/frame.ts` is the one header and footer, filled in by the build (vite.config.ts) and by tests (`test/site-page.ts`). The MCP address is also filled in at build time, so `src/site/site.ts` only handles old-link redirects. Change navigation there, never in a page.
9. **Hackathon:** before 30 Nov, re-check `docs/SUBMISSION.md` and `docs/DEMO.md` against the current app. The demo is connector first (Claude), then the web app with Gemini Nano.

## Owner-only steps (list them, never attempt them)

The full list is in `docs/LAUNCH_CHECKLIST.md`:

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

# ATLAS Explain launch-readiness checklist

Status as of 2026-11-16. Billing stays **off** until hackathon judging is over. The roadmap to paid plans is the "Monetization roadmap" section below.
Education only: no buy/sell wording, never reads balances or account details.

## Done in code (merged to main, live on atlas-explain.web.app)
- [x] **Live data:** crypto prices load from a pluggable public feed (Kraken or CoinGecko) on the web app when ATLAS on the computer is not running. Remote Config `price_provider` defaults to `kraken` for the hackathon demo. Attribution is shown next to the prices. Lights stay grey; stocks and predictions still say Connect ATLAS. Header shows "Live prices". (#42, live-price provider PR)
- [x] **No endless spinners:** Nano download no longer blocks answers; 12 s device-init deadline, 6 s Remote Config timeout, 70 s explain deadline; plain-language cloud errors. (#43)
- [x] **Auth on the web:** Google (popup, redirect fallback), passwordless email link, sign-out, header account chip, signed-out mode with anonymous id that links on sign-in, per-user theme in Firestore. (#44)
- [x] **Strict Firestore rules:** owner-only (`request.auth.uid == userId`), fixed shapes for explanations, usage and prefs; deny-all default. Deployed.
- [x] **App Check on Firebase AI Logic:** enforced. A request without a token gets `401 Firebase App Check token is invalid` (verified 2026-11-13).
- [x] **Abuse guard:** per-browser cloud limit (8/min, 300/day) in the web app; never limits on-device answers.
- [x] **Monitoring hooks:** `src/core/monitor.ts` reports cloud, App Check, auth, timeout, rate-limit and uncaught events (no user content; emails/tokens scrubbed) to pluggable sinks. Console sink on by default.
- [x] **Plans and billing wired, switched off:** Remote Config `billing_enabled=false`; Stripe checkout code path only loads when it is true.
- [x] **Legal drafts:** `docs/legal/PRIVACY_DRAFT.md`, `docs/legal/TERMS_DRAFT.md`; in-app Terms/Privacy marked DRAFT.

## You must do before a public launch (console only)
### Needed now for sign-in
1. [x] **Google sign-in is on** (16 Nov 2026). Firebase console → atlas-explain → Authentication → Sign-in method: Google enabled, public-facing name "ATLAS Explain", support email set.
2. [x] **Email-link sign-in is on** (16 Nov 2026). Email/Password enabled with **Email link (passwordless sign-in)**. Without these two, the Sign in page could not sign anyone in.
4. **Authorized domains:** Authentication → Settings → Authorized domains already has `atlas-explain.web.app`, `atlas-explain.firebaseapp.com`, `localhost`. Remove `localhost` before launch if you do not develop against production.

### Protection and quota
5. **App Check enforcement:** Firebase console → App Check → APIs → confirm **Firebase AI Logic** is Enforced (it is), then set **Cloud Firestore** and **Authentication** to Enforced after a day of healthy metrics.
6. **AI Logic per-user rate limit:** Firebase console → AI Logic → Settings → set a per-user requests-per-minute limit (for example 10).
7. **API key restrictions:** Google Cloud console → APIs & Services → Credentials → Browser key → Application restrictions: HTTP referrers `https://atlas-explain.web.app/*`, `https://atlas-explain.firebaseapp.com/*`. API restrictions: limit to the Firebase APIs the app uses.
8. **Budget alerts:** Billing → Budgets & alerts on the project, even on the free tier.

### Store and consent
9. **OAuth consent screen:** Google Cloud console → Google Auth Platform → Branding: app name, support email, logo, home page `https://atlas-explain.web.app`, privacy and terms URLs (publish the final legal pages first) → Audience: Production → submit for verification if Google asks (basic scopes only: email, profile, openid).
11. **Privacy policy and terms review:** finish every `[TODO]` in `docs/legal/`, have them reviewed, publish at stable URLs, and remove the DRAFT labels in `src/wallet/legal.ts`.

### Data licensing (required before a market launch; not required for the hackathon demo)
12. **Licensed price feed.** Remote Config `price_provider` defaults to `kraken`. Before a public market launch, set it to `coingecko` and obtain a paid CoinGecko commercial plan (attribution is already shown), or keep Kraken only after written consent. Optional: set `coingecko_demo_api_key` in Remote Config (never commit a key). See `docs/legal/DATA_SOURCES.md`. Do not train any model on these feeds.

### After judging
13. **Billing switch-on:** follow "Go-live" in `docs/MONETIZATION.md` (Stripe account, Payment Links, portal link, read-only key, webhook, Worker secrets, test purchase), then flip Remote Config `billing_enabled` to `true`. No Blaze plan needed.
14. **Monitoring sink:** add a real sink (for example Firebase Analytics or Sentry) with `addMonitorSink` and mention it in the privacy policy.

## Added in the production pass (November 2026)

### Owner steps (free)
- [ ] **Optional data keys** (Cloudflare Worker secrets, free): `npx wrangler@4 secret put EIA_API_KEY` for energy prices (optional since 18 Nov 2026: without it they come from the EIA's public history pages). SEC filings: run `npm run data:publish` from a computer every few days (set `SEC_USER_AGENT` to "ATLAS Explain you@yourdomain" first).
- [ ] **Remote Config**: `price_provider` = `coingecko`; optional `logo_dev_token` (Logo.dev publishable key, `pk_…`).
- [ ] **Analytics (optional)**: link Google Analytics to the Firebase project, set data retention to 2 months, then set Remote Config `analytics_enabled` = `true`. The web app then asks each visitor once; nothing loads before that.
- [ ] **Legal**: add the operator's legal name and a privacy/support email to `/privacy` and `/terms`, then go through docs/legal/REVIEW_NOTES.md with a lawyer.
- [x] **MCP Registry**: published 15 Nov 2026 as `io.github.MISHHF93/atlas-explain` (`docs/MCP.md`, "Getting listed").
- [ ] **Claude connectors directory**: submitted by the owner on 15 Nov 2026 and updated 16 Nov (correct answers, carousel); track it at https://claude.ai/directory/manage (answers in `docs/CONNECTOR_SUBMISSION.md`). Its tool list still shows the 7 tools captured on 16 Nov: "Sync from server" there picks up the 18 tools of 1.16.0.
- [x] **Hosted MCP server** (live 15 Nov 2026 at https://atlas-explain-mcp.atlas-explain.workers.dev/mcp, verified in Claude) (free Cloudflare account, no card): `npx wrangler@4 login`, `npm run deploy:mcp`, then set `MCP_URL` in `src/core/links.ts` (`docs/MCP.md`).
- [x] **Blaze plan**: decided against on 14 Nov 2026 (no card on file). Paid plans run without it; see `docs/MONETIZATION.md`.
- [ ] **Gemini free tier and Europe**: decide how to handle the EEA, Switzerland and the UK, where the free tier may not be used for the cloud fallback (`docs/legal/REVIEW_NOTES.md` point 11).

- [ ] **Claude plugin**: submit `plugins/atlas-explain` at claude.ai/directory/manage → Submit new → Plugin (built 18 Nov 2026; `docs/NEXT_LEVEL.md` item 16).
- [ ] **MCP Registry**: publish each new version after deploy (`docs/MCP.md`, "Getting listed"; needs a GitHub device code approved by the owner).

### Partners (sandbox live 18 Nov 2026, `docs/PARTNER_API.md`)
- [x] Sandbox keys: `node scripts/partners/issue-key.mjs --name "…" --apply`, revoke with `--revoke <hash> --apply`. Fixed 18 Nov 2026: on Windows the record is now written through a file, so its JSON keeps its quotes (before, keys issued from Windows never worked).
- [ ] A business email for partner requests, to replace the GitHub issue link on `/partners`.
- [ ] Lawyer review of the partner terms in `docs/PARTNER_API.md` (and the bank attribution terms marked ⚑ in `docs/legal/DATA_SOURCES.md`).
- [ ] Only if partner traffic outgrows the free Workers plan (100,000 requests and 1,000 KV writes a day): the paid Workers plan. It costs money, so it waits for revenue.

### Before charging money
- [ ] A commercial licence for crypto prices (CoinGecko paid plan) if crypto stays part of what Pro sells; see docs/ux/MULTI_ASSET_CATALOG.md §9.
- [ ] Stripe setup, the Worker's webhook secrets and a test purchase (`docs/MONETIZATION.md`, Go-live steps 2 to 9).
- [ ] Set `pro_cloud_daily_limit` to what the Gemini quota page shows the project can serve.
- [ ] Later, if revenue allows: the paid Gemini tier (phase 4), and a server-side cloud quota instead of the app's own counter.

## Monetization roadmap (docs/PRICING.md, docs/MONETIZATION.md; revised 16 Nov 2026)

Every phase keeps the connector and all of today's tools free, and never adds trade calls, verdicts or forecasts.

### Phase 1: free through judging (now)
- [x] `billing_enabled` = false: every feature free, on-device answers unlimited, connector free.
- [x] Pricing and payment design written for MCP first.

### Phase 2: Pro in the web app (after judging)
Engineer:
- [x] Worker endpoint `POST /billing/v1/stripe` (16 Nov 2026, `src/mcp/billing-webhook.ts`): verify the Stripe signature (HMAC-SHA256, 5-minute tolerance), handle `checkout.session.completed`, `customer.subscription.updated` and `customer.subscription.deleted`, keep subscription → account in KV, write or delete `users/{uid}/plan/current` through the Firestore REST API with a service-account token. Reuse `src/core/billing-sync.ts`. Tests with recorded Stripe payloads; never downgrade on an error.
- [x] A test that the app's checkout copy and the webhook agree that Pro turns on immediately (`test/billing-webhook.test.ts`).
Owner:
- [ ] Stripe test mode: product, two prices, two Payment Links, customer portal login link, restricted read-only key, webhook endpoint (`docs/MONETIZATION.md`, Go-live 2–7).
- [ ] Worker secrets `STRIPE_WEBHOOK_SECRET`, `STRIPE_RESTRICTED_KEY`, `FIREBASE_SERVICE_ACCOUNT` (Go-live 8).
- [ ] Test purchase and cancellation in test mode (Go-live 9), then live mode and `billing_enabled` = true (Go-live 11).
- [ ] Decide whether synced history becomes Pro-only.
- [ ] Accountant: GST/HST registration and Stripe Tax.

### Phase 3: premium connector tools (owner decides which)
- [ ] Choose the first premium tool: evidence brief, release alerts or longer history (`docs/PRICING.md` ³).
- [ ] OAuth 2.1 on the Worker (authorization and token endpoints, protected-resource metadata), sign-in through the website's `/signin`, a plan check on each premium call. Free tools keep working with no account.
- [ ] Directory listing: authentication "Required when the server asks", new tools synced, through Anthropic's review. Registry: publish the new version.

### Phase 4: the paid Gemini tier (when revenue covers it)
- [ ] Owner adds a card to Google Cloud for the Gemini API only, with a budget alert.
- [ ] `pro_cloud_daily_limit` = 300 and the Gemini Flash row on the pricing page; the cloud fallback offered in the EEA, Switzerland and the UK; the privacy page no longer says Google may use prompts.

### Checks that now run automatically
- `npm run release:check`: types, lint, tests (including the design-system, privacy-surface and bundle-size guards), the web and MCP builds, bundle budget, npm audit, trade-word scan.
- `npm run test:rules` (CI job "rules"): Firestore rules on the emulator.

# ATLAS Explain launch-readiness checklist

Status as of 2026-11-13. Billing stays **off** until hackathon judging is over.
Education only: no buy/sell wording, never reads balances or account details.

## Done in code (merged to main, live on atlas-explain.web.app)
- [x] **Live data:** crypto prices load from a pluggable public feed (Kraken or CoinGecko) on the web app and in the extension when ATLAS on the computer is not running. Remote Config `price_provider` defaults to `kraken` for the hackathon demo. Attribution is shown next to the prices. Lights stay grey; stocks and predictions still say Connect ATLAS. Header shows "Live prices". (#42, live-price provider PR)
- [x] **No endless spinners:** Nano download no longer blocks answers; 12 s device-init deadline, 6 s Remote Config timeout, 70 s explain deadline; plain-language cloud errors. (#43)
- [x] **Auth on the web:** Google (popup, redirect fallback), passwordless email link, sign-out, header account chip, signed-out mode with anonymous id that links on sign-in, per-user theme in Firestore. (#44)
- [x] **Extension cloud + sign-in:** cloud calls go through `bridge.html` on atlas-explain.web.app (App Check runs on the web origin), answering only the pinned extension id with the fixed prompt; extension uses the account signed in on the web app. Debug-token field removed. (#45)
- [x] **Strict Firestore rules:** owner-only (`request.auth.uid == userId`), fixed shapes for explanations, usage and prefs; deny-all default. Deployed.
- [x] **App Check on Firebase AI Logic:** enforced. A request without a token gets `401 Firebase App Check token is invalid` (verified 2026-11-13).
- [x] **Abuse guard:** per-browser cloud limit (8/min, 300/day) in the web app and the bridge; never limits on-device answers.
- [x] **Monitoring hooks:** `src/core/monitor.ts` reports cloud, App Check, auth, timeout, rate-limit and uncaught events (no user content; emails/tokens scrubbed) to pluggable sinks. Console sink on by default.
- [x] **Plans and billing wired, switched off:** Remote Config `billing_enabled=false`; Stripe checkout code path only loads when it is true.
- [x] **Legal drafts:** `docs/legal/PRIVACY_DRAFT.md`, `docs/legal/TERMS_DRAFT.md`; in-app Terms/Privacy marked DRAFT.

## You must do before a public launch (console only)
### Needed now for sign-in and extension cloud answers
1. **Turn on Google sign-in.** Firebase console → atlas-explain → Authentication → Sign-in method → Add new provider → Google → Enable → pick the support email → Save.
2. **Turn on email-link sign-in.** Same page → Email/Password → Enable, then turn on **Email link (passwordless sign-in)** → Save.
3. **Let the extension pass App Check.** Google Cloud console → Security → reCAPTCHA → key `6Lfvih0uAAAAACiSBUPpM_VU7viBi9FCrtO8Mtb-` → Edit key → Domains → Add `ppobolmelmhmaofinpcihihlnhokiomm` (the extension id, no `chrome-extension://`) → Save. After the Chrome Web Store assigns its id, add that id too and add it to `ALLOWED_EXTENSION_IDS` in `src/bridge/protocol.ts` and `frame-ancestors` in `firebase.json`.
4. **Authorized domains:** Authentication → Settings → Authorized domains already has `atlas-explain.web.app`, `atlas-explain.firebaseapp.com`, `localhost`. Remove `localhost` before launch if you do not develop against production.

### Protection and quota
5. **App Check enforcement:** Firebase console → App Check → APIs → confirm **Firebase AI Logic** is Enforced (it is), then set **Cloud Firestore** and **Authentication** to Enforced after a day of healthy metrics.
6. **AI Logic per-user rate limit:** Firebase console → AI Logic → Settings → set a per-user requests-per-minute limit (for example 10).
7. **API key restrictions:** Google Cloud console → APIs & Services → Credentials → Browser key → Application restrictions: HTTP referrers `https://atlas-explain.web.app/*`, `https://atlas-explain.firebaseapp.com/*`. API restrictions: limit to the Firebase APIs the app uses.
8. **Budget alerts:** Billing → Budgets & alerts on the project, even on the free tier.

### Store and consent
9. **OAuth consent screen:** Google Cloud console → Google Auth Platform → Branding: app name, support email, logo, home page `https://atlas-explain.web.app`, privacy and terms URLs (publish the final legal pages first) → Audience: Production → submit for verification if Google asks (basic scopes only: email, profile, openid).
10. **Chrome Web Store listing:** developer account (one-time US$5 fee, so only when you decide), upload `extension/atlas-explain-chrome.zip` (the build strips the manifest `key`), listing images from `store/` and every form answer from `docs/CHROME_STORE.md`, privacy practices form (declare: personally identifiable info only when signing in; website content = highlighted text), justify host permissions (`localhost:3000`, `atlas-explain.web.app`), single purpose: explain trading terms for education.
11. **Privacy policy and terms review:** finish every `[TODO]` in `docs/legal/`, have them reviewed, publish at stable URLs, and remove the DRAFT labels in `src/wallet/legal.ts`.

### Data licensing (required before a market launch; not required for the hackathon demo)
12. **Licensed price feed.** Remote Config `price_provider` defaults to `kraken`. Before a public market launch, set it to `coingecko` and obtain a paid CoinGecko commercial plan (attribution is already shown), or keep Kraken only after written consent. Optional: set `coingecko_demo_api_key` in Remote Config (never commit a key). See `docs/legal/DATA_SOURCES.md`. Do not train any model on these feeds.

### After judging
13. **Billing switch-on:** follow "Go-live" in `docs/MONETIZATION.md` (Stripe account, Payment Links, portal link, read-only key, GitHub secret and variable, test purchase), then flip Remote Config `billing_enabled` to `true`. No Blaze plan needed.
14. **Monitoring sink:** add a real sink (for example Firebase Analytics or Sentry) with `addMonitorSink` and mention it in the privacy policy.

## Added in the production pass (November 2026)

### Owner steps (free)
- [ ] **GitHub secrets** for the market-data job: `FIREBASE_SERVICE_ACCOUNT`, `SEC_USER_AGENT` ("ATLAS Explain you@yourdomain"), optional `EIA_API_KEY`.
- [ ] **Remote Config**: `price_provider` = `coingecko`; optional `logo_dev_token` (Logo.dev publishable key, `pk_…`).
- [ ] **Analytics (optional)**: link Google Analytics to the Firebase project, set data retention to 2 months, then set Remote Config `analytics_enabled` = `true`. The web app then asks each visitor once; nothing loads before that.
- [ ] **Legal**: add the operator's legal name and a privacy/support email to `/privacy` and `/terms`, then go through docs/legal/REVIEW_NOTES.md with a lawyer.
- [ ] **Chrome Web Store**: developer account (US$5), listing, screenshots retaken after these PRs, and set `CHROME_STORE_URL` in `src/core/links.ts` once the listing is live.
- [x] **Hosted MCP server** (live 15 Nov 2026 at https://atlas-explain-mcp.atlas-explain.workers.dev/mcp?v=2, verified in Claude) (free Cloudflare account, no card): `npx wrangler@4 login`, `npm run deploy:mcp`, then set `MCP_URL` in `src/core/links.ts` (`docs/MCP.md`).
- [x] **Blaze plan**: decided against on 14 Nov 2026 (no card on file). Paid plans run without it; see `docs/MONETIZATION.md`.
- [ ] **Gemini free tier and Europe**: decide how to handle the EEA, Switzerland and the UK, where the free tier may not be used for the cloud fallback (`docs/legal/REVIEW_NOTES.md` point 11).

### Before charging money
- [ ] A commercial licence for crypto prices (CoinGecko paid plan) if crypto stays part of what Pro sells; see docs/ux/MULTI_ASSET_CATALOG.md §9.
- [ ] Stripe and GitHub setup, a dry run of the plan sync job, and a test purchase (`docs/MONETIZATION.md`, steps 2 to 9).
- [ ] Set `pro_cloud_daily_limit` to what the Gemini quota page shows the project can serve.
- [ ] Later, if revenue allows: Blaze plan and a server-side cloud quota instead of the app's own counter.

### Checks that now run automatically
- `npm run release:check`: types, lint, tests (including the design-system, privacy-surface and bundle-size guards), both builds, manifest least-privilege, bundle budget, npm audit, trade-word scan.
- `npm run test:rules` (CI job "rules"): Firestore rules on the emulator.

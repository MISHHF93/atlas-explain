# #BuildHybridAI submission checklist

Deadline: **30 Nov 2026, 2:00 PM PT** (5:00 PM America/Toronto). Submit on Devpost: https://firebasehybridaihackathon.devpost.com/

The write-up and demo should match the app as it ships today: a hosted read-only MCP connector for AI assistants (the lead), a public hybrid web app, a connectors library that talks to local ATLAS over public MCP (with a REST fallback), and an honest header that never pretends to be connected.

## Must have

- [x] Public repo: https://github.com/MISHHF93/atlas-explain (Apache-2.0, `LICENSE` at the root).
- [x] Hosted app live: https://atlas-explain.web.app (run `npm run release:check`, then deploy hosting).
- [x] Firebase AI Logic hybrid inference is the core path: `InferenceMode.PREFER_ON_DEVICE` in `src/platform/web/explainer.ts`; the badge reads `response.inferenceSource`.
- [ ] Demo video (about 3 minutes), following [DEMO.md](DEMO.md), with the on-device badge visible at least once. This has to be recorded on the presenter's laptop with Chrome and Gemini Nano; the shot list and setup steps are in that file.
- [x] README explains hybrid use, setup, limitations, connectors, and honest header states (see the sections in the root README).
- [ ] Devpost text states: education only, not investment advice, no buy/sell instructions. Draft ready to paste: [DEVPOST.md](DEVPOST.md) (written 15 Nov 2026; re-read it against the app before submitting).
- [x] Billing stays off: Remote Config `billing_enabled` is `false` in `remoteconfig.template.json` and in the console.

## Product features the write-up must name

Keep this list in the Devpost description so the submission matches the tree:

- **AI-assistant connector (MCP).** A free, read-only MCP server on Cloudflare's free plan (`src/mcp/`), with seven tools that match the app, structured output, an interactive chart (MCP Apps), prompts and the glossary as resources. It supports MCP 2026-07-28 and earlier versions, reads only ATLAS Explain's own data site, is listed in the official MCP Registry (`io.github.MISHHF93/atlas-explain`) and was submitted to Claude's connectors directory. Setup: https://atlas-explain.web.app/connect.
- **One way in.** The website's only button into the product is **Get started**: it leads to the Sign in page (Google or a one-time email link; a free account is required for the web app), then to Get started, which offers the AI-assistant connector or the web app. The connector and its setup page need no account.
- **One codebase, two ways in.** The MCP connector (`src/mcp/`) and the web app on one page (Explain, Today, Learn, Assets) share the glossary, the data readers and the education rules. The Chrome extension was removed on 15 Nov 2026 (owner decision: the product is the connector).
- **Hybrid inference.** Chrome tries Gemini Nano on the device first (`PREFER_ON_DEVICE`). The badge is `response.inferenceSource`, not a guessed label.
- **Connectors library.** `src/connectors/` (documented in [connectors/README.md](connectors/README.md)) is this repo's path, separate from the private ATLAS desk. The ATLAS-local connector prefers `POST /api/mcp/public` and falls back to `GET /api/explain/assets`.
- **Honest header states.** The pill is one of: `Live prices` (the public price feed answered; https://atlas-explain.web.app never calls localhost), `ATLAS connected` (a loopback probe actually answered), `ATLAS desk` (this tab is the Markets desk) or `Offline`. With nothing to report it is hidden. It does not fake a connection, and ATLAS-only parts stay hidden for everyone without ATLAS.
- **Education-only boundary.** No balances, account ids, positions, or keys cross into Explain. Deep links, postMessage, and MCP responses are stripped to public move-card and catalog fields.
- **Desk hand-off.** The private ATLAS desk can open this app with `#c=` / `#card=` / `#concept=` and an "Explain this move" link. Loading a card does not auto-run the model.

## Privacy and safety checks before recording

Checked on 15 Nov 2026 against the builds (re-run `npm run release:check` before recording):

- [ ] No balances, account numbers, positions or keys appear in any screen or prompt. (The code never reads them; check the recording itself.)
- [x] `npm run check:trade-words` passes.
- [x] No App Check debug token in the production build: the web app only accepts one in development builds. Keep it out of the video too.
- [x] No secret keys in any build (no Stripe or other secret keys; the Firebase web API key is public by design and restricted by App Check).
- [ ] No private ATLAS code, models, signals or data in this repo. The desk is shown only as a running app on the presenter's own computer.

## Nice to have

- [ ] Short GIF of the connector chart in the README.
- [ ] A screenshot set in the README (see `docs/screenshots/` once captured).

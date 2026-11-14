# #BuildHybridAI submission checklist

Deadline: **30 Nov 2026, 2:00 PM PT** (5:00 PM America/Toronto). Submit on Devpost: https://firebasehybridaihackathon.devpost.com/

The write-up and demo should match the app as it ships today: a public hybrid explainer, a connectors library that talks to local ATLAS over public MCP (with a REST fallback), and an honest header that never pretends to be connected.

## Must have

- [x] Public repo: https://github.com/MISHHF93/atlas-explain (Apache-2.0, `LICENSE` at the root).
- [x] Hosted app live: https://atlas-explain.web.app (run `npm run release:check`, then deploy hosting).
- [x] Firebase AI Logic hybrid inference is the core path: `InferenceMode.PREFER_ON_DEVICE` in `src/platform/web/explainer.ts`; the badge reads `response.inferenceSource`.
- [x] Extension zip built: `npm run build:extension` -> `extension/atlas-explain-chrome.zip`, loads unpacked with no errors.
- [ ] Demo video (about 3 minutes), following [DEMO.md](DEMO.md), with the on-device badge visible at least once. This has to be recorded on the presenter's laptop with Chrome and Gemini Nano; the shot list and setup steps are in that file.
- [x] README explains hybrid use, setup, limitations, connectors, and honest header states (see the sections in the root README).
- [ ] Devpost text states: education only, not investment advice, no buy/sell instructions.
- [x] Billing stays off: Remote Config `billing_enabled` is `false` in `remoteconfig.template.json` and in the console.

## Product features the write-up must name

Keep this list in the Devpost description so the submission matches the tree:

- **Hybrid inference.** Chrome tries Gemini Nano on the device first (`PREFER_ON_DEVICE`). The badge is `response.inferenceSource`, not a guessed label.
- **Connectors library.** `src/connectors/` (documented in [connectors/README.md](connectors/README.md)) is this repo's path, separate from the private ATLAS desk. The ATLAS-local connector prefers `POST /api/mcp/public` and falls back to `GET /api/explain/assets`.
- **Honest header states.** The pill is one of: `Live prices` (the public price feed answered; https://atlas-explain.web.app never calls localhost), `ATLAS connected` (a loopback or extension probe actually answered), `ATLAS desk` (this tab is the Markets desk) or `Offline`. With nothing to report it is hidden. It does not fake a connection, and ATLAS-only parts stay hidden for everyone without ATLAS.
- **Education-only boundary.** No balances, account ids, positions, or keys cross into Explain. Deep links, postMessage, and MCP responses are stripped to public move-card and catalog fields.
- **Desk hand-off.** The private ATLAS desk can open this app with `#c=` / `#card=` / `#concept=` and an "Explain this move" link. Loading a card does not auto-run the model.

## Privacy and safety checks before recording

- [ ] Extension reads only the highlight, the title and the site name (`check:manifest` passes; no `content_scripts`, no broad hosts).
- [ ] No balances, account numbers, positions or keys appear in any screen or prompt.
- [ ] `npm run check:trade-words` passes.
- [ ] No App Check debug token in the store build or in the video.
- [ ] No private ATLAS code, models, signals or data in this repo. The desk is shown only as a running app on the presenter's own computer.

## Nice to have

- [ ] Chrome Web Store listing (images in `store/`; listing text and answers in `docs/CHROME_STORE.md`).
- [ ] Short GIF of the highlight flow in the README.
- [ ] A screenshot set in the README (see `docs/screenshots/` once captured).

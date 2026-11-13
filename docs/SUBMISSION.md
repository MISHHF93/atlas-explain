# #BuildHybridAI submission checklist

Deadline: **30 Nov 2026, 2:00 PM PT** (5:00 PM Toronto). Submit on Devpost: https://firebasehybridaihackathon.devpost.com/

## Must have

- [ ] Public repo: https://github.com/MISHHF93/atlas-explain (Apache-2.0, `LICENSE` at the root).
- [ ] Hosted app live: https://atlas-explain.web.app (run `npm run release:check`, then deploy hosting).
- [ ] Firebase AI Logic hybrid inference is the core path: `InferenceMode.PREFER_ON_DEVICE` in `src/platform/web/explainer.ts`; the badge reads `response.inferenceSource`.
- [ ] Extension zip built: `npm run build:extension` → `extension/atlas-explain-chrome.zip`, loads unpacked with no errors.
- [ ] Demo video (about 3 minutes), following [DEMO.md](DEMO.md), with the on-device badge visible at least once.
- [ ] README explains hybrid use, setup, and limitations (see the sections in the root README).
- [ ] Devpost text states: education only, not investment advice, no buy/sell instructions.
- [ ] Billing stays off: Remote Config `billing_enabled` is `false` in `remoteconfig.template.json` and in the console.

## Privacy and safety checks before recording

- [ ] Extension reads only the highlight, the title and the site name (`check:manifest` passes; no `content_scripts`, no broad hosts).
- [ ] No balances, account numbers, positions or keys appear in any screen or prompt.
- [ ] `npm run check:trade-words` passes.
- [ ] No App Check debug token in the store build or in the video.
- [ ] No private ATLAS code, models, signals or data in this repo. The desk is shown only as a running app on the presenter's own computer.

## Nice to have

- [ ] Chrome Web Store listing (images in `extension/store/`).
- [ ] Short GIF of the highlight flow in the README.
- [ ] A dark-mode screenshot set.

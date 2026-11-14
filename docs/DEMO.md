# ATLAS Explain demo script

About three minutes. A real on-device recording has to be made on the presenter's laptop in Chrome (139 or newer) with Gemini Nano available. This repository can script the shots and host the app; it cannot produce the Nano badge from a cloud or remote session.

Every screen below is in the shipped build. Nothing is mocked. Education only: never say buy, sell, or "signal to trade."

## Why this has to be recorded on the laptop

On-device inference needs:

- Chrome on desktop, version 139 or newer
- `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` set to **Enabled**, then a Chrome restart
- Gemini Nano actually present (`await LanguageModel.availability()` is `available`, or `downloadable` followed by `await LanguageModel.create()`). The first download can take several minutes and needs a user gesture.

If Nano is missing, the badge will honestly say **Cloud**. Do not edit the badge, do not splice a fake "On-device" label, and do not record until Nano is ready if the submission requires that badge.

## Before recording

1. Update Chrome, flip the Prompt API flag, restart, and confirm Nano:
   - Open DevTools on a normal tab and run `await LanguageModel.availability()`.
   - If the result is `downloadable`, run `await LanguageModel.create()` and wait until it finishes.
   - If the result is `unavailable`, stop and fix Chrome; do not record the on-device segment.
2. `npm run build:extension`, then load `extension/dist` unpacked in `chrome://extensions` (Developer mode).
3. Open the practice page: https://atlas-explain.web.app/demo/trading-terms.html (static text, no prices, no account).
4. For the desk segment: start the private ATLAS desk at `http://localhost:3000/markets` with the usual deploy script. Without it, skip shots 1-3 and use the deep-link fallback in shot 1b.
5. For the "ATLAS connected" header: either use the loaded extension on a loopback page, or open a local Explain preview at `http://localhost:4173/` (not `127.0.0.1`, if the preview bound only to localhost). Dismiss any first-run onboarding (`.ob-skip`) so the header pill is visible.
6. For the hosted header: open https://atlas-explain.web.app in a clean tab. The pill reads "Live prices"; the web app never calls localhost, and the ATLAS-only parts are hidden.
7. Close password managers, email, vault windows, and any ATLAS panel that could show balances, keys, or account numbers.
8. Turn off the App Check debug token overlay if it is visible. Do not show `.env`, DevTools with secrets, or Credential Manager.

Keyboard shortcuts in the shipped extension (see `extension/manifest.json`):

- `Alt+Shift+E` opens the Explain popup.
- `Alt+Shift+X` explains the highlighted text on this tab.

## Shot list

Times are a guide. Keep the total near three minutes. If a shot fails, retake that shot; do not leave a wrong header or a cloud badge in the on-device segment.

| Shot | Time | Where | Do | Must be visible | Say |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00-0:10 | `http://localhost:3000/markets` | Select one market (for example BTCUSDT). | Markets desk, paper-only chrome, no account balances. | "ATLAS is my private paper-only research desk. It never places orders." |
| 2 | 0:10-0:22 | Same tab | Click **Explain this move** on the quote bar (or an Explain chip on a chart layer or Signal15 row). | A new tab or wallet opening `atlas-explain.web.app` with a public card. | "The desk sends a public move card only: symbol, percent move, volume. No balances, no account, no positions." |
| 3 | 0:22-0:28 | Explain wallet | Show the card loaded, model not yet run. Point at the **On-device ⇄ Cloud** strip. | Header pill, the strip reading **Gemini Nano ready**, card fields, **Explain the move** still idle. | "Before anything is sent, the strip shows Gemini Nano is ready on this device. Loading a card never runs the model by itself. I click." |
| 4 | 0:28-0:50 | Same wallet | Click **Explain the move**. Wait for the answer. | Badge **On-device / Gemini Nano** from `inferenceSource`. If it says Cloud, stop and retake after Nano is ready. | "Firebase AI Logic tries Gemini Nano on this device first, and Gemini in the cloud only if Nano is not ready. The badge is the SDK's own inferenceSource." |
| 5 | 0:50-1:10 | Scroll the answer | Point at three reasons on each side and "what would change." | Both-sided reasons, no trade instruction. | "Two sides on purpose: why some readers see a dip worth studying, why others see more risk. Never an instruction." |
| 1b | (fallback) | `https://atlas-explain.web.app/#concept=shadow` or a sample card | Use this only if the desk cannot be shown. | Glossary or sample card, **Live prices** pill on the hosted origin. | "Without the desk, a deep link or a sample card loads the same public envelope." |
| 6 | 1:10-1:18 | Practice page | Highlight "RSI(14) crossed above 70 while price tagged the upper Bollinger Band". | Practice page only; no prices, no account. | "Now any trading or charting page. I highlight one sentence." |
| 7 | 1:18-1:28 | Same page | Right-click -> **Explain with ATLAS Explain**, or press `Alt+Shift+X`. | Popup or wallet, source labeled from the site name. | "Only the highlighted text, the title, and the site name leave the page. The account panel next to it is never read." |
| 8 | 1:28-1:45 | Wallet answer | Let the answer finish, then tap **Explain simpler** under **Keep going**. | Badge, "Charting site" (or equivalent) source line, the follow-up chips and any **Related** glossary chips. | "The card says where it came from and which model answered. One tap asks for a simpler version, still on the device." |
| 9 | 1:45-1:58 | Practice page | Highlight "Stop-limit order" in the ticket help, explain again. | Same flow on a broker-style term, still no account fields. | "Same flow on a broker-style term." |
| 10 | 1:58-2:08 | Explain tab -> **Recent** | Open a previous item. | Recent list, no network spinner for the reopen. | "Recent explanations stay on this device. Tapping one reopens it without another model call." |
| 11 | 2:08-2:20 | Glossary -> **Learn path** -> **Got it** | Advance one step. | Glossary copy, progress on device. | "A short path through every term, progress kept on the device." |
| 12 | 2:20-2:32 | Hosted app tab | Show the header pill. | Pill text **Live prices**. | "The hosted web app never calls localhost. That is an honest header, not a failed connection." |
| 13 | 2:32-2:45 | Extension or local preview with ATLAS running | Show the header pill after a real probe. | Pill text **ATLAS connected** (or **ATLAS desk** if this tab is Markets). | "On this computer, the connectors library talks to ATLAS over public MCP, with a REST fallback, and the header says ATLAS local only when a probe answers." |
| 14 | 2:45-2:52 | Signal tab | Open **Why this colour?** | Grey light unless a model has cleared the evidence gate. Today that is usually grey. | "The light stays grey until a model clears the evidence gate. Grey is the honest answer." |
| 15 | 2:52-3:00 | Settings and disclaimer | Show the plan card and the footer line. | "Free during the hackathon. Billing is built in and switched off." Educational disclaimer visible. | "Educational information, not investment advice." |

## Desktop opening frame

On a desktop browser, https://atlas-explain.web.app now opens with the hybrid story beside the live wallet: the three-step route (your highlight, Gemini Nano on this device, Gemini in the cloud through Firebase AI Logic) and links to the extension and source. It is a good first frame for judges. Phones still get the full-screen wallet.

## Still frames for the README

Captured stills already in `docs/screenshots/`:

- `hosted-header.png` — hosted web app, pill **Live prices** (retake: the current still shows the earlier "Hosted app" label)
- `local-header.png` — local loopback build, pill **ATLAS connected**, after dismissing onboarding (retake: the current still shows "ATLAS local")
- `desk-explain-link.png` — Markets desk with **Explain this move** and **Concepts**
- `local-full.png` — Explain a move plus today's brief on a local build
- `hosted-full.png` — hosted app, today's digest not ready
- `glossary-shadow.png` — `#concept=shadow` educational question, nothing sent yet
- `highlight-practice.png` — practice page (static, no account fields)
- `signal-grey.png` — Signal tab, grey light, "Why this colour?"

Still waiting on a real take on the presenter's laptop with Gemini Nano:

- `on-device-badge.png` — wallet with the Nano badge and both-sided reasons (do not fabricate this badge)

Crop tightly. No secrets, no balances, no DevTools, no debug tokens.


## Words to avoid on camera

Do not say "buy", "sell", "signal to trade", "entry", or "target". Say "leans up / leans down / not enough evidence", "a case for, a case against".

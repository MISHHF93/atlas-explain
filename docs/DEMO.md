# ATLAS Explain demo script

About three minutes. A real on-device recording has to be made on the presenter's laptop in Chrome (139 or newer) with Gemini Nano available. This repository can script the shots and host the app; it cannot produce the Nano badge from a cloud or remote session.

Every screen below is in the shipped build (last checked against it on 15 Nov 2026, after the site went connector first and the Chrome extension was removed). Nothing is mocked. Education only: never say buy, sell, or "signal to trade."

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
2. Open https://atlas-explain.web.app/app in the same Chrome and dismiss the first-run steps.
3. Open https://atlas-explain.web.app/connect to copy the connector address.
4. Optional, for the desk segment only: start the private ATLAS desk at `http://localhost:3000/markets` with the usual deploy script. Without it, skip shots A1 to A3.
5. For the "ATLAS connected" header (desk segment only): open a local preview at `http://localhost:4173/app` (not `127.0.0.1`, if the preview bound only to localhost). Dismiss the first-run steps (the **Skip** button) so the header pill is visible.
6. For the hosted header: open https://atlas-explain.web.app/app in a clean tab and dismiss the first-run steps. The pill reads "Live prices"; the web app never calls localhost, and the ATLAS-only parts are hidden. If a cloud answer says the security check could not confirm this browser, reload once; App Check blocks automated browsers, so record in your normal Chrome.
7. For shots 3 to 5 (the AI-assistant connector): in Claude (claude.ai or the desktop app), add ATLAS Explain as a custom connector with the address on https://atlas-explain.web.app/connect, turn it on in a new chat, and run each prompt once beforehand so Claude doesn't ask for permission on camera. Check the answer shows the chart and a "Collected … by ATLAS Explain's data job" line from today; if it says the prices are hours or days old, refresh the data site first (docs/HANDOVER.md).
8. Close password managers, email, vault windows, and any ATLAS panel that could show balances, keys, or account numbers.
9. Turn off the App Check debug token overlay if it is visible. Do not show `.env`, DevTools with secrets, or Credential Manager.

## Shot list

Times are a guide. Keep the total near three minutes. If a shot fails, retake that shot; do not leave a wrong header or a cloud badge in the on-device segment.

The story is the public product: an MCP connector that brings plain-language market explanations into AI assistants, and a web app that explains on the device first with Gemini Nano and in the cloud only when it must, both from one codebase. The private ATLAS desk is an optional extra (shots A1 to A3 below); the demo works without it.

| Shot | Time | Where | Do | Must be visible | Say |
| --- | --- | --- | --- | --- | --- |
| 1 | 0:00-0:10 | https://atlas-explain.web.app (clean tab, desktop) | Open the home page. | "Market jargon, explained inside your AI assistant", the chart in a chat, **Add to your AI assistant**. | "ATLAS Explain turns market jargon into plain language, inside the AI assistant you already use." |
| 2 | 0:10-0:20 | https://atlas-explain.web.app/connect | Click **Copy** next to the connector address. | The address, and the steps for Claude, ChatGPT, Cursor and VS Code. | "One address. No account, no key, nothing to install." |
| 3 | 0:20-0:40 | Claude, with the ATLAS Explain connector on | Ask: "What is a stop-limit order? Use ATLAS Explain." | The `explain_term` tool step and a plain answer with the education line. | "Claude asks ATLAS Explain and answers in plain language. Education only, never an instruction." |
| 4 | 0:40-1:00 | Same chat | Ask: "Show me Bitcoin's price over the last 7 days with ATLAS Explain." | The `price_history` tool step, the interactive chart (hover to show the price readout, click **30D**), and the source line "Collected … by ATLAS Explain's data job … Prices: Kraken public market data". | "Prices and charts come with their source and time. It describes the past only, never a forecast." |
| 5 | 1:00-1:15 | Same chat | Ask: "What are Apple's latest official figures?" | The `official_figures` tool step with SEC EDGAR named as the source. | "Official figures come from government and regulator sources. Missing data stays missing, with the reason. It's read-only and listed in the official MCP Registry." |
| 6 | 1:15-1:40 | https://atlas-explain.web.app/app (desktop Chrome with Nano ready) | Type "RSI(14) crossed above 70 while price tagged the upper Bollinger Band" and press **Explain**. | The strip reading **On-device ready**, then the badge **On this device** and the line "Answered on your device with Gemini Nano. Nothing was sent." If it says Cloud, stop and retake after Nano is ready. | "Without an assistant, the web app does the same. Firebase AI Logic tries Gemini Nano on this device first, and Gemini in the cloud only if Nano is not ready. The badge is the SDK's own inferenceSource." |
| 7 | 1:40-1:55 | Same answer | Tap **Explain simpler** under **Keep going**. | The follow-up chips and any **Related** glossary chips; the answer refreshes. | "One tap asks for a simpler version, still on the device." |
| 8 | 1:55-2:05 | Web app, Explain | Scroll to **Recent** and open a previous item. | Recent list with a small remove button on each row; no spinner on reopen. | "Recent explanations stay on this device. Tapping one reopens it without another model call." |
| 9 | 2:05-2:20 | Web app, **Learn** | Open a term, then **Got it** on the learn path. | Glossary copy, progress kept on the device. | "A short path through every term, progress kept on the device." |
| 10 | 2:20-2:40 | Web app, **Assets** | Show Bitcoin and one stock. | Crypto with a price and its source; stocks with official SEC figures and "Price not shown" with the reason. Header pill **Live prices**. | "Every number names its source. Where a price is not licensed for public display, it says so instead of making one up." |
| 11 | 2:40-3:00 | Any screen | Hold on the footer. | "Educational information, not investment advice." | "Educational information, not investment advice." |

### Optional ATLAS desk segment (skip if the desk is not running)

Only for a presenter who runs the private desk at `http://localhost:3000/markets`. Never show balances or accounts. Without the desk, skip A1 to A3.

| Shot | Time | Where | Do | Must be visible | Say |
| --- | --- | --- | --- | --- | --- |
| A1 | +0:10 | `http://localhost:3000/markets` | Select one market (for example BTCUSDT). | Markets desk, paper-only chrome, no account balances. | "ATLAS is my private paper-only research desk. It never places orders." |
| A2 | +0:12 | Same tab | Click **Explain this move** on the quote bar. | A new tab opening `atlas-explain.web.app` with a public card, not yet run. | "The desk sends a public move card only: symbol, percent move, volume. No balances, no account, no positions. Loading a card never runs the model by itself." |
| A3 | +0:15 | Local preview with ATLAS running | Show the header pill after a real probe, then the **Signal** tab and **Why this colour?** | Pill **ATLAS connected** (or **ATLAS desk** on the Markets tab); a grey light unless a model has cleared the evidence gate. | "On this computer the pill says ATLAS connected only when a probe answers. The light stays grey until a model clears the evidence gate. Grey is the honest answer." |

## Desktop opening frame

https://atlas-explain.web.app opens with the home page: "Market jargon, explained inside your AI assistant", the Bitcoin chart inside a chat, **Add to your AI assistant**, how the connector works, and a short web-app section showing the hybrid route (what you type, Gemini Nano on this device, Gemini in the cloud through Firebase AI Logic). It is a good first frame for judges.

## Still frames for the README

Stills in `docs/screenshots/`. `site-home`, `site-connect`, `signin`, `hosted-header` and `hosted-full` are captured from the live site by `node store/src/capture-site.mjs` (last run 16 Nov 2026, after the site went connector first and the extension was removed); `local-header.png` and `desk-explain-link.png` are older:

- `site-home.png`: the website home page, connector first
- `site-connect.png`: ATLAS Explain for AI assistants (/connect), with the connector address
- `signin.png`: the Sign in page (/signin)

- `hosted-header.png` — hosted web app, pill **Live prices**, header links Today, Learn and Assets
- `local-header.png` — local loopback build, pill **ATLAS connected** (retake with ATLAS running: it predates the one-page layout and shows "ATLAS local"; load the app at `http://localhost:5173`, not `[::1]`, since the app looks for ATLAS only on `localhost` and `127.0.0.1`)
- `desk-explain-link.png` — Markets desk with **Explain this move** and **Concepts**
- `local-full.png` — Today on a local build with ATLAS: today's brief and the paper signal light
- `hosted-full.png` — hosted app, Today: the biggest crypto moves with source and time
- `glossary-shadow.png` — `#concept=shadow` educational question, nothing sent yet
- `signal-grey.png` — the paper signal light, grey, with "Why this colour?"

Still waiting on a real take on the presenter's laptop with Gemini Nano:

- `on-device-badge.png` — wallet with the Nano badge and both-sided reasons (do not fabricate this badge)

Crop tightly. No secrets, no balances, no DevTools, no debug tokens.


## Words to avoid on camera

Do not say "buy", "sell", "signal to trade", "entry", or "target". Say "leans up / leans down / not enough evidence", "a case for, a case against".

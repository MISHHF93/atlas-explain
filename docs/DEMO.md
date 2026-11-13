# ATLAS Explain demo script

About three minutes. Record in Chrome on desktop (139 or newer) with the Prompt API flag on, so the on-device path is real. Every screen below is in the shipped build; nothing is mocked.

Before recording:

1. `npm run build:extension`, then load `extension/dist` unpacked in `chrome://extensions`.
2. Open the practice page: https://atlas-explain.web.app/demo/trading-terms.html (static text, no prices, no account).
3. Optional, for the desk segment: the private ATLAS desk running at `http://localhost:3000/markets`. Without it, skip part 1; the deep link in part 1b shows the same hand-off.

## Part 1. Desk → Explain (0:00–1:10)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | ATLAS Markets desk, one market selected | "ATLAS is my private paper-only research desk. It never places orders." |
| 0:10 | Click **Explain this move** on the quote bar (or an Explain chip on a chart layer or Signal15 row) | "The desk sends a public move card only: symbol, percent move, volume. No balances, no account, no positions." |
| 0:22 | The Explain wallet opens with the card loaded, not yet run | "Loading a card never runs the model by itself. I click." |
| 0:28 | Click **Explain the move** | "Firebase AI Logic tries Gemini Nano on this device first, and Gemini in the cloud only if Nano is not ready." |
| 0:40 | Point at the badge (**On-device · Gemini Nano** or **Cloud**) | "The badge is the SDK's own inferenceSource, so it names the path that actually ran." |
| 0:50 | Scroll the three buyer reasons, three seller reasons, and what would change | "Two sides on purpose: why some readers see a dip worth studying, why others see more risk. Never an instruction." |

**1b (no desk):** paste a deep link such as `https://atlas-explain.web.app/#concept=shadow`, or pick a sample card in the web app.

## Part 2. Highlight on a trading page (1:10–2:20)

| Time | Show | Say |
| --- | --- | --- |
| 1:10 | The practice page; highlight "RSI(14) crossed above 70 while price tagged the upper Bollinger Band" | "Now any trading or charting page. I highlight one sentence." |
| 1:18 | Right-click → **Explain with ATLAS Explain** (or `Alt+Shift+X`) | "Only the highlighted text, the title, and the site name leave the page. The account panel next to it is never read." |
| 1:28 | The wallet drops down with the answer | "The card says where it came from (*Charting site*) and which model answered." |
| 1:45 | Highlight "Stop-limit order" in the ticket help, explain again | "Same flow on a broker-style term." |
| 1:58 | Explain tab → **Recent** | "Recent explanations stay on this device. Tapping one reopens it without another model call." |
| 2:08 | Glossary → **Learn path** → **Got it** | "A short path through every term, progress kept on the device." |

## Part 3. Signal light and close (2:20–3:00)

| Time | Show | Say |
| --- | --- | --- |
| 2:20 | Header light, **Signal** tab, **Why this colour?** | "With the desk open, the light shows whether ATLAS's shadow models lean up or down. It stays grey until a model clears the evidence gate. Today it is grey, honestly." |
| 2:40 | Settings → plan card | "Free during the hackathon. Billing is built in and switched off." |
| 2:50 | Disclaimer line | "Educational information, not investment advice." |

## Words to avoid on camera

Do not say "buy", "sell", "signal to trade", "entry", or "target". Say "leans up / leans down / not enough evidence", "a case for, a case against".

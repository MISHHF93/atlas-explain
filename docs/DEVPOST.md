# Devpost write-up (draft, ready to paste)

For the #BuildHybridAI submission (deadline 30 Nov 2026, 2:00 PM PT; category: Best Web/Chrome). Written against the official judging criteria (Technological Implementation, Design, Potential Impact, Quality of the Idea) and the required items: how Firebase AI Logic is used, features, value, and a summary of what was built during the submission period. Every claim below is in the shipped product as of 16 Nov 2026; re-read it against the live app before submitting, fill in the [brackets], and add the demo video link. Education only: the write-up never tells anyone to trade.

---

## Tagline

Market jargon in plain language, answered on your own device first with Gemini Nano, and in the cloud only when it must.

## Inspiration

Trading screens, news and filings are full of words beginners can't decode: "stop-limit", "bid-ask spread", "yield curve", "IV crush". The people most likely to look them up are the ones most exposed to bad advice: new investors reading a broker's order ticket or a headline for the first time. Most tools that explain these words either push a trade, invent numbers, or send everything you type to a server.

We wanted the opposite: a calm explainer that answers on your own computer whenever it can, tells you plainly when it can't, shows both sides, and never tells anyone what to buy or sell. Hybrid inference with Firebase AI Logic made that possible in a normal web page.

[Your own line: why this matters to you, or the moment you hit this problem yourself.]

## Who it's for

- **New investors** decoding a term on an order ticket, a chart or a headline, who want the meaning and the trade-offs, not a tip.
- **People who care where their words go:** answers run on their own device whenever it can, and private notes about their own situation never leave it.
- **Anyone using an AI assistant** (Claude, ChatGPT, Cursor, VS Code), who can ask the same sourced questions there.

[If you have them: a real example of someone using it, a quote, or numbers. Leave this out rather than guess.]

## What it does

ATLAS Explain is a web app at https://atlas-explain.web.app/app. Type or paste any term, sentence or headline and press **Explain**:

- **On your device first.** In desktop Chrome, Gemini Nano writes the answer locally and nothing is sent. When Nano isn't available (a phone, another browser, a model still downloading), Gemini answers in the cloud instead. **Every answer is labelled "On this device" or "Cloud"**, straight from the SDK, never guessed.
- **Two sides, never a tip.** Answers come as a plain summary, reasons a buyer might weigh, reasons a seller might weigh, and what would change the picture. Requests for a trade decision are refused and explained instead.
- **Keep going.** One tap asks to explain it simpler, give an example, or say why it matters; related glossary terms are offered as chips. Recent answers reopen instantly, from this device, without another model call.
- **Today, Learn and Assets.** Live crypto prices (streaming in real time while the page is open), today's official press releases and headlines, a plain-language learning path with diagrams, and about 30 large US companies and ETFs with their SEC-filed figures, currencies, bond yields and energy prices. Every number names its source and time; missing data says why.
- **The same knowledge in AI assistants.** A free, read-only MCP connector gives Claude, ChatGPT, Cursor and VS Code the same glossary, figures, prices and charts, with sources. It's listed in the official MCP Registry.

The web app needs a free account (Google or a one-time email link), which keeps saved explanations and settings on every device. The connector needs none.

What it never does: read balances, account numbers or positions; make up a number; forecast a price; or tell anyone to trade.

## How we built it: Firebase AI Logic hybrid inference

- **Hybrid by default.** `getGenerativeModel` runs with `InferenceMode.PREFER_ON_DEVICE` (`src/platform/web/explainer.ts`). Chrome's Prompt API runs Gemini Nano when it is ready; otherwise the same request goes to Gemini in the cloud. The badge reads `response.inferenceSource`, so it always shows the path that actually ran.
- **Privacy routing.** Under Explain, "Explain a market move, with private notes" lets anyone pick a real sample move (Nvidia's DeepSeek drop, the April 2025 tariff selloff) and add private notes and a watchlist. They are only ever included in on-device prompts: if the answer has to come from the cloud, they are dropped first, and the answer says so (`src/core/prompt.ts`, `src/core/inference-path.ts`). We think this is the most useful thing hybrid inference makes possible: the private part of a question never leaves the device.
- **Structured output on both paths.** The model returns a typed two-sided answer (summary, buyer reasons, seller reasons, what would change) on the device and in the cloud, and the app falls back to plain text if a model breaks the shape.
- **No endless spinners.** Nano can be "downloadable" for minutes. The app never waits on a model download: after a deadline the cloud answers while Chrome keeps downloading, and the next answer can be on the device.
- **The rest of Firebase:** App Check with reCAPTCHA Enterprise is enforced on AI Logic, so only our site can spend cloud calls; Remote Config holds the inference mode, the cloud model, the prompt template and the on-device limits, so they change without a release; Authentication (Google and email link); Firestore with owner-only rules for saved explanations; Hosting. All on the free Spark plan.
- **Live data with sources.** A Cloudflare Worker captures official figures (US Treasury, ECB, Bank of Canada, SEC EDGAR), official press releases (Federal Reserve, SEC, CFTC, ECB) and crypto prices into one data address, refreshed whenever someone visits; the web app and the connector read the same copy, so they always agree.
- **Guards in the build:** one release check runs types, lint, about 480 tests, the builds, a bundle budget, npm audit and a scan that fails the build on any trade-advice wording.

## What we built during the submission period

The whole project was built during the submission period: the repository's first commit is 12 Nov 2026, and every commit since (166 by 16 Nov) is in the contest window. In that time we built the hybrid explain path with Firebase AI Logic, the one-page web app, sign-in and saved explanations, App Check and Remote Config, the website, the MCP connector, the live data capture and real-time prices. Nothing was carried over from an earlier version.

ATLAS Explain can optionally read the public signal of the author's separate, private ATLAS research software when it runs on the same computer. That software is not part of this submission and none of its code is in this repository; for everyone else the integration is hidden.

**Tools:** built with the help of an AI coding assistant (Claude Code). [Add any other tools you used.]

## Challenges we ran into

- **Trusting the badge.** Labelling an answer "on your device" is only worth anything if it's true, so the label comes from the SDK's own `inferenceSource`, and private notes are stripped before any cloud fallback rather than after.
- **On-device without waiting.** Gemini Nano downloads on demand; we had to make on-device the default without ever leaving someone staring at a spinner.
- **Honesty under real-world data.** Free stock prices can't be shown publicly, so stocks show their official SEC figures and say why there's no price; prices that stop refreshing say how old they are.

## Accomplishments we're proud of

- The badge always tells the truth about where the answer ran, and the private part of a question never leaves the device.
- A complete product, not a demo: website, app, sign-in, live data and an AI-assistant connector, all at zero running cost.
- Every number on screen names its source and time.

## What we learned

Hybrid AI is as much a product decision as a technical one. Telling people where an answer ran, and what data it used, builds more trust than any amount of polish.

## What's next

An Android build with Firebase AI Logic's hybrid API (Gemini Nano through ML Kit), a commercial licence for crypto prices before any paid plan, and more of the learning path.

## Built with

Firebase AI Logic, Gemini Nano (Chrome Prompt API), Gemini, Firebase App Check, reCAPTCHA Enterprise, Firebase Remote Config, Firebase Authentication, Cloud Firestore, Firebase Hosting, TypeScript, Vite, Cloudflare Workers, Model Context Protocol.

## Testing instructions

Open https://atlas-explain.web.app and press **Get started**. Sign in with any Google account, or ask for a one-time email link; no password is needed and nothing is charged. Then choose **Open the web app**. For the on-device answer, use desktop Chrome with Gemini Nano available; elsewhere the cloud answers and the badge says so. The AI-assistant connector needs no account: add https://atlas-explain-mcp.atlas-explain.workers.dev/mcp in Claude or another assistant (steps at /connect).

## Links

- Try it: https://atlas-explain.web.app (press Get started, then sign in with any Google account or a one-time email link)
- Website: https://atlas-explain.web.app
- Source (Apache-2.0): https://github.com/MISHHF93/atlas-explain
- AI-assistant connector: https://atlas-explain.web.app/connect
- Demo video: (add the YouTube link)

Educational information, not investment advice. ATLAS Explain never tells anyone to trade.

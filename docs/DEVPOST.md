# Devpost write-up (draft, ready to paste)

For the #BuildHybridAI submission (deadline 30 Nov 2026, 2:00 PM PT). Every claim below is in the shipped product as of 15 Nov 2026; re-read it against the live app before submitting, and add the demo video link. Education only: the write-up never tells anyone to trade.

---

## Tagline

Market jargon in plain language, inside your AI assistant, and on your own device first in the web app.

## Inspiration

Trading screens, news and filings are full of words beginners can't decode: "stop-limit", "bid-ask spread", "yield curve", "IV crush". Most tools that explain them either push a trade, invent numbers, or send everything you read to a server. We wanted the opposite: a calm explainer that uses only what you ask about, shows both sides, names every source, and runs on your own computer whenever it can.

## What it does

ATLAS Explain explains market jargon in plain language, with two sides and never an instruction. It ships two ways, built from one codebase:

- **AI-assistant connector.** A free, read-only MCP server that Claude, ChatGPT, Cursor and VS Code can add by URL. Seven tools (explain a term, browse the learning path, what an asset is, official figures, crypto prices, price history, today's headlines), each answer with its source and time, typed JSON for agents, and an interactive price chart in assistants that support MCP Apps. It's listed in the official MCP Registry.
- **Web app** (atlas-explain.web.app/app). Type or paste anything; Gemini Nano answers on the device when Chrome has it, otherwise Gemini answers in the cloud, and every answer says which one ran. One page: Explain, Today (the biggest crypto moves and recent headlines, each with source and time), Learn (a plain-language learning path and glossary, with diagrams), and Assets (crypto, about 30 large US companies and ETFs with their SEC-filed figures, currencies, government bond yields, energy prices). Sign-in is optional (Google or a one-time email link) and only keeps your saved explanations across devices.

What it never does: read balances, account numbers, positions or form fields; make up a number (missing data says why); forecast a price; or tell anyone to trade.

## How we built it

- **Firebase AI Logic hybrid inference** is the core path: `InferenceMode.PREFER_ON_DEVICE` tries Gemini Nano in Chrome first and falls back to Gemini in the cloud. The "On this device" / "Cloud" badge is the SDK's own `inferenceSource`, never a guess.
- **One codebase.** The connector and the web app share the glossary, the data readers and the education rules, so they never drift apart.
- **Firebase** for hosting, Authentication (Google and email link), Firestore with owner-only rules, Remote Config and App Check, all on the free Spark plan.
- **Free and official data only.** A Cloudflare cron captures US Treasury, ECB, Bank of Canada, EIA and SEC EDGAR figures, GDELT headlines, and crypto prices (Kraken, with CoinGecko as backup) into one data address that the web app and the connector both read, so they always show the same numbers. Every value carries its source, licence and time; anything missing is shown as missing, with the reason.
- **The MCP connector** runs on Cloudflare Workers' free plan in TypeScript with no dependencies, reuses the app's own readers, and reads only the data it captures itself. It supports the newest MCP spec (2026-07-28, stateless) alongside earlier versions.
- **Guards in the build:** a release check runs types, lint, more than 500 tests, both builds, a bundle budget, npm audit and a scan that fails the build on any trade-advice wording.

## Challenges we ran into

- Making on-device the default without endless spinners: Nano can be "downloadable" for minutes, so answers fall back to the cloud on a deadline while Chrome keeps downloading, and the app never waits on a model download.
- Honesty under real-world data: free stock prices can't be shown publicly, so stocks show their official SEC figures and say why there's no price. Prices that stop refreshing say how old they are.
- Getting an authless MCP connector to work in Claude, which meant following the protocol to the letter (version negotiation, headers, discovery).

## Accomplishments we're proud of

- The badge always tells the truth about where the answer ran.
- One codebase serving an MCP connector and a web app, without forking either.
- Zero cost to run: free tiers and public data throughout, with no paid services.

## What we learned

Hybrid AI is as much a product decision as a technical one. Telling people where an answer ran, and what data it used, builds more trust than any amount of polish.

## What's next

Verified listing in the Claude connectors directory, a commercial licence for crypto prices before any paid plan, and more of the learning path.

## Built with

Firebase AI Logic, Gemini Nano (Chrome Prompt API), Gemini, Firebase Hosting, Firebase Authentication, Cloud Firestore, Remote Config, App Check, reCAPTCHA Enterprise, TypeScript, Vite, Model Context Protocol, MCP Apps, Cloudflare Workers, GitHub Actions.

## Links

- Live app: https://atlas-explain.web.app
- AI-assistant connector: https://atlas-explain.web.app/connect
- Source (Apache-2.0): https://github.com/MISHHF93/atlas-explain
- Demo video: (add the link)

Educational information, not investment advice. ATLAS Explain never tells anyone to trade.

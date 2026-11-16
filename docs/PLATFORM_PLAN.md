# Platform plan: ATLAS Explain as the education and data layer

**Written 16 Nov 2026 at the owner's request** ("figure out everything and plan it"). The owner wants trading bots and trading accounts considered as part of the picture, and noted that ATLAS's educational data can be reused as trading data by others.

## The one rule that shapes everything

ATLAS Explain **explains and publishes sourced data. It never trades, never connects to an account, and never says what to trade.** That is rules 1 and 2 of `docs/HANDOVER.md`, the Claude directory policy the owner acknowledged ("does not transfer money, cryptocurrency, or other financial assets on a user's behalf"), and what keeps ATLAS out of securities registration: executing or recommending trades for others in Ontario generally needs registration as a dealer or adviser.

So the design is **composition, not integration**: ATLAS is one part that other parts plug into, in one direction only.

```
                ┌─────────────────────────────── the user's AI assistant (Claude, ChatGPT, Cursor…) ─┐
                │                                                                                      │
  ATLAS Explain │  ← MCP: read-only tools, sourced data, charts      Broker or exchange's own connector → │ the user's account
  (this repo)   │                                                     (their product, their licence)    │
                └──────────────────────────────────────────────────────────────────────────────────────┘
        │
        └── /data/v1 JSON (read-only, credited) ──→  anyone's own tools, dashboards, research or bots
```

- **The assistant composes.** A user who also connects their broker's official connector can ask one question across both. The assistant does that; ATLAS never sees the account, the orders or the balances.
- **The data flows out, never in.** Bots, scripts and other tools may read ATLAS's published data, as people can today. ATLAS never receives account data from them.
- **Whoever trades carries the responsibility.** A bot that trades on ATLAS's data is the bot owner's product, under their terms, their licence and their risk. ATLAS's terms say the data is for information and education, and some sources say so too (the ECB's reference rates are "for information purposes only").

## What we build, by phase

| Phase | What | Who it serves | Status |
|---|---|---|---|
| A. Machine-readable ATLAS | A data index at `/data/v1/` listing every file, its schema version, refresh rate, sources, licence notes and "information, not for transactions"; stable schemas documented in `docs/DATA_API.md` | Developers, other tools, bots reading ATLAS data | **Building now** |
| A. Evidence brief | Connector tool `evidence_brief`: one asset's facts on one page: latest figure or price with source, recent move, the economic backdrop, news and official releases, liquidity (spread and depth for coins), terms to know, and "what this doesn't tell you". Structured output for agents. Never a verdict. | Everyone; agents that want one structured call | **Building now** |
| A. Composition guide | `/connect` and `docs/MCP.md`: how to use ATLAS next to other connectors (a broker's own, a news one), with the boundary stated | Users | **Building now** |
| B. Practice simulator | A practice portfolio with pretend money on live prices, in the web app and as connector tools: place practice orders (market, limit, stop), see fills against the real order book with slippage, and track the result. No real money, no accounts. | Learners | Planned; needs an owner decision on wording (see below) |
| C. Developer access | Free keyless use stays. Optional API keys with higher rate limits and a usage page, sold as a "Developer" add-on through the same Stripe and Worker billing | Developers, researchers | Planned; needs the data-licence review first |
| D. Read-only portfolio explainers | The user pastes or uploads their own holdings (no account link) and ATLAS explains what each holding is and its risks, without storing it | Learners with a portfolio | **Not planned**: it reads account details, against rule 2. Only if the owner changes rule 2 with a lawyer |
| — | Linking brokerage accounts, running trading bots, placing real orders, holding funds | — | **Never in ATLAS**: directory policy, rules 1 and 2, securities registration |

## Decisions the owner needs to make

1. **Practice simulator wording (phase B).** A practice simulator needs words like "buy" and "sell" for practice orders, which the trade-word scan blocks everywhere today. Options: allow them only inside the simulator, clearly labelled "practice, pretend money"; or use "go long / close" style wording. Recommendation: allow them inside the simulator only, with the scan updated to check that every such screen carries the practice label.
2. **Data licences before selling developer access (phase C).** Official sources (Treasury, BLS, ECB, Bank of Canada, Fed) allow reuse with credit. Kraken's and CoinGecko's public market data terms may not allow republishing to bots at scale, or commercially (`docs/legal/REVIEW_NOTES.md` item 12). Until a lawyer confirms, the data index marks those files' licence status, and developer access is not sold.
3. **Terms of use.** Add to `/terms`: published data is for information and education; it is not for transactions or trading decisions, and anyone who uses it in their own tools is responsible for how they use it. Needs the lawyer pass already on the checklist.

## How it makes money (fits `docs/PRICING.md`)

- Free stays generous: the connector, the data files, the web app.
- Pro (web app and premium connector tools) as planned. The evidence brief starts free; whether a deeper version becomes a premium connector tool is a later decision.
- Developer add-on (phase C): API keys, higher limits, usage reports, once the licences allow.

## What "done" looks like for phase A

- `GET /data/v1/` returns the index; each file listed is served; the index says what each source permits and that the data is not for transactions.
- `evidence_brief` answers for a coin, a stock, a currency and a rate, with every fact sourced, a "what this doesn't tell you" section, and no trade words; it is in `tools/list` and the docs.
- `/connect` explains using ATLAS alongside other connectors, and that ATLAS never sees accounts.
- release:check passes; the connector version goes to 1.7.0; the registry and the directory listing are updated with the owner's approval.

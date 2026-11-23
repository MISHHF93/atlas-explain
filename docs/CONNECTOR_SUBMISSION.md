# Claude connectors directory: submission answers

Everything the developer portal asks for, ready to paste. Submit at https://claude.ai/directory/manage, then **Submit new**, then **MCP connector**. Only the owner can submit: it needs a paid Claude plan and directory access for the account (https://claude.com/docs/directory/publish).

How listing works: Anthropic scans the submission and lists it as a **Community** connector. There is no application for **Verified**; Anthropic escalates listings it judges highly useful to a Verified review, in which a reviewer tests every tool. Nothing in this document needs credentials, and none should ever be put in the portal.

Checked against Anthropic's checklist (https://claude.com/docs/connectors/building/review-criteria) on 15 Nov 2026: every tool has a title and `readOnlyHint: true`; no tool writes, moves money or generates media; descriptions say what each tool does without instructing Claude; errors are specific ("ATLAS Explain's crypto data couldn't be loaded right now…"); answers are short and sourced.

## 1. Connection

- Server URL: `https://atlas-explain-mcp.atlas-explain.workers.dev/mcp`
- Users connect to one URL (not per-customer URLs).
- If the portal can't connect to that address from the owner's account (Claude kept a failed attempt for it in Nov 2026; see docs/MCP.md), use `https://atlas-explain-mcp.atlas-explain.workers.dev/mcp?v=2`, which is the same server.

## 2. Tools

Synced from the server (1.27.0, 23 Nov 2026): 24 read-only tools (`explain_term`, `browse_glossary`, `asset_details`, `official_figures`, `crypto_prices`, `price_history`, `todays_headlines`, `economy_snapshot`, `economic_calendar`, `market_depth`, `evidence_brief`, `notable_today`, `upcoming_events`, `money_maths`, `scam_red_flags`, `treasury_auctions`, `compare_countries`, `data_series`, `whats_changed`, `inflation_calculator`, `rate_change_impact`, `decision_explainer`, `speech_tracker`, `debt_payoff`), 11 prompts and 14 interactive views (MCP Apps). No write tools; every tool has a title, `readOnlyHint: true` and an output schema. After a new version, open the listing and choose "Sync from server" to refresh this list.

## 3. Listing

- **Server name:** ATLAS Explain
- **One-liner** (≤200): Market jargon in plain language: glossary terms, official figures with sources, crypto prices and charts, and today's headlines. Education only, never trade advice.
- **Description** (≤2,000):

  ATLAS Explain helps people understand markets without being told what to do. Ask Claude about a term, an asset or a move, and ATLAS Explain answers with plain language and named sources.

  - Explain any market term from a curated glossary (stop-limit order, bid-ask spread, yield curve and more), or follow the learning path topic by topic.
  - Look up what an asset is: its market, trading hours, and its latest official figure or price, or why no price is shown.
  - Official figures from free government and regulator sources: US Treasury yields (drawn as a yield curve in Claude), ECB and Bank of Canada rates, EIA energy prices, and SEC-filed figures for about 30 large US companies and ETFs.
  - Prices for ten major coins, refreshed about every 10 minutes, shown in Claude as a price board with 24-hour sparklines; choose a coin to see how it moved over 24 hours, 7 days or 30 days on an interactive chart.
  - The economy at a glance for the US, the euro area, Canada and the UK: inflation, unemployment and policy rates from each official agency, with a year of history, what changed since any date, central-bank statements and speeches, and the next rate decisions.
  - Calculators on your own numbers: what a rate change does to a mortgage or savings, what money from a past year is worth today, fees and compounding.
  - How trading works, with real numbers: a coin's bid-ask spread, its order book as a depth chart, and the slippage of filling different order sizes.
  - Today's market headlines and official press releases (Federal Reserve, SEC, CFTC, ECB, Bank of Canada, Bank of England), each linked to its publisher.

  Every answer names its source and time, says plainly when data is missing instead of filling the gap, and ends with "Educational information, not investment advice." It never recommends a trade and never forecasts prices. The connector is free, read-only, needs no account, and stores none of the requests it answers.

- **Categories** (1–5): Finance; Education; Research (pick the closest the portal offers).
- **Documentation URL:** https://atlas-explain.web.app/connect
- **Privacy policy URL:** https://atlas-explain.web.app/privacy#connector
- **Support contact:** owner to choose. Today the Support page sends people to GitHub issues (https://github.com/MISHHF93/atlas-explain/issues); a support email is listed as an owner step in docs/HANDOVER.md.
- **Icon:** leave it at the default. The server serves its own favicon and icons from its own address (`/favicon.ico`, `/icon.png` 512×512, `/icon.svg`, generated from public/logo.svg by `node scripts/write-mcp-icons.mjs`), and announces the PNG and SVG in its MCP `icons`. `store/connector/icon-512.png` is the same image if the portal asks for an upload anyway.
- **Slug** (permanent): `atlas-explain`

### Carousel screenshots (MCP Apps)

Five 1200px-wide PNGs in `store/connector/`, cropped to the app response, made by `node store/src/capture-connector.mjs` from the live server with real data. The portal needs them served over https from our own domain, so the same files are published at `https://atlas-explain.web.app/directory/<file>` (copied into `public/directory/`; re-copy and redeploy hosting after re-running the script). Entered in the portal on 16 Nov 2026.

| File | Prompt |
|---|---|
| chart-btc-7d.png | Show me Bitcoin's price over the last 7 days with ATLAS Explain. |
| crypto-board.png | What are the big crypto moves today? Use ATLAS Explain. |
| yield-curve.png | Show me the US Treasury yield curve with ATLAS Explain. |
| chart-sol-24h.png | Using ATLAS Explain, chart Solana over the last 24 hours. |
| chart-eth-30d.png | How has Ethereum moved over the last 30 days? Use ATLAS Explain. |

## 4. Use cases

- **Primary use cases:** learning market vocabulary; understanding what an asset is and where its numbers come from; checking official rates and company figures with sources; seeing how a coin moved recently; catching up on today's market headlines.
- **What users need first:** nothing. No account, plan or setup.
- **Reads or writes:** reads only.

## 5. Company

- **Company name:** ATLAS Explain
- **Website:** https://atlas-explain.web.app
- **Primary contact for review updates:** the owner's email (owner enters it; not stored in this repo).

## 6. Authentication

- **Authentication requirement:** none. All data is public.

## 7. Data handling

- **API ownership: "We own the API".** The connector reads only ATLAS Explain's own data, which the same Worker captures from public sources on a schedule and again when someone asks for stale data, and serves at /data/v1/: US Treasury, ECB, Bank of Canada, EIA, SEC EDGAR, official press releases (Federal Reserve, SEC, CFTC, ECB, Bank of Canada, Bank of England) with GDELT as an optional extra, the Bureau of Labor Statistics, the New York Fed, US Treasury Fiscal Data, the central banks' rate-decision calendars, and crypto prices and order books from Kraken (CoinGecko as backup). The server refuses to fetch any other address. Original sources are credited on every answer.
- **Personal health data:** no. **Sponsored content:** no.

## 8. Test & launch

Every tool, prompt and the chart were run against the live server on 15 Nov 2026 (curl, the repo's tests, a host harness for the chart), and the tools as a custom connector in Claude. Before submitting, the owner should reconnect the connector in Claude and run each tool once more from a chat, then tick the confirmation.

## 9. Compliance

All seven acknowledgments apply cleanly: directory guidelines; first-party API usage (own data site, credited public APIs); no financial transactions; no AI media generation; no prompt-injection patterns in descriptions; no conversation data collected; public documentation at the Support page.

## Risks a reviewer might raise

- **Domain:** the server runs on `atlas-explain.workers.dev` (Cloudflare's free subdomain), not on `atlas-explain.web.app`. The names match and both are linked from the Support page, but a custom domain would make the ownership plainer. That costs money, so it isn't done.
- **Original data sources:** the data site republishes public data with credit. The terms of Kraken's and CoinGecko's public market data are on the legal review list (docs/legal/REVIEW_NOTES.md, item 12).

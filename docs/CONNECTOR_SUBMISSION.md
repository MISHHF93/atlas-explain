# Claude connectors directory: submission answers

Everything the developer portal asks for, ready to paste. Submit at https://claude.ai/directory/manage, then **Submit new**, then **MCP connector**. Only the owner can submit: it needs a paid Claude plan and directory access for the account (https://claude.com/docs/directory/publish).

How listing works: Anthropic scans the submission and lists it as a **Community** connector. There is no application for **Verified**; Anthropic escalates listings it judges highly useful to a Verified review, in which a reviewer tests every tool. Nothing in this document needs credentials, and none should ever be put in the portal.

Checked against Anthropic's checklist (https://claude.com/docs/connectors/building/review-criteria) on 15 Nov 2026: every tool has a title and `readOnlyHint: true`; no tool writes, moves money or generates media; descriptions say what each tool does without instructing Claude; errors are specific ("neither CoinGecko nor Kraken answered…"); answers are short and sourced.

## 1. Connection

- Server URL: `https://atlas-explain-mcp.atlas-explain.workers.dev/mcp`
- Users connect to one URL (not per-customer URLs).
- If the portal can't connect to that address from the owner's account (Claude kept a failed attempt for it in Nov 2026; see docs/MCP.md), use `https://atlas-explain-mcp.atlas-explain.workers.dev/mcp?v=2`, which is the same server.

## 2. Tools

Synced from the server: 7 read-only tools (`explain_term`, `browse_glossary`, `asset_details`, `official_figures`, `crypto_prices`, `price_history`, `todays_headlines`), 3 prompts (`market_brief`, `explain_asset`, `learn_next`) and 1 resource (the `price_history` chart app). No write tools.

## 3. Listing

- **Server name:** ATLAS Explain
- **One-liner** (≤200): Market jargon in plain language: glossary terms, official figures with sources, live crypto prices and charts, and today's headlines. Education only, never trade advice.
- **Description** (≤2,000):

  ATLAS Explain helps people understand markets without being told what to do. Ask Claude about a term, an asset or a move, and ATLAS Explain answers with plain language and named sources.

  - Explain any market term from a curated glossary (stop-limit order, bid-ask spread, yield curve and more), or follow the learning path topic by topic.
  - Look up what an asset is: its market, trading hours, and its latest official figure or live price, or why no price is shown.
  - Official figures from free government and regulator sources: US Treasury yields, ECB and Bank of Canada rates, EIA energy prices, and SEC-filed figures for about 30 large US companies and ETFs.
  - Live prices for ten major coins, and how a coin moved over 24 hours, 7 days or 30 days, drawn as an interactive chart in Claude.
  - Today's market headlines from the GDELT Project, each linked to its publisher.

  Every answer names its source and time, says plainly when data is missing instead of filling the gap, and ends with "Educational information, not investment advice." It never recommends a trade and never forecasts prices. The connector is free, read-only, needs no account, and stores none of the requests it answers.

- **Categories** (1–5): Finance; Education; Research (pick the closest the portal offers).
- **Documentation URL:** https://atlas-explain.web.app/support#ai-assistants
- **Privacy policy URL:** https://atlas-explain.web.app/privacy#connector
- **Support contact:** owner to choose. Today the Support page sends people to GitHub issues (https://github.com/MISHHF93/atlas-explain/issues); a support email is listed as an owner step in docs/HANDOVER.md.
- **Icon:** `store/connector/icon-512.png` (512×512, from public/logo.svg).
- **Slug** (permanent): `atlas-explain`

### Carousel screenshots (MCP App)

Four 1200px-wide PNGs in `store/connector/`, cropped to the app response, made by `node store/src/capture-connector.mjs` from the live server with real data:

| File | Prompt |
|---|---|
| chart-btc-7d.png | Show me Bitcoin's price over the last 7 days with ATLAS Explain. |
| chart-eth-30d.png | How has Ethereum moved over the last 30 days? Use ATLAS Explain. |
| chart-sol-24h.png | Using ATLAS Explain, chart Solana over the last 24 hours. |
| chart-xrp-7d.png | What did XRP do this week? Show it with ATLAS Explain. |

Re-run the script just before submitting so the prices are current.

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

- **Whose API:** ATLAS Explain's own data site (atlas-explain-data.web.app, built from US Treasury, ECB, Bank of Canada, EIA, SEC EDGAR and GDELT public data) plus two third-party public APIs it doesn't control: CoinGecko and Kraken (public market data, credited on every answer).
- **Personal health data:** no. **Sponsored content:** no.

## 8. Test & launch

Every tool, prompt and the chart were run against the live server on 15 Nov 2026 (curl, the repo's tests, a host harness for the chart), and the tools as a custom connector in Claude. Before submitting, the owner should reconnect the connector in Claude and run each tool once more from a chat, then tick the confirmation.

## 9. Compliance

All seven acknowledgments apply cleanly: directory guidelines; first-party API usage (own data site, credited public APIs); no financial transactions; no AI media generation; no prompt-injection patterns in descriptions; no conversation data collected; public documentation at the Support page.

## Risks a reviewer might raise

- **Domain:** the server runs on `atlas-explain.workers.dev` (Cloudflare's free subdomain), not on `atlas-explain.web.app`. The names match and both are linked from the Support page, but a custom domain would make the ownership plainer. That costs money, so it isn't done.
- **Third-party prices:** CoinGecko and Kraken are public APIs ATLAS Explain doesn't control. Their terms are on the legal review list (docs/legal/REVIEW_NOTES.md, item 12).

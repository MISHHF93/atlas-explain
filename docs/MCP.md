# ATLAS Explain for AI assistants (MCP)

ATLAS Explain has a small, read-only [Model Context Protocol](https://modelcontextprotocol.io) server that is hosted online. People add one web address to an AI assistant that supports MCP connectors (Claude, and others), and the assistant can look things up in ATLAS Explain while they chat. Nothing is downloaded or installed, and it needs no account or key.

## What it can do

| Tool | What it returns |
|---|---|
| `explain_term` | The plain-language glossary entry for a market term, such as "stop-limit order", "bid-ask spread" or "yield curve". |
| `browse_glossary` | The learning path in order (topics and their terms), or every term in one glossary group. |
| `asset_details` | What one asset is: its market, trading hours, latest official figure or live price with source and time, or why no price is shown, plus related terms and its page in the app. |
| `official_figures` | Official figures from free government and regulator sources: US Treasury yields, ECB and Bank of Canada rates, EIA energy prices, and the latest SEC-filed figures (revenue, net income, earnings per share, shares outstanding) for about 30 large US companies and ETFs. Each with its source and date. |
| `crypto_prices` | Live prices for the ten major coins, biggest moves first. From CoinGecko, or Kraken's public API when CoinGecko is busy; each answer names the source it used and that source's change window. |
| `price_history` | A coin's start, end, change, high and low over 24 hours, 7 days or 30 days. Past moves only, never a forecast. Same two sources. |
| `todays_headlines` | Recent market headlines from the GDELT Project, each with its publisher, link and time. Headlines older than 36 hours are never returned. |

Every answer names its source and ends with: "Educational information, not investment advice."

## What it never does

- It never calls an AI model; the assistant does the talking.
- It never reads accounts, balances or anything on the person's computer.
- It never gives trade advice.

It only reads its built-in glossary and two public files on `atlas-explain-data.web.app` (`market.json` and `news.json`).

## For people using it

**Live address:** `https://atlas-explain-mcp.atlas-explain.workers.dev/mcp?v=2` (deployed 15 Nov 2026, and checked in Claude: the connector adds and `explain_term` answers in chat). The setup steps are on the website at https://atlas-explain.web.app/support#ai-assistants. In Claude: Settings, then Connectors, then Add custom connector, then paste the address.

## How it is hosted ($0)

- **Where:** Cloudflare Workers, free plan: 100,000 requests a day with no card. Over the limit, requests fail for the rest of the day; nothing is ever charged. Firebase can't host it, because the Spark plan has no servers.
- **Transport:** MCP "Streamable HTTP", stateless. Each `POST /mcp` carries one JSON-RPC message and gets one JSON answer; notifications get `202`. `GET /mcp` is `405` (no server stream). `GET /` is a short plain-text description. CORS is open, because the data is public and read-only. It supports protocol versions 2025-06-18, 2025-03-26 and 2024-11-05.
- **Caching:** the two data files are cached at Cloudflare's edge for 5 minutes and crypto prices for 1 minute, so heavy use doesn't hit the sources.
- **Crypto sources:** CoinGecko's keyless API usually answers Cloudflare Workers with 429 (rate-limited shared addresses), so the server falls back to Kraken's public API (`src/core/kraken.ts`, no key). A free CoinGecko Demo key would make CoinGecko the usual source; that would be an owner step (`wrangler secret put`), and isn't needed.
- **Code:**
  - `src/mcp/server.ts`: the tools and the JSON-RPC handler. They reuse the app's glossary, catalog and headline readers, so the freshness and source rules are the same.
  - `src/mcp/http.ts`: the HTTP transport.
  - `src/mcp/worker.ts`: the Workers entry.
  - `wrangler.toml`: the deploy settings.
- **Checks:** `npm run build:mcp` checks that it bundles for Workers with no Node APIs, and release:check runs it.

## If Claude shows "Couldn't register with ATLAS Explain's sign-in service"

The server has no sign-in. Claude first sends a plain request; if that fails, it falls back to an OAuth sign-in and shows this error. Seen twice on 15 Nov 2026:

1. **Protocol version:** the server returned 400 for `MCP-Protocol-Version: 2025-11-25`, the current spec. Fixed: it accepts 2025-11-25 and any later well-formed version (`src/mcp/http.ts`). Keep this lenient.
2. **Claude kept the old failure:** after the fix, Claude still failed for the plain `/mcp` address without sending a single request (`npx wrangler@4 tail atlas-explain-mcp` showed nothing). The same server under `/mcp?v=2` connected at once. The query is ignored by the server; it only gives Claude a fresh address. If this happens again, delete the connector in Claude and use `?v=3`, then update `MCP_URL`.

Note: `wrangler tail` did not show Claude's requests even when the tool worked in chat, so an empty tail is not proof that nothing arrived. The test that counts is a chat answer with an `explain_term` tool step.

Sources: [Claude connector troubleshooting](https://claude.com/docs/connectors/building/troubleshooting), [anthropics/claude-ai-mcp#457](https://github.com/anthropics/claude-ai-mcp/issues/457).

## Owner steps (once)

1. Create a free Cloudflare account (no card) and sign in from this repo: `npx wrangler@4 login`.
2. Deploy: `npm run deploy:mcp`. Wrangler prints the address, for example `https://atlas-explain-mcp.<your-subdomain>.workers.dev`.
3. Send that address to the developer, or set `MCP_URL` in `src/core/links.ts` to it with `/mcp` on the end, then redeploy hosting. The Support page then shows the address and the steps instead of "Not online yet".

After code changes, run `npm run deploy:mcp` again. It can't run from GitHub Actions while the account's billing lock is on.

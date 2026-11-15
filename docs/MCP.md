# ATLAS Explain for AI assistants (MCP)

ATLAS Explain has a small, read-only [Model Context Protocol](https://modelcontextprotocol.io) server that is hosted online. People add one web address to an AI assistant that supports MCP connectors (Claude, and others), and the assistant can look things up in ATLAS Explain while they chat. Nothing is downloaded or installed, and it needs no account or key.

## What it can do

| Tool | What it returns |
|---|---|
| `explain_term` | The plain-language glossary entry for a market term, such as "stop-limit order", "bid-ask spread" or "yield curve". |
| `official_figures` | Official figures ATLAS Explain publishes from free government and regulator sources: US Treasury yields, ECB and Bank of Canada reference rates, EIA energy prices, and SEC filings for large US companies. Each comes with its source and date. |
| `todays_headlines` | Recent market headlines from the GDELT Project, each with its publisher, link and time. Headlines older than 36 hours are never returned. |

Every answer names its source and ends with: "Educational information, not investment advice."

## What it never does

- It never calls an AI model; the assistant does the talking.
- It never reads accounts, balances or anything on the person's computer.
- It never gives trade advice.

It only reads its built-in glossary and two public files on `atlas-explain-data.web.app` (`market.json` and `news.json`).

## For people using it

**Live address:** `https://atlas-explain-mcp.atlas-explain.workers.dev/mcp` (deployed 15 Nov 2026). The setup steps are on the website at https://atlas-explain.web.app/support#ai-assistants. In Claude: Settings, then Connectors, then Add custom connector, then paste the address.

## How it is hosted ($0)

- **Where:** Cloudflare Workers, free plan: 100,000 requests a day with no card. Over the limit, requests fail for the rest of the day; nothing is ever charged. Firebase can't host it, because the Spark plan has no servers.
- **Transport:** MCP "Streamable HTTP", stateless. Each `POST /mcp` carries one JSON-RPC message and gets one JSON answer; notifications get `202`. `GET /mcp` is `405` (no server stream). `GET /` is a short plain-text description. CORS is open, because the data is public and read-only. It supports protocol versions 2025-06-18, 2025-03-26 and 2024-11-05.
- **Caching:** the two data files are cached at Cloudflare's edge for 5 minutes, so heavy use doesn't hit the data site.
- **Code:**
  - `src/mcp/server.ts`: the tools and the JSON-RPC handler. They reuse the app's glossary, catalog and headline readers, so the freshness and source rules are the same.
  - `src/mcp/http.ts`: the HTTP transport.
  - `src/mcp/worker.ts`: the Workers entry.
  - `wrangler.toml`: the deploy settings.
- **Checks:** `npm run build:mcp` checks that it bundles for Workers with no Node APIs, and release:check runs it.

## Owner steps (once)

1. Create a free Cloudflare account (no card) and sign in from this repo: `npx wrangler@4 login`.
2. Deploy: `npm run deploy:mcp`. Wrangler prints the address, for example `https://atlas-explain-mcp.<your-subdomain>.workers.dev`.
3. Send that address to the developer, or set `MCP_URL` in `src/core/links.ts` to it with `/mcp` on the end, then redeploy hosting. The Support page then shows the address and the steps instead of "Not online yet".

After code changes, run `npm run deploy:mcp` again. It can't run from GitHub Actions while the account's billing lock is on.

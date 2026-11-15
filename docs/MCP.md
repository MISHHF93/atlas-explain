# ATLAS Explain for AI assistants (MCP)

ATLAS Explain ships a small, read-only [Model Context Protocol](https://modelcontextprotocol.io) server. With it, an AI assistant that speaks MCP (Claude Desktop, Claude Code and others) can look things up in ATLAS Explain while you talk to it.

It is free and runs on your own computer. It needs no account and no API key.

## What it can do

| Tool | What it returns |
|---|---|
| `explain_term` | The plain-language glossary entry for a market term, such as "stop-limit order", "bid-ask spread" or "yield curve". |
| `official_figures` | Official figures ATLAS Explain publishes from free government and regulator sources: US Treasury yields, ECB and Bank of Canada reference rates, EIA energy prices, and SEC filings for large US companies. Each comes with its source and date. |
| `todays_headlines` | Recent market headlines from the GDELT Project, each with its publisher, link and time. Headlines older than 36 hours are never returned. |

Every answer names its source and ends with: "Educational information, not investment advice."

## What it never does

- It never calls an AI model; your assistant does the talking.
- It never reads accounts, balances or anything on your computer.
- It never gives trade advice.

It only reads three things: its own built-in glossary, and two public files on `atlas-explain-data.web.app` (`market.json` and `news.json`).

## Set it up

You need Node.js 22 or newer.

1. Get the server file. Either clone this repository and run `npm install` then `npm run build:mcp`, or download `mcp/atlas-explain-mcp.mjs` from the repository.
2. Add it to your assistant's MCP settings.

   **Claude Desktop:** open Settings, then Developer, then Edit Config. Add the server to `claude_desktop_config.json`, using the full path to the file:

   ```json
   {
     "mcpServers": {
       "atlas-explain": {
         "command": "node",
         "args": ["C:/path/to/atlas-explain/mcp/atlas-explain-mcp.mjs"]
       }
     }
   }
   ```

   **Claude Code:**

   ```bash
   claude mcp add atlas-explain -- node /path/to/atlas-explain/mcp/atlas-explain-mcp.mjs
   ```

3. Restart the assistant. Try asking it: "Using ATLAS Explain, what is a stop-limit order?"

## How it is built

The server's source is `src/mcp/server.ts`. It reuses the same glossary, catalog and headline readers as the app, so the freshness and source rules are the same. `npm run build:mcp` bundles it into the one dependency-free file `mcp/atlas-explain-mcp.mjs`. It speaks MCP over standard input and output (newline-delimited JSON-RPC 2.0) and supports protocol versions 2025-06-18, 2025-03-26 and 2024-11-05.

The two data files are refreshed hourly by a GitHub Actions job. If that job stops running, `todays_headlines` says that nothing is recent enough instead of returning old news.

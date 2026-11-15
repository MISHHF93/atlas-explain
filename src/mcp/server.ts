/**
 * ATLAS Explain MCP server: lets AI assistants (Claude Desktop, Claude Code and others that
 * speak the Model Context Protocol) look things up in ATLAS Explain.
 *
 * Read-only and free. It is hosted online (src/mcp/http.ts on Cloudflare Workers), so people add
 * a web address to their assistant and download nothing. It needs no API key, and only reads the public files ATLAS Explain already publishes:
 *   - the plain-language glossary (built into the server),
 *   - official market figures (US Treasury, ECB, Bank of Canada, EIA, SEC EDGAR) from the data site,
 *   - today's headlines (GDELT) from the data site.
 * It never calls a model, never reads accounts, and never gives trade advice. Every result
 * names its source and time, and ends with the education-only line.
 *
 * The HTTP transport is in src/mcp/http.ts; this file holds the tools and the JSON-RPC handler.
 */
import { formatValue, MARKET_DATA_URL, NEWS_DATA_URL, readMarketFile } from "../core/catalog";
import type { Asset } from "../core/asset-schema";
import { readNewsFile, type NewsItem } from "../core/news";
import { searchTerms } from "../core/terms";

export const SERVER_NAME = "atlas-explain";
export const SERVER_VERSION = "1.0.0";
export const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const EDUCATION_LINE = "Educational information, not investment advice. ATLAS Explain never tells anyone to trade.";
const APP_URL = "https://atlas-explain.web.app/app";

export type Fetcher = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
  annotations: { readOnlyHint: true; openWorldHint: boolean };
}

export const TOOLS: readonly Tool[] = [
  {
    name: "explain_term",
    title: "Explain a market term",
    description: "Look up a trading or market term (for example 'stop-limit order', 'bid-ask spread', 'yield curve') in ATLAS Explain's plain-language glossary. Education only.",
    inputSchema: { type: "object", properties: { term: { type: "string", description: "The term or phrase to look up." } }, required: ["term"], additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "official_figures",
    title: "Official market figures",
    description: "Official figures ATLAS Explain publishes from free government and regulator sources (US Treasury yields, ECB and Bank of Canada reference rates, EIA energy prices, SEC filings for large US companies). Each has its source and date. Optional search by name or symbol.",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "Optional name or symbol, for example '10-year', 'EUR', 'AAPL'." } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "todays_headlines",
    title: "Today's market headlines",
    description: "Recent market headlines ATLAS Explain collected from the GDELT Project, each with its publisher, link and time. Headlines older than 36 hours are never returned. Optional filter by company or coin.",
    inputSchema: { type: "object", properties: { about: { type: "string", description: "Optional company, coin or word, for example 'Nvidia' or 'Bitcoin'." } }, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
  },
];

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (body: string, isError = false): ToolResult => ({ content: [{ type: "text", text: `${body}\n\n${EDUCATION_LINE}` }], ...(isError ? { isError } : {}) });

async function getJson(url: string, fetcher: Fetcher): Promise<unknown | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 10_000);
  try {
    const res = await fetcher(url, { signal: ctl.signal });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function explainTerm(term: string): ToolResult {
  const query = term.trim();
  if (!query) return text("Give a term to look up, for example 'stop-limit order'.", true);
  const hits = searchTerms(query).slice(0, 3);
  if (!hits.length) {
    return text(`"${query}" is not in the ATLAS Explain glossary. The ATLAS Explain web app can explain any term, sentence or headline in plain language, with both sides: ${APP_URL}`);
  }
  return text(hits.map((t) => `${t.title}\n${t.summary}`).join("\n\n") + `\n\nSource: ATLAS Explain glossary. More: ${APP_URL}/learn`);
}

function figureLine(a: Asset): string {
  const value = formatValue(a);
  if (!value || !a.quote) return `${a.name} (${a.symbol}): no figure shown. ${a.noQuoteReason ?? ""}`.trim();
  // Attribution text often already starts with "Source:"; say it once.
  const source = a.quote.source.attribution.text.replace(/^source:\s*/i, "");
  return `${a.name} (${a.symbol}): ${value}, as of ${a.quote.asOf.slice(0, 10)}. Source: ${source} (${a.quote.source.attribution.href})`;
}

export async function officialFigures(query: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const body = await getJson(MARKET_DATA_URL, fetcher);
  if (body == null) return text("Official figures couldn't be loaded right now. Try again in a few minutes.", true);
  const assets = readMarketFile(body, now);
  const q = query?.trim().toLowerCase() ?? "";
  const matches = (q ? assets.filter((a) => `${a.name} ${a.symbol}`.toLowerCase().includes(q)) : assets).filter((a) => a.quote).slice(0, 20);
  if (!matches.length) return text(q ? `No official figure matches "${query}".` : "No official figure is available right now.");
  return text(matches.map(figureLine).join("\n"));
}

export async function todaysHeadlines(about: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const body = await getJson(NEWS_DATA_URL, fetcher);
  const file = body == null ? null : readNewsFile(body, now);
  if (!file) return text("Headlines couldn't be loaded right now. Try again in a few minutes.", true);
  const seen = new Set<string>();
  const q = about?.trim().toLowerCase() ?? "";
  const items = Object.values(file.items)
    .flat()
    .filter((n: NewsItem) => (seen.has(n.url) ? false : (seen.add(n.url), true)))
    .filter((n) => !q || n.title.toLowerCase().includes(q))
    .sort((a, b) => b.seenAt.localeCompare(a.seenAt))
    .slice(0, 10);
  if (!items.length) {
    return text(q
      ? `No recent headline mentions "${about}".`
      : `No headline is recent enough to call today's news (the list was last refreshed ${file.generatedAt.slice(0, 16).replace("T", " ")} UTC). Older headlines are not returned.`);
  }
  return text(items.map((n) => `${n.title}\n${n.domain}, ${n.seenAt.slice(0, 16).replace("T", " ")} UTC: ${n.url}`).join("\n\n") +
    "\n\nHeadlines found by the GDELT Project. They link to their publishers; ATLAS Explain does not write or check them.");
}

/* ---------- JSON-RPC (the HTTP transport is in src/mcp/http.ts) ---------- */

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

/** Answers one message; null for notifications, which get no reply. */
export async function handle(message: Message, fetcher: Fetcher): Promise<Reply | null> {
  const id = message.id ?? null;
  const isRequest = message.id !== undefined && message.id !== null;
  const ok = (result: unknown): Reply => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, msg: string): Reply => ({ jsonrpc: "2.0", id, error: { code, message: msg } });
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return isRequest ? fail(-32600, "Invalid request") : null;
  if (!isRequest) return null;
  switch (message.method) {
    case "initialize": {
      const asked = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return ok({
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, title: "ATLAS Explain", version: SERVER_VERSION },
        instructions: "Read-only look-ups from ATLAS Explain: a plain-language glossary, official figures with their sources, and today's headlines. Education only: never present results as trade advice.",
      });
    }
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS });
    case "tools/call": {
      const name = message.params?.name;
      const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
      const str = (v: unknown) => (typeof v === "string" ? v : undefined);
      if (name === "explain_term") return ok(explainTerm(str(args.term) ?? ""));
      if (name === "official_figures") return ok(await officialFigures(str(args.query), fetcher));
      if (name === "todays_headlines") return ok(await todaysHeadlines(str(args.about), fetcher));
      return fail(-32602, `Unknown tool: ${String(name)}`);
    }
    default:
      return fail(-32601, `Method not found: ${message.method}`);
  }
}

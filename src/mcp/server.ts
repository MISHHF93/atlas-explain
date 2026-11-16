/**
 * ATLAS Explain MCP server: lets AI assistants (Claude and others that speak the Model Context
 * Protocol) use what the ATLAS Explain app shows: the plain-language glossary and learning path,
 * the asset catalog, official figures, crypto prices and charts, and today's headlines.
 *
 * Read-only and free. It is hosted online (src/mcp/http.ts on Cloudflare Workers), so people add
 * a web address to their assistant and download nothing. It needs no API key, and only reads
 * public sources the app already uses:
 *   - the glossary and learning path (built in),
 *   - official figures (US Treasury, ECB, Bank of Canada, EIA, SEC EDGAR), headlines (GDELT and official releases) and
 *     crypto prices with 30 days of hourly closes (collected from Kraken, CoinGecko as backup),
 *     all from ATLAS Explain's own data site, which the scheduled data job publishes.
 * It calls no third-party API itself.
 * It never calls a model, never reads accounts, and never gives trade advice. Every result
 * names its source and time, says plainly when something is missing, and ends with the
 * education-only line. Each tool reuses the app's own readers, so the rules match the app.
 *
 * The HTTP transport is in src/mcp/http.ts; this file holds the tools and the JSON-RPC handler.
 */
import { CLASS_INFO, findAsset, formatChange as assetChange, formatValue, readMarketFile, searchAssets } from "../core/catalog";
import type { Asset } from "../core/asset-schema";
import { formatChange, formatPrice } from "../core/assets";
import { thinEvenly } from "../core/coingecko";
import { EDUCATION_ASSETS } from "../core/education-assets";
import { CRYPTO_COINS, CRYPTO_CREDIT, readCryptoFile, type CryptoFile, type CryptoSource } from "../data/crypto";
import { LEARN_PATH, learnTerms } from "../core/learn";
import { HEADLINE_CREDIT, readNewsFile, type NewsItem } from "../core/news";
import { CHART_APP_HTML, CHART_APP_URI, MCP_APP_MIME } from "./chart-app";
import { BOARD_APP_HTML, BOARD_APP_URI } from "./board-app";
import { FIGURES_APP_HTML, FIGURES_APP_URI } from "./figures-app";
import { ECONOMY_APP_HTML, ECONOMY_APP_URI } from "./economy-app";
import { DEPTH_APP_HTML, DEPTH_APP_URI } from "./depth-app";
import { readEconomyFile, upcoming, type CalendarEvent, type EconomyFile, type Indicator } from "../data/economy";
import { ALL_TERMS, searchTerms, TERM_GROUP_LABEL } from "../core/terms";

export const SERVER_NAME = "atlas-explain";
export const SERVER_VERSION = "1.6.0";
/**
 * Dual-era (MCP 2026-07-28, "Versioning and Compatibility"): modern clients put their protocol
 * version and capabilities in every request's _meta and need no handshake; legacy clients open with
 * initialize. Legacy versions are listed newest first; an initialize asking for a version not
 * listed gets the newest legacy one, as those revisions allow.
 */
export const MODERN_PROTOCOLS = ["2026-07-28"] as const;
export const SUPPORTED_PROTOCOLS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const ALL_PROTOCOLS: readonly string[] = [...MODERN_PROTOCOLS, ...SUPPORTED_PROTOCOLS];
export const META = {
  protocolVersion: "io.modelcontextprotocol/protocolVersion",
  clientCapabilities: "io.modelcontextprotocol/clientCapabilities",
  serverInfo: "io.modelcontextprotocol/serverInfo",
} as const;
/** How long clients and caches may reuse list and read results (MCP 2026-07-28 CacheableResult). */
const CACHE = { ttlMs: 3_600_000, cacheScope: "public" } as const;
import { APP_URL, CRYPTO_DATA_URL, ECONOMY_DATA_URL, EDUCATION_LINE, EXPLAIN_WEB_URL, MARKET_DATA_URL, MCP_ORIGIN, NEWS_DATA_URL } from "../core/links";
export { EDUCATION_LINE, MCP_ORIGIN };

/** The platform fetch (Cloudflare Workers, Node or a test double). */
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

type Schema = Record<string, unknown>;

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
  /** The typed JSON every successful answer also carries (structuredContent). */
  outputSchema?: Schema;
  annotations: { title: string; readOnlyHint: true; destructiveHint: false; idempotentHint: true; openWorldHint: boolean };
  icons: typeof ICONS;
  _meta?: { ui: { resourceUri: string } };
}

const str = (description: string) => ({ type: "string", description });
const nullable = (type: string) => ({ type: [type, "null"] });
/** The ATLAS Explain mark, shown next to the server and its tools in clients that support icons (MCP 2025-11-25). */
// Served by this server from its own address (src/mcp/http.ts): a PNG every client supports, and the SVG.
export const ICONS = [
  { src: `${MCP_ORIGIN}/icon.png`, mimeType: "image/png", sizes: ["512x512"] },
  { src: `${MCP_ORIGIN}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
] as const;
const notice = { notice: { type: "string" } };
const obj = (properties: Schema, required: string[] = []): Schema => ({ type: "object", properties: { ...properties, ...notice }, required: [...required, "notice"] });
const FIGURE: Schema = {
  type: "object",
  properties: {
    name: { type: "string" }, symbol: { type: "string" }, assetClass: { type: "string" },
    value: nullable("number"), currency: { type: "string" }, change: nullable("number"), changePct: nullable("number"), changeWindow: nullable("string"), asOf: nullable("string"),
    facts: { type: "array", items: { type: "object", properties: { label: { type: "string" }, value: { type: "string" }, period: nullable("string") }, required: ["label", "value"] } },
    source: nullable("string"), sourceUrl: nullable("string"), noPriceReason: nullable("string"),
    tenor: nullable("string"),
  },
  required: ["name", "symbol", "assetClass"],
};
const INDICATOR: Schema = {
  type: "object",
  properties: {
    id: { type: "string" }, name: { type: "string" }, unit: { type: "string", enum: ["%", "USD"] }, value: { type: "number" }, period: { type: "string" },
    change: nullable("number"), changeWindow: { type: "string" }, note: nullable("string"),
    series: { type: "array", items: { type: "object", properties: { t: { type: "string" }, v: { type: "number" } }, required: ["t", "v"] } },
    source: { type: "string" }, sourceUrl: { type: "string" }, capturedAt: { type: "string" },
  },
  required: ["id", "name", "unit", "value", "period", "series", "source"],
};
const EVENT: Schema = {
  type: "object",
  properties: { date: { type: "string" }, startDate: nullable("string"), institution: { type: "string" }, title: { type: "string" }, about: { type: "string" }, withProjections: { type: "boolean" }, daysAway: { type: "number" }, sourceUrl: { type: "string" } },
  required: ["date", "institution", "title"],
};
const annotations = (title: string, openWorldHint: boolean) => ({ title, readOnlyHint: true as const, destructiveHint: false as const, idempotentHint: true as const, openWorldHint });

export const TOOLS: readonly Tool[] = [
  {
    name: "explain_term",
    title: "Explain a market term",
    description: "Look up a trading or market term (for example 'stop-limit order', 'bid-ask spread', 'yield curve') in ATLAS Explain's plain-language glossary. Education only.",
    inputSchema: { type: "object", properties: { term: str("The term or phrase to look up.") }, required: ["term"], additionalProperties: false },
    annotations: annotations("Explain a market term", false),
    icons: ICONS,
  },
  {
    name: "browse_glossary",
    title: "Browse the glossary and learning path",
    description: "List ATLAS Explain's learning path (topics in order, each with its terms) or every glossary term in one group. Use it to suggest what to learn next, or to find the right term to explain.",
    inputSchema: { type: "object", properties: { topic: str("Optional learning-path topic or glossary group, for example 'orders', 'risk', 'rates', 'futures'. Leave empty for the whole path.") }, additionalProperties: false },
    annotations: annotations("Browse the glossary and learning path", false),
    icons: ICONS,
  },
  {
    name: "asset_details",
    title: "What an asset is",
    description: "Everything ATLAS Explain shows about one asset: what it is, where and when it trades, its latest official figure or price (with source and time), or why no price is shown. Covers crypto, US stocks and ETFs, currencies, interest rates, energy, indices, futures and options.",
    inputSchema: { type: "object", properties: { asset: str("Name or symbol, for example 'Bitcoin', 'AAPL', 'EUR/USD', '10-year', 'S&P 500'.") }, required: ["asset"], additionalProperties: false },
    annotations: annotations("What an asset is", true),
    icons: ICONS,
    outputSchema: obj({ found: { type: "boolean" }, ...((FIGURE.properties as Schema)), venue: nullable("string"), about: { type: "string" }, tradingHours: nullable("string"), priceUsd: nullable("number"), relatedTerms: { type: "array", items: { type: "string" } }, appUrl: { type: "string" } }, ["found"]),
  },
  {
    name: "official_figures",
    title: "Official market figures",
    description: "Official figures ATLAS Explain publishes from free government and regulator sources: US Treasury yields, ECB and Bank of Canada rates, EIA energy prices, and the latest SEC-filed figures (revenue, net income and more) for large US companies and ETFs. Each has its source and date. Optional search by name or symbol.",
    inputSchema: { type: "object", properties: { query: str("Optional name or symbol, for example '10-year', 'EUR', 'AAPL'.") }, additionalProperties: false },
    annotations: annotations("Official market figures", true),
    icons: ICONS,
    outputSchema: obj({ figures: { type: "array", items: FIGURE } }, ["figures"]),
    // Clients that support MCP Apps draw the figures as cards, and yields as a curve (src/mcp/figures-app.ts).
    _meta: { ui: { resourceUri: FIGURES_APP_URI } },
  },
  {
    name: "crypto_prices",
    title: "Crypto prices",
    description: "Recent prices for the ten major coins ATLAS Explain follows (Bitcoin, Ethereum, Solana, XRP, Cardano, Dogecoin, Litecoin, Polkadot, Chainlink, Avalanche), biggest moves first, each with its last 24 hours of hourly closes. Refreshed about every 10 minutes by ATLAS Explain's data job from Kraken's public market data (CoinGecko as backup) and served from ATLAS Explain's own data site; each answer says when they were collected.",
    inputSchema: { type: "object", properties: { coin: str("Optional coin name or symbol, for example 'BTC' or 'Ethereum'.") }, additionalProperties: false },
    annotations: annotations("Crypto prices", true),
    icons: ICONS,
    outputSchema: obj({ source: { type: "string" }, coins: { type: "array", items: { type: "object", properties: { name: { type: "string" }, symbol: { type: "string" }, priceUsd: { type: "number" }, changePct: nullable("number"), changeWindow: { type: "string" }, asOf: nullable("string"), spark: { type: "array", items: { type: "number" } } }, required: ["name", "symbol", "priceUsd"] } } }, ["source", "coins"]),
    // Clients that support MCP Apps draw a board with sparklines; a coin opens its chart (src/mcp/board-app.ts).
    _meta: { ui: { resourceUri: BOARD_APP_URI } },
  },
  {
    name: "price_history",
    title: "Crypto price history",
    description: "How a coin's price moved over the last 24 hours, 7 days or 30 days: start, end, change, high and low with their times, from the hourly closes on ATLAS Explain's own data site (refreshed about every 10 minutes). Describes the past only; never a forecast.",
    inputSchema: {
      type: "object",
      properties: { coin: str("Coin name or symbol, for example 'BTC'."), range: { type: "string", enum: ["24h", "7d", "30d"], description: "Time range. Default 7d." } },
      required: ["coin"],
      additionalProperties: false,
    },
    annotations: annotations("Crypto price history", true),
    icons: ICONS,
    outputSchema: obj({ name: { type: "string" }, symbol: { type: "string" }, range: { type: "string", enum: ["24h", "7d", "30d"] }, rangeLabel: { type: "string" }, startUsd: { type: "number" }, endUsd: { type: "number" }, changePct: { type: "number" }, high: { type: "object", properties: { priceUsd: { type: "number" }, at: { type: "string" } } }, low: { type: "object", properties: { priceUsd: { type: "number" }, at: { type: "string" } } }, points: { type: "array", items: { type: "object", properties: { t: { type: "string" }, c: { type: "number" } }, required: ["t", "c"] } }, source: { type: "string" } }, ["symbol", "range", "points", "source"]),
    // Clients that support MCP Apps draw this as an interactive chart (src/mcp/chart-app.ts).
    _meta: { ui: { resourceUri: CHART_APP_URI } },
  },
  {
    name: "todays_headlines",
    title: "Today's market headlines",
    description: "Recent market headlines ATLAS Explain collected from the GDELT Project's news index and from official press releases (Federal Reserve, SEC, CFTC, ECB, Bank of Canada, Bank of England), each with its publisher, link and time. News stories older than 36 hours and releases older than 4 days are never returned. Optional filter by company or coin.",
    inputSchema: { type: "object", properties: { about: str("Optional company, coin or word, for example 'Nvidia' or 'Bitcoin'.") }, additionalProperties: false },
    annotations: annotations("Today's market headlines", true),
    icons: ICONS,
    outputSchema: obj({ refreshedAt: { type: "string" }, headlines: { type: "array", items: { type: "object", properties: { title: { type: "string" }, publisher: { type: "string" }, url: { type: "string" }, seenAt: { type: "string" } }, required: ["title", "url"] } } }, ["headlines"]),
  },
  {
    name: "economy_snapshot",
    title: "The economy at a glance",
    description: "Headline economic figures from official sources, each with its period, change and source: US inflation (CPI over 12 months) and unemployment (Bureau of Labor Statistics), the effective federal funds rate with the Fed's target range and SOFR (New York Fed), euro-area inflation (ECB), Canada's policy rate (Bank of Canada) and US public debt (Treasury). Includes about a year of history for each, and the next central-bank rate decisions. Optional filter by topic.",
    inputSchema: { type: "object", properties: { topic: str("Optional topic, for example 'inflation', 'jobs', 'rates', 'debt', 'euro' or 'canada'. Leave empty for all.") }, additionalProperties: false },
    annotations: annotations("The economy at a glance", true),
    icons: ICONS,
    outputSchema: obj({ refreshedAt: { type: "string" }, indicators: { type: "array", items: INDICATOR }, nextEvents: { type: "array", items: EVENT } }, ["indicators"]),
    // Clients that support MCP Apps draw cards and trend charts (src/mcp/economy-app.ts).
    _meta: { ui: { resourceUri: ECONOMY_APP_URI } },
  },
  {
    name: "economic_calendar",
    title: "Upcoming rate decisions",
    description: "The next interest-rate decisions of the Federal Reserve (FOMC), the European Central Bank and the Bank of Canada, from each bank's own published calendar, with what happens on the day. Dates only: it never guesses the outcome. Optional filter by central bank.",
    inputSchema: { type: "object", properties: { bank: str("Optional: 'Fed', 'ECB' or 'Bank of Canada'. Leave empty for all.") }, additionalProperties: false },
    annotations: annotations("Upcoming rate decisions", true),
    icons: ICONS,
    outputSchema: obj({ refreshedAt: { type: "string" }, events: { type: "array", items: EVENT } }, ["events"]),
  },
  {
    name: "market_depth",
    title: "Bid, ask and order book",
    description: "For one of the ten coins ATLAS Explain follows: the best bid and ask, the bid-ask spread, how much is offered near the middle price, and how far the average price would move (slippage) if an order of a given size were filled against the order book. From Kraken's public market data; the spread is refreshed every few minutes and the order book about every 10 minutes. Explains how markets work; never suggests a trade.",
    inputSchema: { type: "object", properties: { coin: str("Coin name or symbol, for example 'BTC'.") }, required: ["coin"], additionalProperties: false },
    annotations: annotations("Bid, ask and order book", true),
    icons: ICONS,
    outputSchema: obj({
      name: { type: "string" }, symbol: { type: "string" }, bidUsd: { type: "number" }, askUsd: { type: "number" }, midUsd: { type: "number" },
      spreadUsd: { type: "number" }, spreadPct: { type: "number" }, spreadBps: { type: "number" }, quoteAsOf: { type: "string" },
      book: { type: ["object", "null"], properties: { asOf: { type: "string" }, bids: { type: "array" }, asks: { type: "array" } } },
      depth: { type: "array", items: { type: "object", properties: { bandPct: { type: "number" }, bidsUsd: { type: "number" }, asksUsd: { type: "number" }, complete: { type: "boolean" } } } },
      impact: { type: "array", items: { type: "object", properties: { sizeUsd: { type: "number" }, side: { type: "string", enum: ["asks", "bids"] }, filled: { type: "boolean" }, avgPriceUsd: nullable("number"), slippagePct: nullable("number") } } },
      source: { type: "string" },
    }, ["symbol", "bidUsd", "askUsd", "spreadUsd", "source"]),
    // Clients that support MCP Apps draw the order book as a depth chart (src/mcp/depth-app.ts).
    _meta: { ui: { resourceUri: DEPTH_APP_URI } },
  },
];

const INSTRUCTIONS =
  "Read-only look-ups from ATLAS Explain, an education-only market explainer: explain_term and browse_glossary for plain-language terms and the learning path; asset_details and official_figures for what an asset is and its official numbers with sources; crypto_prices and price_history for recent crypto prices (refreshed about every 10 minutes) and past moves; todays_headlines for recent news and official releases; economy_snapshot for inflation, jobs, policy rates and debt; economic_calendar for upcoming central-bank rate decisions; market_depth for a coin's bid-ask spread, order book and slippage. In clients that support MCP Apps, crypto_prices, price_history, official_figures, economy_snapshot and market_depth also draw interactive charts. Glossary terms are also readable as resources. Every result names its source and time. Education only: never present results as trade advice or a forecast.";
const CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false },
  prompts: { listChanged: false },
  completions: {},
  // The charts (price_history, crypto_prices, official_figures, economy_snapshot, market_depth) are MCP Apps; hosts without them get the text answer.
  extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [MCP_APP_MIME] } },
};
const SERVER_INFO = () => ({ name: SERVER_NAME, title: "ATLAS Explain", version: SERVER_VERSION, websiteUrl: EXPLAIN_WEB_URL, icons: ICONS });

/** The interactive views (MCP Apps) the tools above point at with _meta.ui.resourceUri. */
export const MCP_APPS = [
  { uri: CHART_APP_URI, name: "price-chart", title: "Interactive price chart", description: "The chart price_history draws in clients that support MCP Apps.", html: CHART_APP_HTML },
  { uri: BOARD_APP_URI, name: "crypto-board", title: "Crypto price board", description: "The board crypto_prices draws in clients that support MCP Apps: prices, changes and 24-hour sparklines; a coin opens its chart.", html: BOARD_APP_HTML },
  { uri: ECONOMY_APP_URI, name: "economy", title: "The economy at a glance", description: "The view economy_snapshot draws in clients that support MCP Apps: a card per indicator, its trend over about a year, and the next rate decisions.", html: ECONOMY_APP_HTML },
  { uri: DEPTH_APP_URI, name: "market-depth", title: "Order book depth chart", description: "The view market_depth draws in clients that support MCP Apps: best bid and ask, the spread, a depth chart of the order book and slippage by order size.", html: DEPTH_APP_HTML },
  { uri: FIGURES_APP_URI, name: "official-figures", title: "Official figures and yield curve", description: "The view official_figures draws in clients that support MCP Apps: figure cards, and a yield curve when the answer holds government bond yields.", html: FIGURES_APP_HTML },
] as const;

/* ---------- glossary as resources (attachable as context in clients that support resources) ---------- */

export const GLOSSARY_URI = "atlas-explain://glossary/";
export const LEARNING_PATH_URI = "atlas-explain://learning-path";
const termResource = (t: (typeof ALL_TERMS)[number]) => ({ uri: `${GLOSSARY_URI}${t.id}`, name: t.id, title: t.title, description: t.summary.length > 120 ? `${t.summary.slice(0, 117)}…` : t.summary, mimeType: "text/markdown", icons: ICONS });
function readGlossaryResource(uri: string): { uri: string; mimeType: string; text: string } | null {
  if (uri === LEARNING_PATH_URI) {
    const body = LEARN_PATH.map((step, i) => `## ${i + 1}. ${step.title}\n` + learnTerms(step).map((t) => `- **${t.title}**: ${t.summary}`).join("\n")).join("\n\n");
    return { uri, mimeType: "text/markdown", text: `# The ATLAS Explain learning path\n\n${body}\n\nSource: ATLAS Explain glossary. ${APP_URL}/learn\n\n${EDUCATION_LINE}` };
  }
  if (!uri.startsWith(GLOSSARY_URI)) return null;
  const term = ALL_TERMS.find((t) => t.id === decodeURIComponent(uri.slice(GLOSSARY_URI.length)));
  return term ? { uri, mimeType: "text/markdown", text: `# ${term.title}\n\n${term.summary}\n\nSource: ATLAS Explain glossary. ${APP_URL}/learn\n\n${EDUCATION_LINE}` } : null;
}

/** One-click starters (MCP prompts). Each asks the assistant to use the tools, education only. */
export const PROMPTS = [
  {
    name: "market_brief",
    title: "Today's market brief",
    description: "A plain-language brief of today's crypto moves, headlines and official rates, with sources.",
    arguments: [],
    text: () => "Using ATLAS Explain, give me a short, plain-language market brief for today: the biggest crypto moves (crypto_prices), today's headlines (todays_headlines) and the latest official rates (official_figures for '10-year' and 'EUR'). Name each source and time, explain any term a beginner might not know, and don't suggest any trade.",
  },
  {
    name: "explain_asset",
    title: "Explain an asset",
    description: "What an asset is, its latest figures or price, how it moved recently, and the terms to know.",
    arguments: [{ name: "asset", description: "Name or symbol, for example 'Bitcoin', 'AAPL' or 'EUR/USD'.", required: true }],
    text: (a: Record<string, string>) => `Using ATLAS Explain, explain ${a.asset || "this asset"} to a beginner: what it is and where it trades (asset_details), its latest official figures or price, and, if it is a coin, how it moved over the last 7 days (price_history). Define any market term with explain_term. Show both sides where it matters and don't suggest any trade.`,
  },
  {
    name: "learn_next",
    title: "Learn the next topic",
    description: "Walk through one topic of the ATLAS Explain learning path, term by term, with a short check at the end.",
    arguments: [{ name: "topic", description: "Optional topic, for example 'orders', 'risk' or 'rates'. Leave empty to start at the beginning.", required: false }],
    text: (a: Record<string, string>) => `Using ATLAS Explain, teach me ${a.topic ? `the "${a.topic}" topic` : "the first topic"} of the learning path (browse_glossary). Explain each term in plain language with a simple example, then ask me one short question to check I understood. Education only.`,
  },
] as const;

/** Suggestions while someone fills in a prompt (MCP completions): coins and catalog names, or learning topics. */
export function completePromptArgument(prompt: string, argument: string, typed: string): string[] {
  const q = typed.trim().toLowerCase();
  const pool =
    prompt === `${GLOSSARY_URI}{term}` && argument === "term"
      ? ALL_TERMS.map((t) => t.id)
      : prompt === "explain_asset" && argument === "asset"
      ? [...CRYPTO_COINS.flatMap((c) => [c.name, c.symbol]), ...EDUCATION_ASSETS.map((a) => a.name)]
      : prompt === "learn_next" && argument === "topic"
        ? LEARN_PATH.flatMap((s) => [s.id, s.title])
        : [];
  const unique = [...new Set(pool)];
  return q ? unique.filter((v) => v.toLowerCase().startsWith(q)).concat(unique.filter((v) => !v.toLowerCase().startsWith(q) && v.toLowerCase().includes(q))) : unique;
}

type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

/** The readable answer, always ending with the education line. */
const text = (body: string, isError = false): ToolResult => ({ content: [{ type: "text", text: `${body}\n\n${EDUCATION_LINE}` }], ...(isError ? { isError } : {}) });
/** The readable answer plus the same facts as typed JSON (matching the tool's outputSchema), for agents and apps. */
const data = (body: string, structured: Record<string, unknown>): ToolResult => ({ ...text(body), structuredContent: { ...structured, notice: EDUCATION_LINE } });
const utc = (iso: string | null): string => (iso ? `${iso.slice(0, 16).replace("T", " ")} UTC` : "time not given");

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

/* ---------- glossary and learning path ---------- */

export function explainTerm(term: string): ToolResult {
  const query = term.trim();
  if (!query) return text("Give a term to look up, for example 'stop-limit order'.", true);
  const hits = searchTerms(query).slice(0, 3);
  if (!hits.length) {
    return text(`"${query}" is not in the ATLAS Explain glossary. The ATLAS Explain web app can explain any term, sentence or headline in plain language, with both sides: ${APP_URL}`);
  }
  return text(hits.map((t) => `${t.title}\n${t.summary}`).join("\n\n") + `\n\nSource: ATLAS Explain glossary. More: ${APP_URL}/learn`);
}

export function browseGlossary(topic: string | undefined): ToolResult {
  const q = topic?.trim().toLowerCase() ?? "";
  const step = q ? LEARN_PATH.find((s) => s.id === q || s.title.toLowerCase().includes(q)) : undefined;
  const group = q ? (Object.entries(TERM_GROUP_LABEL) as [keyof typeof TERM_GROUP_LABEL, string][]).find(([id, label]) => id === q || label.toLowerCase() === q) : undefined;
  if (step) {
    return text(`${step.title}\n` + learnTerms(step).map((t) => `- ${t.title}: ${t.summary}`).join("\n") + `\n\nSource: ATLAS Explain learning path. ${APP_URL}/learn`);
  }
  if (group) {
    const terms = ALL_TERMS.filter((t) => t.group === group[0]);
    return text(`${group[1]} terms\n` + terms.map((t) => `- ${t.title}: ${t.summary}`).join("\n") + `\n\nSource: ATLAS Explain glossary. ${APP_URL}/learn`);
  }
  const path = LEARN_PATH.map((s, i) => `${i + 1}. ${s.title}: ${learnTerms(s).map((t) => t.title).join(", ")}`).join("\n");
  const lead = q ? `No topic called "${topic}". ` : "";
  return text(`${lead}The ATLAS Explain learning path, in order:\n${path}\n\nGlossary groups: ${Object.values(TERM_GROUP_LABEL).join(", ")} (${ALL_TERMS.length} terms). Ask explain_term for any term. ${APP_URL}/learn`);
}

/* ---------- assets and official figures ---------- */

function sourceLine(s: { attribution: { text: string; href: string } }): string {
  // Attribution text often already starts with "Source:"; say it once.
  return `Source: ${s.attribution.text.replace(/^source:\s*/i, "")} (${s.attribution.href})`;
}

function figureLines(a: Asset): string[] {
  const value = formatValue(a);
  if (value && a.quote) {
    const change = assetChange(a);
    return [`${a.name} (${a.symbol}): ${value}${change ? `, ${change.text} ${a.quote.changeWindow}` : ""}, as of ${a.quote.asOf.slice(0, 10)}. ${sourceLine(a.quote.source)}`];
  }
  const facts = a.facts.filter((f) => f.kind !== "filing").slice(0, 4);
  if (facts.length) {
    return [`${a.name} (${a.symbol}): ` + facts.map((f) => `${f.label} ${f.value}${f.period ? ` (${f.period})` : ""}`).join("; ") + `. ${sourceLine(facts[0]!.source)}, ${facts[0]!.source.label}`];
  }
  return [`${a.name} (${a.symbol}): no figure shown. ${a.noQuoteReason ?? ""}`.trim()];
}

/** One asset's official numbers as typed JSON. */
function figureRecord(a: Asset): Record<string, unknown> {
  const source = a.quote?.source ?? a.facts[0]?.source;
  return {
    name: a.name,
    symbol: a.symbol,
    assetClass: a.class,
    value: a.quote ? a.quote.value : null,
    currency: a.currency,
    change: a.quote?.change ?? null,
    changePct: a.quote?.changePct ?? null,
    changeWindow: a.quote?.changeWindow ?? null,
    asOf: a.quote?.asOf ?? a.facts[0]?.asOf ?? null,
    facts: a.facts.filter((f) => f.kind !== "filing").slice(0, 6).map((f) => ({ label: f.label, value: f.value, period: f.period })),
    source: source ? source.attribution.text.replace(/^source:\s*/i, "") : null,
    sourceUrl: source?.attribution.href ?? null,
    noPriceReason: a.quote ? null : a.noQuoteReason,
    tenor: a.classData?.class === "rate" ? a.classData.tenor : null,
  };
}

async function loadOfficial(fetcher: Fetcher, now: number): Promise<Asset[] | null> {
  const body = await getJson(MARKET_DATA_URL, fetcher);
  return body == null ? null : readMarketFile(body, now);
}

export async function officialFigures(query: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const assets = await loadOfficial(fetcher, now);
  if (!assets) return text("Official figures couldn't be loaded right now. Try again in a few minutes.", true);
  const q = query?.trim() ?? "";
  const withData = assets.filter((a) => a.quote || a.facts.length);
  const matches = (q ? searchAssets(withData, q, { klass: "all" }) : withData).slice(0, 20);
  const body = matches.length
    ? matches.flatMap(figureLines).join("\n")
    : q ? `No official figure matches "${q}". Try asset_details for what ATLAS Explain covers.` : "No official figure is available right now.";
  return data(body, { figures: matches.map(figureRecord) });
}

const coinFor = (key: string) => {
  const k = key.trim().toLowerCase();
  return CRYPTO_COINS.find((c) => c.symbol.toLowerCase() === k || c.name.toLowerCase() === k || c.coingeckoId === k);
};
const COIN_NAMES = CRYPTO_COINS.map((c) => c.name).join(", ");
/** Older than this, an answer says plainly that the regular refresh hasn't run since. */
export const CRYPTO_STALE_MS = 3 * 3_600_000;

async function loadCrypto(fetcher: Fetcher): Promise<CryptoFile | null> {
  const body = await getJson(CRYPTO_DATA_URL, fetcher);
  return body == null ? null : readCryptoFile(body);
}

/** When and where the prices came from, and how old they are if the refresh has stopped. */
function cryptoCredit(source: CryptoSource, asOf: string, now: number): string {
  const age = now - Date.parse(asOf);
  const hours = Math.round(age / 3_600_000);
  const old = age > CRYPTO_STALE_MS ? ` These are ${hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours} hours`} old: the regular refresh hasn't run since.` : "";
  return `Collected ${utc(asOf)} by ATLAS Explain's data job and served from its own data site. ${CRYPTO_CREDIT[source]}${old}`;
}

/** The app's crypto intro says its prices are live; the connector's are a few minutes old, so it says only this. */
const CRYPTO_ABOUT = "Cryptocurrencies trade around the clock, every day, on many exchanges at once.";
const NO_CRYPTO = "ATLAS Explain's crypto data couldn't be loaded right now. Nothing is shown in its place; try again in a few minutes.";

export async function assetDetails(key: string, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const q = key.trim();
  if (!q) return text("Give an asset name or symbol, for example 'Bitcoin' or 'AAPL'.", true);
  const coin = coinFor(q);
  if (coin) {
    const file = await loadCrypto(fetcher);
    const row = file?.prices.coins.find((a) => a.symbol === coin.symbol);
    const credit = file ? cryptoCredit(file.prices.source, file.prices.asOf, now) : null;
    const price = row && file
      ? `Price: ${formatPrice(row.priceUsd)}, ${formatChange(row.changePct).text} ${row.changeWindow}. ${credit}`
      : `No price right now. ${NO_CRYPTO}`;
    return data(`${coin.name} (${coin.symbol}), a cryptocurrency.\n${CRYPTO_ABOUT}\n${price}\nIn the app: ${APP_URL}/assets/${coin.symbol}`, {
      found: true,
      name: coin.name,
      symbol: coin.symbol,
      assetClass: "crypto",
      about: CRYPTO_ABOUT,
      tradingHours: "24/7",
      priceUsd: row?.priceUsd ?? null,
      changePct: row?.changePct ?? null,
      changeWindow: row?.changeWindow ?? null,
      asOf: row && file ? file.prices.asOf : null,
      source: row && credit ? credit : null,
      appUrl: `${APP_URL}/assets/${coin.symbol}`,
    });
  }
  const official = (await loadOfficial(fetcher, now)) ?? [];
  const all = [...official, ...EDUCATION_ASSETS];
  const asset = findAsset(all, q) ?? searchAssets(all, q, { klass: "all" })[0];
  if (!asset) {
    return data(`"${q}" isn't in the ATLAS Explain catalog. It covers the ten major coins, about 30 large US companies and ETFs, major currencies, Treasury and government bond yields, energy prices, and explainers for indices, futures and options.`, { found: false });
  }
  const info = CLASS_INFO[asset.class];
  const lines = [
    `${asset.name} (${asset.symbol}). ${info.label}${asset.venue ? `, ${asset.venue}` : ""}.`,
    info.intro,
    asset.session.hours ? `Trading hours: ${asset.session.hours}.` : null,
    ...figureLines(asset),
    asset.relatedTerms.length ? `Related terms: ${asset.relatedTerms.map((id) => ALL_TERMS.find((t) => t.id === id)?.title ?? id).join(", ")}.` : null,
    `In the app: ${APP_URL}/assets/${encodeURIComponent(asset.symbol)}`,
  ].filter((l): l is string => Boolean(l));
  return data(lines.join("\n"), {
    found: true,
    ...figureRecord(asset),
    venue: asset.venue,
    about: info.intro,
    tradingHours: asset.session.hours,
    relatedTerms: asset.relatedTerms.map((id) => ALL_TERMS.find((t) => t.id === id)?.title ?? id),
    appUrl: `${APP_URL}/assets/${encodeURIComponent(asset.symbol)}`,
  });
}

/* ---------- crypto (from ATLAS Explain's own data site) ---------- */

export async function cryptoPrices(coinKey: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const file = await loadCrypto(fetcher);
  if (!file) return text(NO_CRYPTO, true);
  const want = coinKey?.trim() ? coinFor(coinKey) : undefined;
  if (coinKey?.trim() && !want) return text(`"${coinKey}" isn't one of the ten coins ATLAS Explain follows: ${COIN_NAMES}.`, true);
  const credit = cryptoCredit(file.prices.source, file.prices.asOf, now);
  const rows = file.prices.coins
    .filter((a) => !want || a.symbol === want.symbol)
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0));
  const lines = rows.map((a) => `${a.name} (${a.symbol}): ${formatPrice(a.priceUsd)}, ${formatChange(a.changePct).text} ${a.changeWindow}`);
  return data(`${want ? "" : "Biggest moves first.\n"}${lines.join("\n")}\n\n${credit}`, {
    source: credit,
    coins: rows.map((a) => ({ name: a.name, symbol: a.symbol, priceUsd: a.priceUsd, changePct: a.changePct, changeWindow: a.changeWindow, asOf: file.prices.asOf, spark: lastDay(file.history.series[a.symbol] ?? []) })),
  });
}

/** A coin's last 24 hourly closes, oldest first, for the board's sparkline. */
function lastDay(series: readonly (readonly [number, number])[]): number[] {
  const end = series.length ? series[series.length - 1]![0] : 0;
  return thinEvenly(series.filter(([t]) => t >= end - 86_400), 25).map(([, c]) => c);
}

const RANGES = {
  "24h": { days: 1, label: "the last 24 hours" },
  "7d": { days: 7, label: "the last 7 days" },
  "30d": { days: 30, label: "the last 30 days" },
} as const;

export async function priceHistory(coinKey: string, range: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const rangeId = (range && range in RANGES ? range : "7d") as keyof typeof RANGES;
  const coin = coinFor(coinKey);
  if (!coin) return text(`"${coinKey}" isn't one of the ten coins ATLAS Explain follows: ${COIN_NAMES}. Price history is only available for these.`, true);
  const r = RANGES[rangeId];
  const file = await loadCrypto(fetcher);
  if (!file) return text(NO_CRYPTO, true);
  const series = file.history.series[coin.symbol] ?? [];
  // The range ends at the latest hourly close, so it means the same thing even if the refresh is late.
  const end = series.length ? series[series.length - 1]![0] : 0;
  const points = thinEvenly(series.filter(([t]) => t >= end - r.days * 86_400), 120).map(([t, c]) => ({ t: new Date(t * 1000).toISOString(), c }));
  if (points.length < 2) return text(`ATLAS Explain's data site has no recent hourly prices for ${coin.name} right now, so its history isn't shown.`, true);
  const citation = cryptoCredit(file.history.source, file.history.asOf, now);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const hi = points.reduce((m, p) => (p.c > m.c ? p : m));
  const lo = points.reduce((m, p) => (p.c < m.c ? p : m));
  const pct = ((last.c - first.c) / first.c) * 100;
  return data([
    `${coin.name} (${coin.symbol}) over ${r.label}:`,
    `Start: ${formatPrice(first.c)} (${utc(first.t)})`,
    `End: ${formatPrice(last.c)} (${utc(last.t)})`,
    `Change: ${formatChange(pct).text}`,
    `High: ${formatPrice(hi.c)} (${utc(hi.t)}); low: ${formatPrice(lo.c)} (${utc(lo.t)})`,
    `${points.length} price points. This describes the past only.`,
    citation,
  ].join("\n"), {
    name: coin.name,
    symbol: coin.symbol,
    range: rangeId,
    rangeLabel: r.label,
    startUsd: first.c,
    endUsd: last.c,
    changePct: Number(pct.toFixed(2)),
    high: { priceUsd: hi.c, at: hi.t },
    low: { priceUsd: lo.c, at: lo.t },
    points: points.map((p) => ({ t: p.t, c: p.c })),
    source: citation,
  });
}

/* ---------- headlines ---------- */

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
    return data(q
      ? `No recent headline mentions "${about}".`
      : `No headline is recent enough to call today's news (the list was last refreshed ${utc(file.generatedAt)}). Older headlines are not returned.`, { refreshedAt: file.generatedAt, headlines: [] });
  }
  return data(items.map((n) => `${n.title}\n${n.domain}, ${utc(n.seenAt)}: ${n.url}`).join("\n\n") +
    `\n\n${HEADLINE_CREDIT} They link to their publishers; ATLAS Explain does not write or check them.`, {
    refreshedAt: file.generatedAt,
    headlines: items.map((n) => ({ title: n.title, publisher: n.domain, url: n.url, seenAt: n.seenAt })),
  });
}

/* ---------- the economy and the calendar (from ATLAS Explain's own data site) ---------- */

const NO_ECONOMY = "ATLAS Explain's economic data couldn't be loaded right now. Nothing is shown in its place; try again in a few minutes.";
/** Older than this, an answer says plainly that the 6-hourly refresh hasn't run since. */
const ECONOMY_STALE_MS = 2 * 86_400_000;

async function loadEconomy(fetcher: Fetcher): Promise<EconomyFile | null> {
  const body = await getJson(ECONOMY_DATA_URL, fetcher);
  return body == null ? null : readEconomyFile(body);
}

const TOPICS: Record<string, readonly Indicator["id"][]> = {
  inflation: ["us_cpi", "euro_hicp"], prices: ["us_cpi", "euro_hicp"], cpi: ["us_cpi"], hicp: ["euro_hicp"],
  jobs: ["us_unemployment"], unemployment: ["us_unemployment"], employment: ["us_unemployment"], labour: ["us_unemployment"], labor: ["us_unemployment"],
  rates: ["us_fed_funds", "us_sofr", "ca_policy_rate"], fed: ["us_fed_funds", "us_sofr"], sofr: ["us_sofr"], "interest rates": ["us_fed_funds", "us_sofr", "ca_policy_rate"],
  debt: ["us_debt"], deficit: ["us_debt"], euro: ["euro_hicp"], ecb: ["euro_hicp"], europe: ["euro_hicp"], canada: ["ca_policy_rate"], boc: ["ca_policy_rate"],
  us: ["us_cpi", "us_unemployment", "us_fed_funds", "us_sofr", "us_debt"],
};

const fmtIndicator = (i: Indicator): string => (i.unit === "USD" ? (i.value >= 1e12 ? `${(i.value / 1e12).toFixed(2)} trillion` : formatPrice(i.value)) : `${i.value.toFixed(2)}%`);
const fmtChange = (i: Indicator): string => (i.change == null ? "" : ` (${i.change > 0 ? "+" : i.change < 0 ? "−" : "±"}${Math.abs(i.change).toFixed(2)}${i.unit === "%" ? " pt" : "%"} ${i.changeWindow})`);

function eventRecord(e: CalendarEvent, now: number): Record<string, unknown> {
  const daysAway = Math.round((Date.parse(`${e.date}T12:00:00Z`) - now) / 86_400_000);
  return { date: e.date, startDate: e.startDate, institution: e.institution, title: e.title, about: e.about, withProjections: e.withProjections, daysAway, sourceUrl: e.sourceUrl };
}
const eventLine = (e: CalendarEvent, now: number): string => {
  const days = Number(eventRecord(e, now).daysAway);
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return `${e.date}${e.startDate ? ` (meeting from ${e.startDate})` : ""}, ${when}: ${e.title}${e.withProjections ? ", with the Summary of Economic Projections" : ""}. ${e.about} Source: ${e.sourceUrl}`;
};

export async function economySnapshot(topic: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const file = await loadEconomy(fetcher);
  if (!file) return text(NO_ECONOMY, true);
  const q = topic?.trim().toLowerCase() ?? "";
  const ids = q ? TOPICS[q] ?? Object.entries(TOPICS).find(([k]) => q.includes(k))?.[1] : undefined;
  const list = file.indicators.filter((i) => !ids || ids.includes(i.id));
  if (q && !ids) return text(`No economic topic called "${topic}". Try inflation, jobs, rates, debt, euro or canada, or leave it empty for everything.`, true);
  const next = upcoming(file.calendar.events, now, 3);
  const age = now - Date.parse(file.generatedAt);
  const stale = age > ECONOMY_STALE_MS ? ` These were captured ${Math.round(age / 86_400_000)} days ago: the 6-hourly refresh hasn't run since.` : "";
  const lines = list.length
    ? list.map((i) => `${i.name}: ${fmtIndicator(i)} for ${i.period}${fmtChange(i)}.${i.note ? ` ${i.note}` : ""} Source: ${i.source} (${i.sourceUrl}).`)
    : ["None of these figures could be captured yet. Nothing is shown in their place."];
  const body = [
    ...lines,
    next.length ? `\nNext rate decisions:\n${next.map((e) => `- ${eventLine(e, now)}`).join("\n")}` : "",
    `\nCaptured ${utc(file.generatedAt)} by ATLAS Explain's data job from each official source.${stale} These are published figures, never a forecast.`,
  ].filter(Boolean).join("\n");
  return data(body, { refreshedAt: file.generatedAt, indicators: list, nextEvents: next.map((e) => eventRecord(e, now)) });
}

const BANKS: Record<string, CalendarEvent["institution"]> = {
  fed: "Federal Reserve", fomc: "Federal Reserve", "federal reserve": "Federal Reserve", us: "Federal Reserve",
  ecb: "European Central Bank", "european central bank": "European Central Bank", euro: "European Central Bank",
  boc: "Bank of Canada", "bank of canada": "Bank of Canada", canada: "Bank of Canada",
};

export async function economicCalendar(bank: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const file = await loadEconomy(fetcher);
  if (!file) return text(NO_ECONOMY, true);
  const q = bank?.trim().toLowerCase() ?? "";
  const institution = q ? BANKS[q] : undefined;
  if (q && !institution) return text(`"${bank}" isn't one of the central banks ATLAS Explain follows: the Federal Reserve, the European Central Bank and the Bank of Canada.`, true);
  const events = upcoming(file.calendar.events.filter((e) => !institution || e.institution === institution), now, institution ? 8 : 12);
  const body = events.length
    ? `Upcoming rate decisions, soonest first:\n${events.map((e) => `- ${eventLine(e, now)}`).join("\n")}\n\nDates from each central bank's published calendar, read ${utc(file.calendar.capturedAt)}. ATLAS Explain lists the dates only and never guesses a decision.`
    : `No upcoming rate decision is in the calendars ATLAS Explain read (${utc(file.calendar.capturedAt)}). Nothing is shown in its place.`;
  return data(body, { refreshedAt: file.calendar.capturedAt, events: events.map((e) => eventRecord(e, now)) });
}

/* ---------- market depth (bid, ask and the order book) ---------- */

const DEPTH_BANDS = [0.1, 0.5, 1];
const IMPACT_SIZES = [1_000, 10_000, 100_000];

/** Filling `sizeUsd` against one side of the book: the average price and how far it is from the best price. */
function fill(side: [number, number][], sizeUsd: number): { filled: boolean; avgPriceUsd: number | null; slippagePct: number | null } {
  let usdLeft = sizeUsd;
  let coins = 0;
  for (const [price, qty] of side) {
    const take = Math.min(usdLeft, price * qty);
    coins += take / price;
    usdLeft -= take;
    if (usdLeft <= 1e-9) break;
  }
  if (usdLeft > 1e-9 || coins === 0) return { filled: false, avgPriceUsd: null, slippagePct: null };
  const avg = sizeUsd / coins;
  const best = side[0]![0];
  return { filled: true, avgPriceUsd: Number(avg.toPrecision(8)), slippagePct: Number(((Math.abs(avg - best) / best) * 100).toFixed(4)) };
}

/**
 * The depth bands as sentences: each band the book fully covers, then one line for how far the
 * stored levels reach when a band goes beyond them (busy coins hold millions within 0.1%).
 */
function depthLines(depth: { bandPct: number; bidsUsd: number; asksUsd: number; complete: boolean }[], book: { bids: [number, number][]; asks: [number, number][] } | null, mid: number): string[] {
  if (!book) return [];
  const lines = depth.filter((d) => d.complete).map((d) => `Within ${d.bandPct}% of the middle price: ${formatPrice(d.bidsUsd)} of bids and ${formatPrice(d.asksUsd)} of asks.`);
  if (depth.some((d) => !d.complete)) {
    const low = book.bids[book.bids.length - 1]![0];
    const high = book.asks[book.asks.length - 1]![0];
    const total = (side: [number, number][]) => side.reduce((s, [p, q]) => s + p * q, 0);
    lines.push(`The ${book.bids.length} best levels a side reach ${(((mid - low) / mid) * 100).toFixed(2)}% below and ${(((high - mid) / mid) * 100).toFixed(2)}% above the middle price and hold ${formatPrice(Math.round(total(book.bids)))} of bids and ${formatPrice(Math.round(total(book.asks)))} of asks; the book goes further.`);
  }
  return lines;
}

export async function marketDepth(coinKey: string, fetcher: Fetcher): Promise<ToolResult> {
  const coin = coinFor(coinKey);
  if (!coin) return text(`"${coinKey}" isn't one of the ten coins ATLAS Explain follows: ${COIN_NAMES}.`, true);
  const file = await loadCrypto(fetcher);
  if (!file) return text(NO_CRYPTO, true);
  const row = file.prices.coins.find((c) => c.symbol === coin.symbol);
  const book = file.books?.books[coin.symbol] ?? null;
  // The best bid and ask: from the ticker when it has them (fresher), else the top of the book.
  const bid = row?.bidUsd ?? book?.bids[0]?.[0];
  const ask = row?.askUsd ?? book?.asks[0]?.[0];
  if (bid == null || ask == null) return text(`ATLAS Explain has no bid and ask for ${coin.name} right now (they come from Kraken only). Nothing is shown in their place.`, true);
  const quoteAsOf = row?.bidUsd != null ? file.prices.asOf : file.books!.asOf;
  const mid = (bid + ask) / 2;
  const spread = ask - bid;
  const spreadPct = (spread / mid) * 100;
  const depth = book
    ? DEPTH_BANDS.map((band) => {
        const lo = mid * (1 - band / 100);
        const hi = mid * (1 + band / 100);
        const bidsUsd = book.bids.filter(([p]) => p >= lo).reduce((s, [p, q]) => s + p * q, 0);
        const asksUsd = book.asks.filter(([p]) => p <= hi).reduce((s, [p, q]) => s + p * q, 0);
        // If the last level shown is still inside the band, the book goes further than ATLAS Explain keeps.
        const complete = book.bids[book.bids.length - 1]![0] < lo && book.asks[book.asks.length - 1]![0] > hi;
        return { bandPct: band, bidsUsd: Math.round(bidsUsd), asksUsd: Math.round(asksUsd), complete };
      })
    : [];
  const impact = book ? IMPACT_SIZES.flatMap((size) => (["asks", "bids"] as const).map((side) => ({ sizeUsd: size, side, ...fill(side === "asks" ? book.asks : book.bids, size) }))) : [];
  const credit = `${CRYPTO_CREDIT.kraken} Best bid and ask collected ${utc(quoteAsOf)}${book ? `, order book (best ${book.bids.length} levels a side) ${utc(file.books!.asOf)}` : ""}, served from ATLAS Explain's own data site.`;
  const lines = [
    `${coin.name} (${coin.symbol}) on Kraken:`,
    `Best bid ${formatPrice(bid)}, best ask ${formatPrice(ask)}. Spread ${formatPrice(spread)} (${(spreadPct * 100).toFixed(2)} basis points of the middle price, ${formatPrice(mid)}).`,
    ...depthLines(depth, book, mid),
    ...(book ? [`In the order book captured ${utc(file.books!.asOf)}:`] : []),
    ...impact.filter((r) => r.sizeUsd === 10_000).map((r) => r.filled
      ? `- filling $10,000 against the ${r.side} would average ${formatPrice(r.avgPriceUsd!)}, ${r.slippagePct!.toFixed(4)}% from the best ${r.side === "asks" ? "ask" : "bid"} in that book (that gap is called slippage).`
      : `- $10,000 is more than the ${r.side} in the levels shown.`),
    book ? "" : "The order book itself isn't available right now; the bid and ask above are current.",
    "This is a snapshot of how the market looked, to explain spreads and slippage; it never suggests a trade.",
    credit,
  ].filter(Boolean);
  return data(lines.join("\n"), {
    name: coin.name, symbol: coin.symbol, bidUsd: bid, askUsd: ask, midUsd: Number(mid.toPrecision(10)),
    spreadUsd: Number(spread.toPrecision(8)), spreadPct: Number(spreadPct.toFixed(5)), spreadBps: Number((spreadPct * 100).toFixed(2)), quoteAsOf,
    book: book ? { asOf: file.books!.asOf, bids: book.bids, asks: book.asks } : null,
    depth, impact, source: credit,
  });
}

/* ---------- JSON-RPC (the HTTP transport is in src/mcp/http.ts) ---------- */

type Message = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
/** status: the HTTP status the transport should use (2026-07-28 asks for 400/404 on some errors). */
type Reply = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown }; status?: number };

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** The modern protocol version a request declares in _meta, or null for a legacy request. */
export function modernVersion(message: Message): string | null {
  const meta = isRec(message.params?._meta) ? message.params._meta : null;
  return meta && typeof meta[META.protocolVersion] === "string" ? (meta[META.protocolVersion] as string) : null;
}

/** Answers one message; null for notifications, which get no reply. */
export async function handle(message: Message, fetcher: Fetcher): Promise<Reply | null> {
  const id = message.id ?? null;
  const isRequest = message.id !== undefined && message.id !== null;
  const version = modernVersion(message);
  const modern = version !== null;
  // Every result says it is complete and who answered (2026-07-28; harmless extra fields for legacy clients).
  const ok = (result: Record<string, unknown>, cacheable = false): Reply => ({
    jsonrpc: "2.0",
    id,
    result: { ...result, ...(cacheable ? CACHE : {}), resultType: "complete", _meta: { ...(isRec(result._meta) ? result._meta : {}), [META.serverInfo]: { name: SERVER_NAME, version: SERVER_VERSION } } },
  });
  const fail = (code: number, msg: string, data?: unknown, status?: number): Reply => ({ jsonrpc: "2.0", id, error: { code, message: msg, ...(data === undefined ? {} : { data }) }, ...(status ? { status } : {}) });
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return isRequest ? fail(-32600, "Invalid request", undefined, 400) : null;
  if (!isRequest) return null;
  if (modern) {
    if (!(MODERN_PROTOCOLS as readonly string[]).includes(version)) return fail(-32022, "Unsupported protocol version", { supported: ALL_PROTOCOLS, requested: version }, 400);
    const meta = message.params!._meta as Record<string, unknown>;
    if (!isRec(meta[META.clientCapabilities])) return fail(-32602, `Missing ${META.clientCapabilities} in _meta`, undefined, 400);
  }
  switch (message.method) {
    case "server/discover":
      return ok({ supportedVersions: ALL_PROTOCOLS, capabilities: CAPABILITIES, instructions: INSTRUCTIONS, _meta: { [META.serverInfo]: SERVER_INFO() } }, true);
    case "initialize": {
      const asked = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "";
      const protocolVersion = (SUPPORTED_PROTOCOLS as readonly string[]).includes(asked) ? asked : SUPPORTED_PROTOCOLS[0];
      return ok({ protocolVersion, capabilities: CAPABILITIES, serverInfo: SERVER_INFO(), instructions: INSTRUCTIONS });
    }
    case "ping":
      // Removed in 2026-07-28; still answered for legacy clients.
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS }, true);
    case "resources/list":
      return ok({
        resources: [
          ...MCP_APPS.map((a) => ({ uri: a.uri, name: a.name, title: a.title, description: a.description, mimeType: MCP_APP_MIME, icons: ICONS })),
          { uri: LEARNING_PATH_URI, name: "learning-path", title: "The ATLAS Explain learning path", description: "Every topic in order, with its terms explained in plain language.", mimeType: "text/markdown", icons: ICONS },
          ...ALL_TERMS.map(termResource),
        ],
      }, true);
    case "resources/templates/list":
      return ok({ resourceTemplates: [{ uriTemplate: `${GLOSSARY_URI}{term}`, name: "glossary-term", title: "Glossary term", description: "A market term from the ATLAS Explain glossary, in plain language.", mimeType: "text/markdown", icons: ICONS }] }, true);
    case "resources/read": {
      const uri = String(message.params?.uri);
      const app = MCP_APPS.find((a) => a.uri === uri);
      if (app) return ok({ contents: [{ uri, mimeType: MCP_APP_MIME, text: app.html, _meta: { ui: { prefersBorder: true } } }] }, true);
      const doc = readGlossaryResource(uri);
      // Resource not found: -32602 from 2026-07-28 on, -32002 before.
      return doc ? ok({ contents: [doc] }, true) : fail(modern ? -32602 : -32002, `Resource not found: ${uri}`, { uri });
    }
    case "prompts/list":
      return ok({ prompts: PROMPTS.map(({ text: _t, ...p }) => ({ ...p, icons: ICONS })) }, true);
    case "completion/complete": {
      const ref = message.params?.ref as { type?: string; name?: string; uri?: string } | undefined;
      const arg = message.params?.argument as { name?: string; value?: string } | undefined;
      const typed = typeof arg?.value === "string" ? arg.value : "";
      const values =
        ref?.type === "ref/prompt" ? completePromptArgument(String(ref.name), String(arg?.name), typed)
        : ref?.type === "ref/resource" ? completePromptArgument(String(ref.uri), String(arg?.name), typed)
        : [];
      return ok({ completion: { values: values.slice(0, 20), total: values.length, hasMore: values.length > 20 } });
    }
    case "prompts/get": {
      const prompt = PROMPTS.find((p) => p.name === message.params?.name);
      if (!prompt) return fail(-32602, `Unknown prompt: ${String(message.params?.name)}`);
      const args = Object.fromEntries(Object.entries((message.params?.arguments ?? {}) as Record<string, unknown>).map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 200) : ""]));
      return ok({ description: prompt.description, messages: [{ role: "user", content: { type: "text", text: prompt.text(args) } }] });
    }
    case "tools/call": {
      const name = message.params?.name;
      const args = (message.params?.arguments ?? {}) as Record<string, unknown>;
      const s = (v: unknown) => (typeof v === "string" ? v : undefined);
      switch (name) {
        case "explain_term": return ok(explainTerm(s(args.term) ?? ""));
        case "browse_glossary": return ok(browseGlossary(s(args.topic)));
        case "asset_details": return ok(await assetDetails(s(args.asset) ?? "", fetcher));
        case "official_figures": return ok(await officialFigures(s(args.query), fetcher));
        case "crypto_prices": return ok(await cryptoPrices(s(args.coin), fetcher));
        case "price_history": return ok(await priceHistory(s(args.coin) ?? "", s(args.range), fetcher));
        case "todays_headlines": return ok(await todaysHeadlines(s(args.about), fetcher));
        case "economy_snapshot": return ok(await economySnapshot(s(args.topic), fetcher));
        case "economic_calendar": return ok(await economicCalendar(s(args.bank), fetcher));
        case "market_depth": return ok(await marketDepth(s(args.coin) ?? "", fetcher));
        default: return fail(-32602, `Unknown tool: ${String(name)}`);
      }
    }
    default:
      // 2026-07-28: an unknown method is HTTP 404 with -32601, so clients can tell it from a missing endpoint.
      return fail(-32601, `Method not found: ${message.method}`, undefined, modern ? 404 : undefined);
  }
}

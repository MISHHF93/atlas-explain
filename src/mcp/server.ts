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
import { NOTABLE_APP_HTML, NOTABLE_APP_URI } from "./notable-app";
import { AUCTIONS_APP_HTML, AUCTIONS_APP_URI } from "./auctions-app";
import { BRIEF_APP_HTML, BRIEF_APP_URI } from "./brief-app";
import { COUNTRIES_APP_HTML, COUNTRIES_APP_URI } from "./countries-app";
import { EVENTS_APP_HTML, EVENTS_APP_URI } from "./events-app";
import { SERIES_APP_HTML, SERIES_APP_URI } from "./series-app";
import { MONEY_APP_HTML, MONEY_APP_URI } from "./money-app";
import { BANK_LICENCE, BANK_NAME, compareStatements, readDocsFile, watchingSentences, type DocBank, type Statement } from "../data/docs";
import { noPriceNote, officialPriceLink } from "../core/price-links";
import { rateChangeImpact, type ImpactCountry, type ImpactProduct } from "../core/rate-impact";
import { moneyMaths, type MoneyCalc } from "../core/money-maths";
import { CHECKS, matchRedFlags, RED_FLAGS, REPORT } from "../core/red-flags";
import { comingUp } from "../core/coming-up";
import { countdown } from "../core/scenarios";
import { ICON_PNG_64_BASE64 } from "./icon-data";
import { decisionTime, readEconomyFile, upcoming, type Auction, type CalendarEvent, type EconomyFile, type Indicator, type IndicatorId } from "../data/economy";
import { ALL_TERMS, searchTerms, TERM_GROUP_LABEL } from "../core/terms";

export const SERVER_NAME = "atlas-explain";
export const SERVER_VERSION = "1.20.0";
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
import { OECD_SHARES_SOURCE, WORLD_COUNTRIES, WORLD_INDICATORS, readWorldFile, type WorldFile, type WorldIndicatorId } from "../data/world";
import { APP_URL, CRYPTO_DATA_URL, ECONOMY_DATA_URL, EDUCATION_LINE, EXPLAIN_WEB_URL, MARKET_DATA_URL, MCP_ORIGIN, NEWS_DATA_URL, WORLD_DATA_URL, DOCS_DATA_URL } from "../core/links";
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
  /** The MCP App this tool draws, and (economy_snapshot) a global entry point on Claude's Artifacts page. */
  _meta?: { ui: { resourceUri: string }; "openai/ui"?: { entrypoints: { type: "global" }[] } };
}

const str = (description: string) => ({ type: "string", description });
const nullable = (type: string) => ({ type: [type, "null"] });
/** The ATLAS Explain mark, shown next to the server and its tools in clients that support icons (MCP 2025-11-25). */
// Served by this server from its own address (src/mcp/http.ts): a PNG every client supports, and the SVG.
export const ICONS = [
  { src: `${MCP_ORIGIN}/icon.png`, mimeType: "image/png", sizes: ["512x512"] },
  { src: `${MCP_ORIGIN}/icon.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
] as const;
/**
 * The server's own icons: an inline 64 px PNG first, because Claude shows only an inline data: PNG
 * or JPEG (64–128 px, under 10 KB) as an MCP App's icon and never fetches one from a URL; then the
 * URLs for other clients. Only in serverInfo, so tools and resources stay small.
 */
export const SERVER_ICONS = [{ src: `data:image/png;base64,${ICON_PNG_64_BASE64}`, mimeType: "image/png", sizes: ["64x64"] }, ...ICONS] as const;
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
    description: "The plain-language meaning of a market or economics term from ATLAS Explain's glossary, such as stop-limit order, yield curve, inflation or P/E. Use it when someone asks what a term means. Up to three closest terms, each with its glossary group. Education only.",
    inputSchema: { type: "object", properties: { term: str("The term or phrase to look up.") }, required: ["term"], additionalProperties: false },
    annotations: annotations("Explain a market term", false),
    icons: ICONS,
    outputSchema: obj({ query: { type: "string" }, found: { type: "boolean" }, terms: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, group: { type: "string" } } } }, learnUrl: { type: "string" } }, ["query", "found", "terms"]),
  },
  {
    name: "browse_glossary",
    title: "Browse the glossary and learning path",
    description: "List ATLAS Explain's learning path (topics in order, each with its terms) or every glossary term in one group. Use it to suggest what to learn next, or to find the right term to explain.",
    inputSchema: { type: "object", properties: { topic: str("Optional learning-path topic or glossary group, for example 'orders', 'risk', 'rates', 'futures'. Leave empty for the whole path.") }, additionalProperties: false },
    annotations: annotations("Browse the glossary and learning path", false),
    icons: ICONS,
    outputSchema: obj({
      topic: nullable("string"),
      steps: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, terms: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, summary: { type: "string" }, group: { type: "string" } } } } } } },
      groups: { type: "array", items: { type: "object", properties: { id: { type: "string" }, label: { type: "string" }, count: { type: "number" } } } },
      totalTerms: { type: "number" },
    }, ["steps", "totalTerms"]),
  },
  {
    name: "asset_details",
    title: "What an asset is",
    description: "What one asset is, where and when it trades, and its latest official figure or price with source and time, or why no price is shown. Use it when someone asks about a specific coin, stock, ETF, currency, rate or index. Covers crypto, US stocks and ETFs, currencies, interest rates, energy, indices, futures and options.",
    inputSchema: { type: "object", properties: { asset: str("Name or symbol, for example 'Bitcoin', 'AAPL', 'EUR/USD', '10-year', 'S&P 500'.") }, required: ["asset"], additionalProperties: false },
    annotations: annotations("What an asset is", true),
    icons: ICONS,
    outputSchema: obj({ found: { type: "boolean" }, ...((FIGURE.properties as Schema)), venue: nullable("string"), about: { type: "string" }, tradingHours: nullable("string"), priceUsd: nullable("number"), relatedTerms: { type: "array", items: { type: "string" } }, appUrl: { type: "string" } }, ["found"]),
  },
  {
    name: "official_figures",
    title: "Official market figures",
    description: "Official figures with source and date: US Treasury yields, ECB and Bank of Canada rates, EIA energy prices, and SEC-filed company figures. Use it for rates, yields, exchange rates or a company's reported results. The SEC figures cover revenue, net income, earnings per share and shares outstanding for about 30 large US companies and ETFs. Optional search by name or symbol.",
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
    description: "Current prices and today's change for ten major coins, biggest moves first, with when they were collected. Use it for how crypto is doing today, or one coin's price. Coins: Bitcoin, Ethereum, Solana, XRP, Cardano, Dogecoin, Litecoin, Polkadot, Chainlink and Avalanche, each with its last 24 hours of hourly closes. Refreshed about every 10 minutes by ATLAS Explain's data job from Kraken's public market data (CoinGecko as backup) and served from ATLAS Explain's own data site.",
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
    description: "How a coin moved over 24 hours, 7 days or 30 days: start, end, change, high and low with their times. Use it when someone asks how a coin moved or wants a price chart. From the hourly closes on ATLAS Explain's own data site (refreshed about every 10 minutes). Describes the past only; never a forecast.",
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
    description: "Recent market headlines and official press releases, each with publisher, link and time. Use it for what's in the news, optionally about one company or coin. Sources: official press releases from the Federal Reserve, SEC, CFTC, ECB, Bank of Canada and Bank of England, and the GDELT Project's news index. News stories older than 36 hours and releases older than 4 days are never returned.",
    inputSchema: { type: "object", properties: { about: str("Optional company, coin or word, for example 'Nvidia' or 'Bitcoin'.") }, additionalProperties: false },
    annotations: annotations("Today's market headlines", true),
    icons: ICONS,
    outputSchema: obj({ refreshedAt: { type: "string" }, headlines: { type: "array", items: { type: "object", properties: { title: { type: "string" }, publisher: { type: "string" }, url: { type: "string" }, seenAt: { type: "string" } }, required: ["title", "url"] } } }, ["headlines"]),
  },
  {
    name: "economy_snapshot",
    title: "The economy at a glance",
    description: "Headline economic figures with period, change and source: inflation, unemployment, policy rates and US public debt, plus the next rate decisions. Use it for how the economy is doing, or one topic. Covers US CPI over 12 months and unemployment (Bureau of Labor Statistics), the effective federal funds rate with the Fed's target range and SOFR (New York Fed), euro-area inflation and the ECB deposit rate (ECB), Canada's policy rate (Bank of Canada), the UK's Bank Rate (Bank of England) and US public debt (Treasury), each with about a year of history. Optional filter by topic.",
    inputSchema: { type: "object", properties: { topic: str("Optional topic, for example 'inflation', 'jobs', 'rates', 'debt', 'euro' or 'canada'. Leave empty for all.") }, additionalProperties: false },
    annotations: annotations("The economy at a glance", true),
    icons: ICONS,
    outputSchema: obj({ refreshedAt: { type: "string" }, indicators: { type: "array", items: INDICATOR }, nextEvents: { type: "array", items: EVENT } }, ["indicators"]),
    // Clients that support MCP Apps draw cards and trend charts (src/mcp/economy-app.ts). Every input is
    // optional, so Claude can also list it on the Artifacts page as an app people open themselves.
    _meta: { ui: { resourceUri: ECONOMY_APP_URI }, "openai/ui": { entrypoints: [{ type: "global" }] } },
  },
  {
    name: "economic_calendar",
    title: "Upcoming rate decisions",
    description: "Dates of the next interest-rate decisions by the Federal Reserve, the European Central Bank, the Bank of Canada and the Bank of England, with what happens on the day. Use it for when the next Fed, ECB, Bank of Canada or Bank of England meeting is. From each bank's own published calendar. Dates only: it never guesses the outcome. Optional filter by central bank.",
    inputSchema: { type: "object", properties: { bank: str("Optional: 'Fed', 'ECB', 'Bank of Canada' or 'Bank of England'. Leave empty for all.") }, additionalProperties: false },
    annotations: annotations("Upcoming rate decisions", true),
    icons: ICONS,
    outputSchema: obj({ refreshedAt: { type: "string" }, events: { type: "array", items: EVENT } }, ["events"]),
  },
  {
    name: "market_depth",
    title: "Bid, ask and order book",
    description: "A coin's best bid and ask, bid-ask spread, order-book depth, and the slippage of filling an order of a given size. Use it to explain spreads, liquidity or trading costs with real numbers. For the ten coins ATLAS Explain follows, from Kraken's public market data; the spread is refreshed every few minutes and the order book about every 10 minutes. Explains how markets work; never suggests a trade.",
    inputSchema: { type: "object", properties: { coin: str("Coin name or symbol, for example 'BTC'.") }, required: ["coin"], additionalProperties: false },
    annotations: annotations("Bid, ask and order book", true),
    icons: ICONS,
    outputSchema: obj({
      name: { type: "string" }, symbol: { type: "string" }, bidUsd: { type: "number" }, askUsd: { type: "number" }, midUsd: { type: "number" },
      spreadUsd: { type: "number" }, spreadPct: { type: "number" }, spreadBps: { type: "number" }, quoteAsOf: { type: "string" }, bookMidUsd: nullable("number"),
      book: { type: ["object", "null"], properties: { asOf: { type: "string" }, bids: { type: "array" }, asks: { type: "array" } } },
      depth: { type: "array", items: { type: "object", properties: { bandPct: { type: "number" }, bidsUsd: { type: "number" }, asksUsd: { type: "number" }, complete: { type: "boolean" } } } },
      impact: { type: "array", items: { type: "object", properties: { sizeUsd: { type: "number" }, side: { type: "string", enum: ["asks", "bids"] }, filled: { type: "boolean" }, avgPriceUsd: nullable("number"), slippagePct: nullable("number") } } },
      source: { type: "string" },
    }, ["symbol", "bidUsd", "askUsd", "spreadUsd", "source"]),
    // Clients that support MCP Apps draw the order book as a depth chart (src/mcp/depth-app.ts).
    _meta: { ui: { resourceUri: DEPTH_APP_URI } },
  },
  {
    name: "evidence_brief",
    title: "Evidence brief on one asset",
    description: "Everything ATLAS Explain knows about one asset on one page, each fact sourced, plus what the facts don't tell you. Use it when someone wants the full picture on a coin, company, currency or rate. Includes what it is, its latest figures or price, how it moved over 7 days and how easily it trades (coins), the economic backdrop and the next rate decision, headlines that name it, terms to know, and what people commonly look at for this kind of asset. Facts only: it never recommends, rates or forecasts anything.",
    inputSchema: { type: "object", properties: { asset: str("Name or symbol, for example 'Bitcoin', 'AAPL', 'EUR/USD' or '10-year'.") }, required: ["asset"], additionalProperties: false },
    annotations: annotations("Evidence brief on one asset", true),
    icons: ICONS,
    _meta: { ui: { resourceUri: BRIEF_APP_URI } },
    outputSchema: obj({
      asset: { type: "object", properties: { name: { type: "string" }, symbol: { type: "string" }, assetClass: { type: "string" }, appUrl: nullable("string") } },
      facts: { type: "array", items: { type: "object" } },
      recentMove: { type: ["object", "null"] },
      liquidity: { type: ["object", "null"] },
      backdrop: { type: "array", items: { type: "object" } },
      nextDecision: { type: ["object", "null"] },
      news: { type: "array", items: { type: "object" } },
      terms: { type: "array", items: { type: "object" } },
      weigh: { type: "array", items: { type: "string" } },
      limits: { type: "array", items: { type: "string" } },
    }, ["asset", "facts", "limits"]),
  },
  {
    name: "notable_today",
    title: "What's notable today",
    description: "What stands out in today's data, each with its source and the rule that picked it: unusual crypto moves, a flat or inverted yield curve, rate decisions this week, changed economic figures. Use it for what's happening or what's worth knowing today. Also lists new official releases and what was checked but found ordinary. Describes the past only; never a forecast or a suggestion.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: annotations("What's notable today", true),
    icons: ICONS,
    outputSchema: obj({
      asOf: { type: "string" },
      observations: { type: "array", items: { type: "object", properties: {
        kind: { type: "string", enum: ["crypto_move", "yield_curve", "rate_decision", "economic_change", "official_release"] },
        title: { type: "string" }, detail: { type: "string" }, asOf: nullable("string"), source: { type: "string" }, sourceUrl: nullable("string"),
        rule: { type: "string" }, terms: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" } } } },
      } } },
      quiet: { type: "array", items: { type: "string" } },
      unavailable: { type: "array", items: { type: "string" } },
      limits: { type: "array", items: { type: "string" } },
    }, ["observations", "limits"]),
    // Clients that support MCP Apps draw a card per item (src/mcp/notable-app.ts).
    _meta: { ui: { resourceUri: NOTABLE_APP_URI } },
  },
  {
    name: "upcoming_events",
    title: "Coming up: decisions and data releases",
    description: "The next scheduled market events with exact times and a countdown: Fed, ECB, Bank of Canada and Bank of England rate decisions and the US inflation, jobs and producer-price releases. Use it for what's coming up, or when the next CPI or jobs report or rate decision is. Each event has the latest related figure and 'if this happens' explainers for each possible outcome, from the banks' and the BLS's own calendars. It never says which outcome will happen. Optional filter: 'rates' or 'data'.",
    inputSchema: { type: "object", properties: { only: { type: "string", enum: ["rates", "data"], description: "Optional: only rate decisions, or only data releases." } }, additionalProperties: false },
    annotations: annotations("Coming up: decisions and data releases", true),
    icons: ICONS,
    _meta: { ui: { resourceUri: EVENTS_APP_URI } },
    outputSchema: obj({
      refreshedAt: { type: "string" },
      events: { type: "array", items: { type: "object", properties: {
        kind: { type: "string" }, who: { type: "string" }, title: { type: "string" }, time: { type: "string" }, countdown: { type: "string" },
        about: { type: "string" }, context: nullable("string"), sourceUrl: { type: "string" }, scenarios: { type: "object" },
      } } },
    }, ["events"]),
  },
  {
    name: "money_maths",
    title: "Money maths",
    description: "Works out compound growth, what a fee costs over the years, what inflation does to cash, or how holding more things changes how much a mix swings, from numbers the person gives. Use it to show how money grows or shrinks over time with their own example. Pure arithmetic, drawn as a chart they can change in Claude; the rate is their assumption, never a forecast or a suggestion.",
    inputSchema: { type: "object", properties: {
      calculation: { type: "string", enum: ["compound_growth", "fees", "inflation", "diversification"], description: "Which calculation." },
      amount: { type: "number", description: "Starting amount (compound_growth, fees, inflation)." },
      monthly: { type: "number", description: "Optional amount added each month (compound_growth, fees)." },
      rate_pct: { type: "number", description: "Yearly return the person wants to assume, in percent (compound_growth, fees)." },
      fee_pct: { type: "number", description: "Yearly fee in percent of the balance (fees)." },
      inflation_pct: { type: "number", description: "Yearly inflation to assume, in percent (inflation)." },
      years: { type: "number", description: "Number of years, 1 to 60." },
      volatility_pct: { type: "number", description: "How much one holding swings in a year, in percent (diversification)." },
      correlation: { type: "number", description: "How closely holdings move together, -1 to 1 (diversification)." },
      holdings: { type: "number", description: "Show up to this many holdings, 2 to 100 (diversification; default 20)." },
    }, required: ["calculation"], additionalProperties: false },
    annotations: annotations("Money maths", false),
    icons: ICONS,
    outputSchema: obj({
      calculation: { type: "string" }, inputs: { type: "object" },
      series: { type: "array", items: { type: "object", properties: { name: { type: "string" }, points: { type: "array" } } } },
      lines: { type: "array", items: { type: "string" } }, xLabel: { type: "string" }, yLabel: { type: "string" },
    }, ["calculation", "series", "lines"]),
    // Clients that support MCP Apps draw the chart with the inputs as fields to change (src/mcp/money-app.ts).
    _meta: { ui: { resourceUri: MONEY_APP_URI } },
  },
  {
    name: "scam_red_flags",
    title: "Investment scam warning signs",
    description: "The warning signs of investment fraud regulators describe, which of them a message or offer shows, where to check a seller's registration and where to report, plus recent official fraud actions. Use it when someone asks whether an offer, message or 'opportunity' looks like a scam. It points out warning signs; it never says something is or isn't a scam, and the text given is not kept.",
    inputSchema: { type: "object", properties: { pitch: str("Optional: the message, ad or offer the person received, in their words or pasted. Leave empty for the full list of warning signs.") }, additionalProperties: false },
    annotations: annotations("Investment scam warning signs", true),
    icons: ICONS,
    outputSchema: obj({
      matched: { type: "array", items: { type: "object", properties: { id: { type: "string" }, title: { type: "string" }, why: { type: "string" }, source: { type: "object" } } } },
      allSigns: { type: "array", items: { type: "string" } },
      check: { type: "array", items: { type: "object" } },
      report: { type: "array", items: { type: "object" } },
      recentActions: { type: "array", items: { type: "object" } },
    }, ["matched", "check", "report"]),
  },
  {
    name: "treasury_auctions",
    title: "US Treasury auctions",
    description: "Upcoming US Treasury auctions and the latest results: what is sold, how much, the yield it set and how much demand there was. Use it to explain how the US government borrows, or what bid-to-cover and auction yields mean. From TreasuryDirect, refreshed every 6 hours. Describes auctions that are announced or done; never predicts a result. Optional filter: bills, notes, bonds or TIPS.",
    inputSchema: { type: "object", properties: { kind: str("Optional: 'bills', 'notes', 'bonds' or 'TIPS'. Leave empty for all.") }, additionalProperties: false },
    annotations: annotations("US Treasury auctions", true),
    icons: ICONS,
    _meta: { ui: { resourceUri: AUCTIONS_APP_URI } },
    outputSchema: obj({
      refreshedAt: { type: "string" },
      upcoming: { type: "array", items: { type: "object" } },
      recent: { type: "array", items: { type: "object" } },
      source: { type: "string" },
    }, ["upcoming", "recent"]),
  },
  {
    name: "compare_countries",
    title: "Countries compared",
    description: "GDP growth, inflation, unemployment and GDP per person for the G20 countries and the EU, with the year of each figure, from the World Bank. Use it to compare economies or put one country's figures in context. Actual published values only (World Development Indicators, CC BY 4.0), updated daily; never a projection. Optional: one indicator and a list of countries.",
    inputSchema: { type: "object", properties: {
      indicator: str("Optional: 'gdp growth', 'inflation', 'unemployment' or 'gdp per person'. Leave empty for all four."),
      countries: str("Optional: country names or codes separated by commas, for example 'Canada, Japan, Germany'. Leave empty for the whole G20."),
    }, additionalProperties: false },
    annotations: annotations("Countries compared", true),
    icons: ICONS,
    _meta: { ui: { resourceUri: COUNTRIES_APP_URI } },
    outputSchema: obj({
      refreshedAt: { type: "string" }, source: { type: "string" },
      indicators: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, unit: { type: "string" }, about: { type: "string" } } } },
      countries: { type: "array", items: { type: "object", properties: { code: { type: "string" }, name: { type: "string" }, values: { type: "object" } } } },
    }, ["indicators", "countries"]),
  },
  {
    name: "data_series",
    title: "Data series for charts and reports",
    description: "Clean dated rows of official economic data, with source and licence, for making a chart, spreadsheet, table or report. Use it when someone wants the numbers themselves, or to build something from them. Covers US inflation, unemployment, the fed funds rate, SOFR and debt, euro-area inflation, the ECB, Bank of Canada and Bank of England rates, and World Bank GDP growth, inflation, unemployment and GDP per person for the G20. Also returns CSV. Leave empty for the list. Never crypto or stock prices.",
    inputSchema: { type: "object", properties: {
      series: str("Optional: one to four series ids or names, separated by commas, for example 'us_cpi, uk_bank_rate' or 'world_inflation'. Leave empty to list what's available."),
      countries: str("For world_ series: up to six G20 country names or codes, for example 'Japan, Germany'. Defaults to the United States."),
    }, additionalProperties: false },
    annotations: annotations("Data series for charts and reports", true),
    icons: ICONS,
    _meta: { ui: { resourceUri: SERIES_APP_URI } },
    outputSchema: obj({
      series: { type: "array", items: { type: "object", properties: { id: { type: "string" }, name: { type: "string" }, unit: { type: "string" }, frequency: { type: "string" }, country: nullable("string"), source: { type: "string" }, sourceUrl: { type: "string" }, licence: { type: "string" }, points: { type: "array", items: { type: "object", properties: { date: { type: "string" }, value: { type: "number" } } } } } } },
      available: { type: "array", items: { type: "object" } },
      csv: { type: "string" },
    }, ["series", "csv"]),
  },
];

export const INSTRUCTIONS =
  "Read-only look-ups from ATLAS Explain, an education-only market explainer: explain_term and browse_glossary for plain-language terms and the learning path; asset_details and official_figures for what an asset is and its official numbers with sources; crypto_prices and price_history for recent crypto prices (refreshed about every 10 minutes) and past moves; todays_headlines for recent news and official releases; economy_snapshot for inflation, jobs, policy rates and debt; economic_calendar for upcoming central-bank rate decisions; market_depth for a coin's bid-ask spread, order book and slippage; evidence_brief for all of these on one asset at once, with what the facts don't tell you; notable_today for what stands out across all the data today, each picked by a stated rule; compare_countries for GDP growth, inflation, unemployment and GDP per person across the G20; data_series for clean dated rows (and CSV) of official economic data to build charts, spreadsheets or reports from; upcoming_events for the next rate decisions and US data releases with exact times, countdowns and what each possible outcome would mean; treasury_auctions for US Treasury auctions; money_maths for compound growth, fees, inflation and diversification worked out from the person's own numbers; scam_red_flags for the warning signs of investment fraud and where to check and report. In clients that support MCP Apps, crypto_prices, price_history, official_figures, economy_snapshot, market_depth, notable_today, money_maths, evidence_brief, compare_countries, upcoming_events, treasury_auctions and data_series also draw interactive views. Glossary terms are also readable as resources. Every result names its source and time. Education only: never present results as trade advice or a forecast.";
export const CAPABILITIES = {
  tools: { listChanged: false },
  resources: { listChanged: false },
  prompts: { listChanged: false },
  completions: {},
  // The views (see MCP_APPS) are MCP Apps; hosts without them get the text answer.
  extensions: { "io.modelcontextprotocol/ui": { mimeTypes: [MCP_APP_MIME] } },
};
const SERVER_INFO = () => ({ name: SERVER_NAME, title: "ATLAS Explain", version: SERVER_VERSION, websiteUrl: EXPLAIN_WEB_URL, icons: SERVER_ICONS });

/** Dashboards that Claude's guidelines place in the side panel rather than inline in the conversation. */
const SIDE_PANEL_APPS: ReadonlySet<string> = new Set([ECONOMY_APP_URI, DEPTH_APP_URI]);

/** The interactive views (MCP Apps) the tools above point at with _meta.ui.resourceUri. */
export const MCP_APPS = [
  { uri: CHART_APP_URI, name: "price-chart", title: "Interactive price chart", description: "The chart price_history draws in clients that support MCP Apps.", html: CHART_APP_HTML },
  { uri: BOARD_APP_URI, name: "crypto-board", title: "Crypto price board", description: "The board crypto_prices draws in clients that support MCP Apps: prices, changes and 24-hour sparklines; a coin opens its chart.", html: BOARD_APP_HTML },
  { uri: ECONOMY_APP_URI, name: "economy", title: "The economy at a glance", description: "The view economy_snapshot draws in clients that support MCP Apps: a card per indicator, its trend over about a year, and the next rate decisions.", html: ECONOMY_APP_HTML },
  { uri: DEPTH_APP_URI, name: "market-depth", title: "Order book depth chart", description: "The view market_depth draws in clients that support MCP Apps: best bid and ask, the spread, a depth chart of the order book and slippage by order size.", html: DEPTH_APP_HTML },
  { uri: MONEY_APP_URI, name: "money-maths", title: "Money maths", description: "The view money_maths draws in clients that support MCP Apps: the result as a chart, with the inputs as fields to change.", html: MONEY_APP_HTML },
  { uri: NOTABLE_APP_URI, name: "notable-today", title: "What's notable today", description: "The view notable_today draws in clients that support MCP Apps: a card per item with why it was picked and its source, then what was checked and found ordinary.", html: NOTABLE_APP_HTML },
  { uri: COUNTRIES_APP_URI, name: "countries", title: "Countries compared", description: "The view compare_countries draws in clients that support MCP Apps: a bar per country for one indicator, with the year of each figure.", html: COUNTRIES_APP_HTML },
  { uri: EVENTS_APP_URI, name: "coming-up", title: "Coming up", description: "The view upcoming_events draws in clients that support MCP Apps: a timeline of rate decisions and data releases, with countdowns and what each outcome would mean.", html: EVENTS_APP_HTML },
  { uri: AUCTIONS_APP_URI, name: "treasury-auctions", title: "US Treasury auctions", description: "The view treasury_auctions draws in clients that support MCP Apps: auctions announced, and recent results as bars of yield with bid-to-cover.", html: AUCTIONS_APP_HTML },
  { uri: BRIEF_APP_URI, name: "evidence-brief", title: "Evidence brief", description: "The view evidence_brief draws in clients that support MCP Apps: a one-page fact sheet with sources and what the brief doesn't tell you.", html: BRIEF_APP_HTML },
  { uri: SERIES_APP_URI, name: "data-series", title: "Data series", description: "The view data_series draws in clients that support MCP Apps: a chart per series with its latest value, period, source and licence.", html: SERIES_APP_HTML },
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

/* ---------- v2 tools (docs/V2_DESIGN.md), each off until named in the Worker's V2_TOOLS variable ---------- */

export const V2_TOOLS = [
  {
    name: "rate_change_impact",
    title: "What a rate change would do to my numbers",
    description: "Works out what a change in interest rates would do to someone's own variable-rate mortgage payment, HELOC interest, savings interest or GIC/CD renewal, to the cent, and which central bank drives that product (Canada: Bank of Canada; US: the Federal Reserve). Use it when someone asks what a cut or a rise would mean for them. Pure arithmetic on the numbers they give; it never says whether a change will happen.",
    inputSchema: { type: "object", properties: {
      product: { type: "string", enum: ["variable_mortgage", "heloc", "savings", "gic_cd"], description: "What to work out." },
      balance: { type: "number", description: "Amount owed (mortgage, HELOC) or held (savings, GIC/CD), in dollars." },
      rate_pct: { type: "number", description: "The rate today, in percent a year." },
      change_pts: { type: "number", description: "The change to work out, in percentage points: -0.25 for a quarter-point cut, 0.5 for a half-point rise." },
      months: { type: "number", description: "Mortgage: months left to pay it off (default 300). GIC/CD: the term in months (default 12)." },
      country: { type: "string", enum: ["CA", "US"], description: "Where the product is. Decides which central bank it follows and, for mortgages, the usual compounding. Ask if unsure." },
      compounding: { type: "string", enum: ["semi-annual", "monthly"], description: "Mortgage only. Defaults to semi-annual in Canada, monthly in the US." },
    }, required: ["product", "balance", "rate_pct", "change_pts"], additionalProperties: false },
    annotations: annotations("What a rate change would do to my numbers", false),
    icons: ICONS,
    outputSchema: obj({
      product: { type: "string" }, country: { type: "string" },
      inputs: { type: "object" },
      rows: { type: "array", items: { type: "object", properties: { label: { type: "string" }, before: { type: "number" }, after: { type: "number" }, change: { type: "number" } } } },
      lines: { type: "array", items: { type: "string" } },
      follows: { type: "string" },
      assumptions: { type: "array", items: { type: "string" } },
    }, ["product", "rows", "lines", "follows"]),
  },
  {
    name: "decision_explainer",
    title: "A rate decision, explained from the statement",
    description: "What the Federal Reserve, the Bank of Canada, the European Central Bank or the Bank of England decided at its latest rate decision (or the one before), how the official statement's wording changed from the previous one, word for word, and what the bank itself says it is watching, quoted with links. Use it when someone asks what a central bank just did or what changed. From the banks' own statements; it never says what the bank will do next.",
    inputSchema: { type: "object", properties: {
      bank: { type: "string", enum: ["fed", "boc", "ecb", "boe"], description: "fed (Federal Reserve), boc (Bank of Canada), ecb (European Central Bank) or boe (Bank of England)." },
      date: str("Optional: the decision date, YYYY-MM-DD. Defaults to the latest; the one before is also kept."),
    }, required: ["bank"], additionalProperties: false },
    annotations: annotations("A rate decision, explained from the statement", true),
    icons: ICONS,
    outputSchema: obj({
      bank: { type: "string" }, institution: { type: "string" },
      decision: { type: "object" }, previous: { type: "object" },
      changes: { type: "array", items: { type: "object", properties: { before: { type: "string" }, removed: { type: "string" }, added: { type: "string" } } } },
      watching: { type: "array", items: { type: "object", properties: { text: { type: "string" }, source: { type: "object" }, asOf: { type: "string" } } } },
      next: { type: "object" },
      sources: { type: "array", items: { type: "object", properties: { name: { type: "string" }, url: { type: "string" }, asOf: { type: "string" } } } },
    }, ["bank", "decision", "changes", "sources"]),
  },
  {
    name: "speech_tracker",
    title: "Central bankers' recent speeches",
    description: "Recent speeches and remarks by Federal Reserve, Bank of Canada, ECB or Bank of England policymakers: who spoke, when, the title, the bank's own one-line description and a link to the full text. Use it when someone asks what central bankers have been saying. Descriptions are the bank's own words, attributed; nothing is added or interpreted.",
    inputSchema: { type: "object", properties: {
      bank: { type: "string", enum: ["fed", "boc", "ecb", "boe"], description: "fed (Federal Reserve), boc (Bank of Canada), ecb (European Central Bank) or boe (Bank of England)." },
      days: { type: "number", description: "How far back to look, in days (default 30, at most 90)." },
    }, required: ["bank"], additionalProperties: false },
    annotations: annotations("Central bankers' recent speeches", true),
    icons: ICONS,
    outputSchema: obj({
      bank: { type: "string" }, institution: { type: "string" },
      speeches: { type: "array", items: { type: "object", properties: { date: { type: "string" }, speaker: nullable("string"), title: { type: "string" }, about: { type: "string" }, url: { type: "string" }, source: { type: "object" } } } },
      refreshedAt: { type: "string" },
    }, ["bank", "speeches"]),
  },
];

let enabledV2: ReadonlySet<string> = new Set();
/** The Worker passes its V2_TOOLS variable (a comma list) on each request; unknown names are ignored. */
export function setFeatures(v2Tools: string | undefined): void {
  const names = new Set(V2_TOOLS.map((t) => t.name));
  enabledV2 = new Set((v2Tools ?? "").split(",").map((w) => w.trim()).filter((w) => names.has(w)));
}
/** The tools a client is offered: v1's, plus any v2 tool switched on. */
export function visibleTools(): readonly ((typeof TOOLS)[number] | (typeof V2_TOOLS)[number])[] {
  return [...TOOLS, ...V2_TOOLS.filter((t) => enabledV2.has(t.name))];
}

export function rateChangeImpactTool(args: Record<string, unknown>): ToolResult {
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);
  const r = rateChangeImpact({
    product: String(args.product) as ImpactProduct,
    balance: n(args.balance), ratePct: n(args.rate_pct), changePts: n(args.change_pts),
    months: args.months == null ? undefined : n(args.months),
    country: args.country === "US" ? "US" : args.country === "CA" ? "CA" : (undefined as ImpactCountry | undefined),
    compounding: args.compounding === "monthly" ? "monthly" : args.compounding === "semi-annual" ? "semi-annual" : undefined,
  });
  if ("error" in r) return text(r.error, true);
  const countryNote = args.country == null ? "\nCountry not given, so Canada was assumed; say if it's the US." : "";
  return data(`${r.lines.join("\n")}\n\nWhich rate it follows: ${r.follows}\nAssumed: ${r.assumptions.join(" ")}${countryNote}`, r as unknown as Record<string, unknown>);
}

/* ---------- decision_explainer and speech_tracker (v2 phase 2), from docs.json ---------- */

const NO_DOCS = "ATLAS Explain's copies of the banks' statements and speeches couldn't be loaded right now. Nothing is shown in their place; try again later.";
const BANK_WORDS: Record<string, DocBank> = {
  fed: "fed", "federal reserve": "fed", fomc: "fed", boc: "boc", "bank of canada": "boc",
  ecb: "ecb", "european central bank": "ecb", boe: "boe", "bank of england": "boe", mpc: "boe",
};
const docBank = (v: unknown): DocBank | null => BANK_WORDS[String(v ?? "").trim().toLowerCase()] ?? null;
const CHOOSE_BANK = "Choose a bank: fed (Federal Reserve), boc (Bank of Canada), ecb (European Central Bank) or boe (Bank of England).";
/** Text whose terms for commercial reuse aren't confirmed yet (Bank of Canada, Bank of England): short quotes with links. */
const quote = (bank: DocBank, s: string, words = 25) => {
  if (BANK_LICENCE[bank] !== "confirm") return s;
  const w = s.split(/\s+/);
  return w.length > words ? w.slice(0, words).join(" ") + " …" : s;
};
const describe = (bank: DocBank, d: Statement) => {
  const x = d.decision;
  if (!x) return `${BANK_NAME[bank]} statement of ${d.date}`;
  const level = x.range ? `a target range of ${x.range.replace(" to ", "% to ")}%` : `${x.rate}%`;
  const rate = bank === "ecb" ? "its deposit facility rate" : bank === "boe" ? "Bank Rate" : "its rate";
  const verb = x.action === "hold" ? `held ${rate} at` : x.action === "raise" ? `raised ${rate}${x.bp ? ` by ${x.bp} basis points` : ""} to` : `lowered ${rate}${x.bp ? ` by ${x.bp} basis points` : ""} to`;
  return `On ${d.date} the ${BANK_NAME[bank]} ${verb} ${level}`;
};

export async function decisionExplainer(bankArg: unknown, date: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const bank = docBank(bankArg);
  if (!bank) return text(CHOOSE_BANK, true);
  const body = await getJson(DOCS_DATA_URL, fetcher);
  const docs = body == null ? null : readDocsFile(body);
  if (!docs) return text(NO_DOCS, true);
  const list = docs.statements[bank];
  if (!list.length) return text(`No ${BANK_NAME[bank]} statement is stored yet. Nothing is shown in its place.`, true);
  const i = date ? list.findIndex((s) => s.date === date.trim()) : 0;
  if (i < 0) return text(`Only the last two ${BANK_NAME[bank]} decisions are kept: ${list.map((s) => s.date).join(" and ")}.`, true);
  const cur = list[i]!, prev = list[i + 1] ?? null;
  const cmp = prev ? compareStatements(prev.paragraphs, cur.paragraphs) : null;
  const changes = cmp?.changes ?? [];
  const shown = changes.slice(0, 12).map((c) => ({ before: quote(bank, c.before, 8), removed: quote(bank, c.removed), added: quote(bank, c.added) }));
  const newSentences = (cmp?.newSentences ?? []).slice(0, 6).map((x) => quote(bank, x));
  const src = (s: Statement) => ({ name: `${BANK_NAME[bank]}, ${s.title}`, url: s.url, asOf: s.date });
  const watching = watchingSentences(cur.paragraphs, BANK_LICENCE[bank] !== "confirm" ? 5 : 3).map((t) => ({ text: quote(bank, t, 40), source: { name: BANK_NAME[bank], url: cur.url }, asOf: cur.date }));
  const economy = await loadEconomy(fetcher);
  const nextEvent = economy ? upcoming(economy.calendar.events.filter((e) => e.institution === BANK_NAME[bank]), now, 1)[0] : undefined;
  const next = nextEvent ? { date: nextEvent.date, time: decisionTime(nextEvent), url: nextEvent.sourceUrl } : null;
  const lines = [
    `${describe(bank, cur)}.${prev ? ` Before that, ${describe(bank, prev).replace(/^On /, "on ")}.` : ""}`,
  ];
  if (prev && cmp?.mode === "words") {
    lines.push("", `How the statement's wording changed from ${prev.date} (${changes.length} change${changes.length === 1 ? "" : "s"}${changes.length > shown.length ? `, first ${shown.length} shown` : ""}):`);
    for (const c of shown) lines.push(`- after "…${c.before}":${c.removed ? ` removed "${c.removed}"` : ""}${c.removed && c.added ? ";" : ""}${c.added ? ` added "${c.added}"` : ""}`);
  } else if (prev && cmp) {
    lines.push("", `Most of the statement was rewritten since ${prev.date}: about ${Math.round(cmp.changedShare * 100)}% of its words changed, and ${cmp.droppedCount} of the earlier statement's sentences no longer appear. Its new sentences, in order${cmp.newSentences.length > newSentences.length ? ` (first ${newSentences.length} of ${cmp.newSentences.length})` : ""}:`);
    for (const x of newSentences) lines.push(`- "${x}"`);
  }
  if (watching.length) lines.push("", "What the statement says the bank is weighing (its own words):", ...watching.map((w) => `- "${w.text}"`));
  if (next) lines.push("", `Next scheduled decision: ${next.date} (${utc(next.time)}). This says when, never what.`);
  lines.push("", `Sources: ${[cur, ...(prev ? [prev] : [])].map((s) => `${s.title}, ${s.date} (${s.url})`).join("; ")}.${BANK_LICENCE[bank] === "confirm" ? " Quotes are shortened; the full text is at the link." : BANK_LICENCE[bank] === "reuse_with_credit" ? ` Reproduced with the ${BANK_NAME[bank]} as the source.` : ""}`);
  return data(lines.join("\n"), {
    bank, institution: BANK_NAME[bank],
    decision: { ...cur.decision, date: cur.date, url: cur.url },
    previous: prev ? { ...prev.decision, date: prev.date, url: prev.url } : null,
    comparison: cmp ? { mode: cmp.mode, changedShare: cmp.changedShare, newSentenceCount: cmp.newSentences.length, droppedCount: cmp.droppedCount } : null,
    changes: shown, newSentences, watching, next,
    sources: [src(cur), ...(prev ? [src(prev)] : [])],
  });
}

export async function speechTracker(bankArg: unknown, daysArg: unknown, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const bank = docBank(bankArg);
  if (!bank) return text(CHOOSE_BANK, true);
  const days = Math.min(90, Math.max(1, Math.round(Number(daysArg ?? 30)) || 30));
  const body = await getJson(DOCS_DATA_URL, fetcher);
  const docs = body == null ? null : readDocsFile(body);
  if (!docs) return text(NO_DOCS, true);
  const since = new Date(now - days * 86_400_000).toISOString().slice(0, 10);
  const speeches = docs.speeches[bank].filter((s) => s.date >= since).map((s) => ({ ...s, source: { name: BANK_NAME[bank], url: s.url } }));
  if (!speeches.length) return data(`No ${BANK_NAME[bank]} speeches in the last ${days} days in its feed.`, { bank, institution: BANK_NAME[bank], speeches: [], refreshedAt: docs.generatedAt });
  const lines = speeches.map((s) => `- ${s.date}${s.speaker ? `, ${s.speaker}` : ""}: ${s.title}${s.about ? `. ${BANK_NAME[bank]}'s description: "${s.about}"` : ""} (${s.url})`);
  return data(`${BANK_NAME[bank]} speeches and remarks, last ${days} days, newest first:\n${lines.join("\n")}\n\nDescriptions are the bank's own; the full text is at each link. Read ${utc(docs.generatedAt)} from the ${BANK_NAME[bank]}'s feed.`, { bank, institution: BANK_NAME[bank], speeches, refreshedAt: docs.generatedAt });
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
  {
    name: "brief_on_asset",
    title: "Evidence brief on an asset",
    description: "All the sourced facts on one coin, company, currency or rate, with what they don't tell you.",
    arguments: [{ name: "asset", description: "Name or symbol, for example 'Bitcoin', 'AAPL', 'EUR/USD' or '10-year'.", required: true }],
    text: (a: Record<string, string>) => `Using ATLAS Explain, give me an evidence brief on ${a.asset || "this asset"} (evidence_brief). Keep every fact with its source and time, show both sides where it matters, and include what the brief doesn't tell me. Don't suggest any trade.`,
  },
  {
    name: "economy_today",
    title: "The economy today",
    description: "Inflation, jobs, policy rates and the next rate decisions, in plain language with sources.",
    arguments: [],
    text: () => "Using ATLAS Explain, tell me how the economy looks today (economy_snapshot) and when the next central-bank rate decisions are (economic_calendar). Explain each figure in plain language, name its source and period, and don't forecast anything.",
  },
  {
    name: "whats_notable",
    title: "What's notable today",
    description: "What stands out in today's market and economic data, each with its source and why it was picked.",
    arguments: [],
    text: () => "Using ATLAS Explain, tell me what's notable today (notable_today). For each item, explain in plain language what it means and the term behind it, keep its source and time, and say why it was picked. Describe only what has happened; don't forecast or suggest anything.",
  },
  {
    name: "check_an_offer",
    title: "Check an offer for scam warning signs",
    description: "Which of the warning signs regulators describe appear in a message or offer, and where to check and report.",
    arguments: [{ name: "offer", description: "The message, ad or offer, pasted or described.", required: true }],
    text: (a: Record<string, string>) => "Using ATLAS Explain, check this offer for investment scam warning signs (scam_red_flags), explain each sign it shows in plain language, and tell me where to check the seller's registration and how to report it. Don't say whether it is or isn't a scam: " + (a.offer || "(no text given)"),
  },
  {
    name: "money_lesson",
    title: "A money maths lesson",
    description: "Compound growth, fees, inflation or diversification, worked through with numbers you can change.",
    arguments: [{ name: "topic", description: "compounding, fees, inflation or diversification.", required: false }],
    text: (a: Record<string, string>) => `Using ATLAS Explain's money_maths, teach me ${a.topic ? `about ${a.topic}` : "how compounding works"} with a simple example I can change. Explain what the result shows and the one idea to remember, without suggesting what I should do with my money.`,
  },
  {
    name: "whats_coming_up",
    title: "What's coming up",
    description: "The next rate decisions and data releases, with countdowns and what each outcome would mean.",
    arguments: [],
    text: () => "Using ATLAS Explain, what market events are coming up (upcoming_events)? For the next two or three, give the time and countdown, the latest related figure, and what each possible outcome would mean in plain language. Don't predict which outcome will happen.",
  },
  {
    name: "quiz_me",
    title: "Quiz me on a topic",
    description: "Three short questions on a learning-path topic, one at a time, each checked and explained.",
    arguments: [{ name: "topic", description: "Optional topic, for example 'orders', 'risk' or 'rates'. Leave empty for the first topic.", required: false }],
    text: (a: Record<string, string>) => `Using ATLAS Explain, quiz me on ${a.topic ? `the "${a.topic}" topic` : "the first topic"} of the learning path (browse_glossary). Ask three short questions one at a time, wait for my answer, then say whether it's right and explain the term. Education only.`,
  },
  {
    name: "make_a_report",
    title: "Make a chart or report",
    description: "A chart, table or one-page report built from official data, with every source and licence, to keep or share.",
    arguments: [{ name: "topic", description: "What it's about, for example 'US inflation this year', 'G20 growth' or 'interest rates in the US, UK and euro area'.", required: true }],
    text: (a: Record<string, string>) => `Using ATLAS Explain, make a chart and a short report I can keep on ${a.topic || "the economy today"}. Get the numbers from data_series (and compare_countries or economy_snapshot where they help), draw a clear chart with units and periods labelled, add a small table, and explain in plain language what the figures show and the terms they use. Put each source and its licence under the chart. Describe the past only: no forecast and no suggestion to trade.`,
  },
] as const;

/** Suggestions while someone fills in a prompt (MCP completions): coins and catalog names, or learning topics. */
export function completePromptArgument(prompt: string, argument: string, typed: string): string[] {
  const q = typed.trim().toLowerCase();
  const pool =
    prompt === `${GLOSSARY_URI}{term}` && argument === "term"
      ? ALL_TERMS.map((t) => t.id)
      : (prompt === "explain_asset" || prompt === "brief_on_asset") && argument === "asset"
      ? [...CRYPTO_COINS.flatMap((c) => [c.name, c.symbol]), ...EDUCATION_ASSETS.map((a) => a.name)]
      : (prompt === "learn_next" || prompt === "quiz_me") && argument === "topic"
        ? LEARN_PATH.flatMap((s) => [s.id, s.title])
        : [];
  const unique = [...new Set(pool)];
  return q ? unique.filter((v) => v.toLowerCase().startsWith(q)).concat(unique.filter((v) => !v.toLowerCase().startsWith(q) && v.toLowerCase().includes(q))) : unique;
}

export type ToolResult = { content: { type: "text"; text: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };

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

const termRecord = (t: (typeof ALL_TERMS)[number]) => ({ id: t.id, title: t.title, summary: t.summary, group: t.group });

export function explainTerm(term: string): ToolResult {
  const query = term.trim();
  if (!query) return text("Give a term to look up, for example 'stop-limit order'.", true);
  const hits = searchTerms(query).slice(0, 3);
  if (!hits.length) {
    return data(`"${query}" is not in the ATLAS Explain glossary. The ATLAS Explain web app can explain any term, sentence or headline in plain language, with both sides: ${APP_URL}`, { query, found: false, terms: [], learnUrl: `${APP_URL}/learn` });
  }
  return data(hits.map((t) => `${t.title}\n${t.summary}`).join("\n\n") + `\n\nSource: ATLAS Explain glossary. More: ${APP_URL}/learn`, { query, found: true, terms: hits.map(termRecord), learnUrl: `${APP_URL}/learn` });
}

export function browseGlossary(topic: string | undefined): ToolResult {
  const q = topic?.trim().toLowerCase() ?? "";
  const step = q ? LEARN_PATH.find((s) => s.id === q || s.title.toLowerCase().includes(q)) : undefined;
  const group = q ? (Object.entries(TERM_GROUP_LABEL) as [keyof typeof TERM_GROUP_LABEL, string][]).find(([id, label]) => id === q || label.toLowerCase() === q) : undefined;
  const groups = (Object.entries(TERM_GROUP_LABEL) as [keyof typeof TERM_GROUP_LABEL, string][])
    .map(([id, label]) => ({ id, label, count: ALL_TERMS.filter((t) => t.group === id).length }))
    .filter((g) => g.count > 0);
  const stepRecord = (s: (typeof LEARN_PATH)[number]) => ({ id: s.id, title: s.title, terms: learnTerms(s).map(termRecord) });
  if (step) {
    return data(`${step.title}\n` + learnTerms(step).map((t) => `- ${t.title}: ${t.summary}`).join("\n") + `\n\nSource: ATLAS Explain learning path. ${APP_URL}/learn`, { topic: step.id, steps: [stepRecord(step)], groups, totalTerms: ALL_TERMS.length });
  }
  if (group) {
    const terms = ALL_TERMS.filter((t) => t.group === group[0]);
    return data(`${group[1]} terms\n` + terms.map((t) => `- ${t.title}: ${t.summary}`).join("\n") + `\n\nSource: ATLAS Explain glossary. ${APP_URL}/learn`, { topic: group[0], steps: [{ id: group[0], title: `${group[1]} terms`, terms: terms.map(termRecord) }], groups, totalTerms: ALL_TERMS.length });
  }
  const path = LEARN_PATH.map((s, i) => `${i + 1}. ${s.title}: ${learnTerms(s).map((t) => t.title).join(", ")}`).join("\n");
  const lead = q ? `No topic called "${topic}". ` : "";
  return data(`${lead}The ATLAS Explain learning path, in order:\n${path}\n\nGlossary groups: ${Object.values(TERM_GROUP_LABEL).join(", ")} (${ALL_TERMS.length} terms). Ask explain_term for any term. ${APP_URL}/learn`, { topic: null, steps: LEARN_PATH.map(stepRecord), groups, totalTerms: ALL_TERMS.length });
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
    // The EIA publishes spot prices once a week, so a date a week back is expected, not stale.
    const weekly = a.venue === "EIA" ? " (the EIA publishes these once a week)" : "";
    return [`${a.name} (${a.symbol}): ${value}${change ? `, ${change.text} ${a.quote.changeWindow}` : ""}, as of ${a.quote.asOf.slice(0, 10)}${weekly}. ${sourceLine(a.quote.source)}`];
  }
  const facts = a.facts.filter((f) => f.kind !== "filing").slice(0, 4);
  const link = officialPriceLink(a);
  // For a US or Canadian index, the OECD's monthly share-price index is an official measure of the same market.
  const market = a.class === "index" && (a.country === "US" || a.country === "CA") ? ` For an official monthly measure of the whole ${a.country === "US" ? "US" : "Canadian"} stock market, data_series has world_share_prices (OECD).` : "";
  const live = (link ? ` Live price: ${link.label} (${link.url}).` : "") + market;
  if (facts.length) {
    return [`${a.name} (${a.symbol}): ` + facts.map((f) => `${f.label} ${f.value}${f.period ? ` (${f.period})` : ""}`).join("; ") + `. ${sourceLine(facts[0]!.source)}, ${facts[0]!.source.label}.${live}`];
  }
  return [`${a.name} (${a.symbol}): no figure shown. ${noPriceNote(a)}${live}`.trim()];
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
    noPriceReason: a.quote ? null : noPriceNote(a),
    priceLink: a.quote ? null : officialPriceLink(a),
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
  // A search hit counts only when every word of the query is a whole word of the name or symbol, so
  // "gold" never answers with Goldman Sachs; near misses are offered instead.
  const words = q.toLowerCase().split(/[^a-z0-9&]+/).filter(Boolean);
  const whole = (x: Asset) => {
    const hay = ` ${x.name} ${x.symbol} ${x.symbol.replace("/", "")} `.toLowerCase().replace(/[^a-z0-9&]+/g, " ");
    return words.every((w) => hay.includes(` ${w} `));
  };
  const hits = searchAssets(all, q, { klass: "all" });
  const asset = findAsset(all, q) ?? hits.find(whole);
  if (!asset) {
    const near = hits.slice(0, 3).map((x) => `${x.name} (${x.symbol})`);
    return data(`"${q}" isn't in the ATLAS Explain catalog.${near.length ? ` Closest names: ${near.join(", ")}.` : ""} It covers the ten major coins, about 30 large US companies and ETFs, major currencies, Treasury and government bond yields, energy prices, and explainers for indices, futures and options.`, { found: false, closest: near });
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

const PUBLISHER_WORDS: Record<string, string> = {
  fed: "federalreserve.gov", "federal reserve": "federalreserve.gov", fomc: "federalreserve.gov",
  ecb: "ecb.europa.eu", "european central bank": "ecb.europa.eu",
  sec: "sec.gov", cftc: "cftc.gov",
  boc: "bankofcanada.ca", "bank of canada": "bankofcanada.ca",
  boe: "bankofengland.co.uk", "bank of england": "bankofengland.co.uk",
};

export async function todaysHeadlines(about: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const body = await getJson(NEWS_DATA_URL, fetcher);
  const file = body == null ? null : readNewsFile(body, now);
  if (!file) return text("Headlines couldn't be loaded right now. Try again in a few minutes.", true);
  const seen = new Set<string>();
  const q = about?.trim().toLowerCase() ?? "";
  // "Fed", "ECB" or "SEC" also find that institution's own releases, whose titles rarely name it.
  const publisher = PUBLISHER_WORDS[q];
  const items = Object.values(file.items)
    .flat()
    .filter((n: NewsItem) => (seen.has(n.url) ? false : (seen.add(n.url), true)))
    .filter((n) => !q || n.title.toLowerCase().includes(q) || (publisher != null && n.domain.endsWith(publisher)))
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
  rates: ["us_fed_funds", "us_sofr", "euro_deposit_rate", "ca_policy_rate", "uk_bank_rate"], fed: ["us_fed_funds", "us_sofr"], sofr: ["us_sofr"],
  "interest rates": ["us_fed_funds", "us_sofr", "euro_deposit_rate", "ca_policy_rate", "uk_bank_rate"], "policy rates": ["us_fed_funds", "euro_deposit_rate", "ca_policy_rate", "uk_bank_rate"],
  debt: ["us_debt"], deficit: ["us_debt"], euro: ["euro_hicp", "euro_deposit_rate"], ecb: ["euro_hicp", "euro_deposit_rate"], europe: ["euro_hicp", "euro_deposit_rate"], canada: ["ca_policy_rate"], boc: ["ca_policy_rate"],
  uk: ["uk_bank_rate"], britain: ["uk_bank_rate"], "united kingdom": ["uk_bank_rate"], boe: ["uk_bank_rate"], "bank of england": ["uk_bank_rate"],
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
  boe: "Bank of England", "bank of england": "Bank of England", uk: "Bank of England", britain: "Bank of England", mpc: "Bank of England",
};

export async function economicCalendar(bank: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const file = await loadEconomy(fetcher);
  if (!file) return text(NO_ECONOMY, true);
  const q = bank?.trim().toLowerCase() ?? "";
  const institution = q ? BANKS[q] : undefined;
  if (q && !institution) return text(`"${bank}" isn't one of the central banks ATLAS Explain follows: the Federal Reserve, the European Central Bank, the Bank of Canada and the Bank of England.`, true);
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

/** The book can be older than the quote; when it is, say so with the book's own best prices, so its averages make sense. */
function bookHeading(book: { bids: [number, number][]; asks: [number, number][] }, bookAsOf: string, quoteAsOf: string): string {
  const minutes = Math.round((Date.parse(quoteAsOf) - Date.parse(bookAsOf)) / 60_000);
  const best = book.bids[0] && book.asks[0] ? `best bid then ${formatPrice(book.bids[0][0])}, best ask then ${formatPrice(book.asks[0][0])}; ` : "";
  return minutes >= 1
    ? `In the order book captured ${utc(bookAsOf)}, ${minutes} minute${minutes === 1 ? "" : "s"} before the bid and ask above (${best}prices moved in between):`
    : `In the order book captured ${utc(bookAsOf)}:`;
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
  // The bands are measured around the book's own middle price: the ticker can be a few minutes newer than the
  // book, and centring an older book on a newer price can leave a whole side outside a band (seen live on ETH).
  const bookMid = book?.bids[0] && book.asks[0] ? (book.bids[0][0] + book.asks[0][0]) / 2 : null;
  const depth = book && bookMid
    ? DEPTH_BANDS.map((band) => {
        const lo = bookMid * (1 - band / 100);
        const hi = bookMid * (1 + band / 100);
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
    ...depthLines(depth, book, bookMid ?? mid),
    ...(book ? [bookHeading(book, file.books!.asOf, quoteAsOf)] : []),
    ...impact.filter((r) => r.sizeUsd === 10_000).map((r) => r.filled
      ? `- filling $10,000 against the ${r.side} would average ${formatPrice(r.avgPriceUsd!)}, ${r.slippagePct!.toFixed(4)}% from the best ${r.side === "asks" ? "ask" : "bid"} in that book (that gap is called slippage).`
      : `- $10,000 is more than the ${r.side} in the levels shown.`),
    book ? "" : "The order book itself isn't available right now; the bid and ask above are current.",
    "This is a snapshot of how the market looked, to explain spreads and slippage; it never suggests a trade.",
    credit,
  ].filter(Boolean);
  return data(lines.join("\n"), {
    name: coin.name, symbol: coin.symbol, bidUsd: bid, askUsd: ask, midUsd: Number(mid.toPrecision(10)), bookMidUsd: bookMid == null ? null : Number(bookMid.toPrecision(10)),
    spreadUsd: Number(spread.toPrecision(8)), spreadPct: Number(spreadPct.toFixed(5)), spreadBps: Number((spreadPct * 100).toFixed(2)), quoteAsOf,
    book: book ? { asOf: file.books!.asOf, bids: book.bids, asks: book.asks } : null,
    depth, impact, source: credit,
  });
}

/* ---------- evidence brief (docs/PLATFORM_PLAN.md, phase A) ---------- */

/** What a brief never tells anyone, by kind of asset. Always shown. */
const BRIEF_LIMITS = {
  common: [
    "It is not a forecast: past moves and today's figures don't say what happens next.",
    "It doesn't know your situation, goals, time frame or how much risk you can take.",
    "It never says whether to trade. Decisions are yours, ideally with a licensed adviser.",
  ],
  crypto: ["Crypto prices move around the clock and can swing sharply within hours; one exchange's price can differ from another's."],
  stock: ["No live stock price is shown (free prices aren't licensed for display); the figures are from the company's SEC filings, which are months old by design."],
  other: ["Official figures are published with a delay and can be revised."],
};

/** Questions people commonly weigh for this kind of asset: education, not a checklist for a decision. */
const BRIEF_WEIGH = {
  crypto: ["How much it has swung recently, up and down", "How deep the order book is (how much moves the price)", "Fees, and where it is held"],
  stock: ["What the company earns and owes, from its filings", "How it fits with the rest of what someone holds", "Fees and taxes"],
  other: ["What moves this figure (policy decisions, inflation, demand)", "How it relates to other rates or prices", "When the next official update comes"],
};

const BRIEF_TERMS: Record<string, string[]> = {
  crypto: ["spread", "market_order", "drawdown", "volume"],
  stock: ["filings", "market_hours", "volume", "drawdown"],
  rate: ["yield", "yield_curve", "basis_point"],
  forex: ["pip", "reference_rate", "spread"],
  other: ["index", "volume"],
};

type Rec = Record<string, unknown>;

export async function evidenceBrief(key: string, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const q = key.trim();
  if (!q) return text("Give an asset name or symbol, for example 'Bitcoin', 'AAPL', 'EUR/USD' or '10-year'.", true);
  const details = await assetDetails(q, fetcher, now);
  const d = (details.structuredContent ?? {}) as Rec;
  if (details.isError || d.found !== true) return text(`"${q}" isn't in the ATLAS Explain catalog, so there is no brief for it. ${text_of(details)}`.trim(), true);

  const klass = String(d.assetClass ?? "other");
  const kind: "crypto" | "stock" | "other" = klass === "crypto" ? "crypto" : klass === "stock" || klass === "etf" ? "stock" : "other";
  const coin = kind === "crypto" ? coinFor(String(d.symbol)) : undefined;
  const [history, depth, economy, headlines] = await Promise.all([
    coin ? priceHistory(coin.symbol, "7d", fetcher, now) : Promise.resolve(null),
    coin ? marketDepth(coin.symbol, fetcher) : Promise.resolve(null),
    loadEconomy(fetcher),
    todaysHeadlines(undefined, fetcher, now),
  ]);

  const lines: string[] = [`Evidence brief: ${d.name} (${d.symbol}). Facts with their sources; never a recommendation.`];
  const facts: Rec[] = [];

  // 1. The latest figure or price.
  if (typeof d.priceUsd === "number") facts.push({ label: "Price", value: formatPrice(d.priceUsd), asOf: d.asOf ?? null, source: d.source ?? null });
  else if (typeof d.value === "number") facts.push({ label: "Latest value", value: `${d.value}${d.currency === "%" ? "%" : ` ${d.currency ?? ""}`}`.trim(), asOf: d.asOf ?? null, source: d.source ?? null });
  for (const f of (Array.isArray(d.facts) ? d.facts : []) as Rec[]) facts.push({ label: f.label, value: f.value, asOf: f.period ?? d.asOf ?? null, source: d.source ?? null });
  lines.push("\nWhat it is:", String(d.about ?? ""), ...(d.tradingHours ? [`Trading hours: ${d.tradingHours}.`] : []));
  lines.push("\nLatest figures:", ...(facts.length ? facts.map((f) => `- ${f.label}: ${f.value}${f.asOf ? ` (${/^\d{4}-\d{2}-\d{2}T/.test(String(f.asOf)) ? String(f.asOf).slice(0, 10) : String(f.asOf)})` : ""}`) : [`- None shown. ${d.noPriceReason ?? ""}`.trim()]));
  // A crypto source line already ends with a full stop; an official source's does not.
  if (d.source) lines.push(`Source: ${d.source}${d.sourceUrl ? ` (${d.sourceUrl})` : ""}${String(d.source).endsWith(".") ? "" : "."}`);

  // 2. How it moved, and how easily it trades (coins).
  const h = history && !history.isError ? (history.structuredContent as Rec) : null;
  const recentMove = h ? { range: h.rangeLabel, startUsd: h.startUsd, endUsd: h.endUsd, changePct: h.changePct, high: h.high, low: h.low, source: h.source } : null;
  if (recentMove) lines.push(`\nOver ${h!.rangeLabel}: from ${formatPrice(Number(h!.startUsd))} to ${formatPrice(Number(h!.endUsd))} (${formatChange(Number(h!.changePct)).text}); high ${formatPrice(Number((h!.high as Rec).priceUsd))}, low ${formatPrice(Number((h!.low as Rec).priceUsd))}.`);
  const m = depth && !depth.isError ? (depth.structuredContent as Rec) : null;
  const liquidity = m ? { bidUsd: m.bidUsd, askUsd: m.askUsd, spreadBps: m.spreadBps, slippage10kPct: ((m.impact as Rec[]) ?? []).find((r) => r.sizeUsd === 10_000 && r.side === "asks")?.slippagePct ?? null, source: m.source } : null;
  if (liquidity) lines.push(`How easily it trades: spread ${Number(liquidity.spreadBps).toFixed(2)} basis points${liquidity.slippage10kPct != null ? `; filling $10,000 against the asks moved the average price ${Number(liquidity.slippage10kPct).toFixed(4)}%` : ""} (Kraken).`);

  // 3. The economic backdrop.
  const backdropIds = kind === "other" && /CA|CAD/.test(String(d.symbol)) ? ["ca_policy_rate", "us_fed_funds"] : ["us_fed_funds", "us_cpi"];
  const backdrop = (economy?.indicators ?? []).filter((i) => backdropIds.includes(i.id)).map((i) => ({ name: i.name, value: fmtIndicator(i), period: i.period, source: i.source }));
  // The central bank whose decision bears most directly on this asset; the soonest decision of any if it has none coming.
  const bank = /EUR/.test(String(d.symbol)) ? "European Central Bank" : /GBP/.test(String(d.symbol)) ? "Bank of England" : kind === "other" && /CA|CAD/.test(String(d.symbol)) ? "Bank of Canada" : "Federal Reserve";
  const next = economy ? (upcoming(economy.calendar.events.filter((e) => e.institution === bank), now, 1)[0] ?? upcoming(economy.calendar.events, now, 1)[0]) : undefined;
  if (backdrop.length || next) {
    lines.push("\nThe backdrop:", ...backdrop.map((b) => `- ${b.name}: ${b.value} for ${b.period} (${b.source})`));
    if (next) lines.push(`- Next rate decision: ${next.institution}, ${next.date}.`);
  }

  // 4. In the news (headlines that name it, then official releases).
  const all = ((headlines.structuredContent?.headlines ?? []) as Rec[]);
  const words = [String(d.name).toLowerCase(), String(d.symbol).toLowerCase()].filter((w) => w.length > 2);
  const about = all.filter((n) => words.some((w) => String(n.title).toLowerCase().includes(w))).slice(0, 3);
  const news = about.length ? about : all.slice(0, 2);
  if (news.length) lines.push(`\n${about.length ? "In the news" : "Latest official releases (none name it)"}:`, ...news.map((n) => `- ${n.title} (${n.publisher}, ${String(n.seenAt).slice(0, 10)}): ${n.url}`));

  // 5. Terms to know, and the limits.
  const termIds = BRIEF_TERMS[kind === "other" ? (klass === "rate" || klass === "forex" ? klass : "other") : kind] ?? [];
  const terms = termIds.map((id) => ALL_TERMS.find((t) => t.id === id)).filter((t): t is (typeof ALL_TERMS)[number] => !!t).map((t) => ({ title: t.title, summary: t.summary }));
  if (terms.length) lines.push("\nTerms to know:", ...terms.map((t) => `- ${t.title}: ${t.summary}`));
  const weigh = BRIEF_WEIGH[kind];
  lines.push("\nThings people commonly look at for this kind of asset:", ...weigh.map((w) => `- ${w}`));
  const limits = [...BRIEF_LIMITS.common, ...BRIEF_LIMITS[kind === "crypto" ? "crypto" : kind === "stock" ? "stock" : "other"]];
  lines.push("\nWhat this brief doesn't tell you:", ...limits.map((l) => `- ${l}`));

  return data(lines.join("\n"), {
    asset: { name: d.name, symbol: d.symbol, assetClass: klass, appUrl: d.appUrl ?? null },
    facts, recentMove, liquidity, backdrop,
    nextDecision: next ? { institution: next.institution, date: next.date, sourceUrl: next.sourceUrl } : null,
    news: news.map((n) => ({ title: n.title, publisher: n.publisher, url: n.url, seenAt: n.seenAt })),
    terms, weigh, limits,
  });
}

/* ---------- what's notable today (descriptive, never predictive) ---------- */

/** A coin's last 24 hours count as unusual at this many times its typical (median) daily move over the past month… */
export const UNUSUAL_MOVE_MULTIPLE = 2;
/** …and only if the move is at least this many percent, so a calm market's tiny moves never qualify. */
export const UNUSUAL_MOVE_MIN_PCT = 1;
/** A rate in percent counts as changed when it moved at least this many percentage points since the previous figure. */
export const ECONOMIC_CHANGE_MIN_PT = 0.2;
/** A yield curve this close to flat (10-year minus 3-month, in percentage points) is called flat. */
export const FLAT_CURVE_PT = 0.25;
const NOTABLE_DAYS_AHEAD = 7;
/** A central bank's move counts as notable for this many days after it takes effect. */
export const POLICY_MOVE_DAYS = 14;
const RELEASE_HOURS = 24;

type Observation = { kind: string; title: string; detail: string; asOf: string | null; source: string; sourceUrl: string | null; rule: string; terms: { id: string; title: string }[] };
const termRefs = (...ids: string[]) => ids.map((id) => ALL_TERMS.find((t) => t.id === id)).filter((t): t is (typeof ALL_TERMS)[number] => !!t).map((t) => ({ id: t.id, title: t.title }));
const signedPt = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(2)}`;

/** The close at or just before `t` (seconds), from hourly closes oldest first. */
function closeAt(series: readonly (readonly [number, number])[], t: number): number | null {
  let found: number | null = null;
  for (const [ts, c] of series) {
    if (ts > t) break;
    found = c;
  }
  return found;
}

/** The last 24 hours' move, and the median absolute daily move over the days before it (needs about two weeks). */
export function dailyMoveStats(series: readonly (readonly [number, number])[]): { lastPct: number; typicalPct: number; days: number } | null {
  if (series.length < 2) return null;
  const end = series[series.length - 1]![0];
  const moves: number[] = [];
  for (let k = 0; ; k++) {
    const to = closeAt(series, end - k * 86_400);
    const from = closeAt(series, end - (k + 1) * 86_400);
    if (to == null || from == null || from === 0) break;
    moves.push(((to - from) / from) * 100);
  }
  if (moves.length < 15) return null;
  const past = moves.slice(1).map(Math.abs).sort((a, b) => a - b);
  const mid = past.length >> 1;
  const typical = past.length % 2 ? past[mid]! : (past[mid - 1]! + past[mid]!) / 2;
  return { lastPct: moves[0]!, typicalPct: typical, days: past.length };
}

export async function notableToday(fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const [crypto, official, economy, newsBody] = await Promise.all([loadCrypto(fetcher), loadOfficial(fetcher, now), loadEconomy(fetcher), getJson(NEWS_DATA_URL, fetcher)]);
  const news = newsBody == null ? null : readNewsFile(newsBody, now);
  const observations: Observation[] = [];
  const quiet: string[] = [];
  const unavailable: string[] = [];

  // 1. Crypto: a 24-hour move well outside the coin's own typical daily move.
  if (crypto) {
    const credit = cryptoCredit(crypto.history.source, crypto.history.asOf, now);
    const moves = crypto.prices.coins
      .map((c) => ({ c, st: dailyMoveStats(crypto.history.series[c.symbol] ?? []) }))
      .filter((m): m is { c: (typeof m)["c"]; st: NonNullable<(typeof m)["st"]> } => m.st !== null);
    const unusual = moves
      .filter(({ st }) => Math.abs(st.lastPct) >= UNUSUAL_MOVE_MIN_PCT && Math.abs(st.lastPct) >= UNUSUAL_MOVE_MULTIPLE * st.typicalPct)
      .sort((a, b) => Math.abs(b.st.lastPct) / b.st.typicalPct - Math.abs(a.st.lastPct) / a.st.typicalPct);
    for (const { c, st } of unusual.slice(0, 4)) {
      observations.push({
        kind: "crypto_move",
        title: `${c.name} moved ${formatChange(st.lastPct).text} in 24 hours, about ${(Math.abs(st.lastPct) / st.typicalPct).toFixed(1)}× its typical daily move`,
        detail: `Its median daily move over the previous ${st.days} days was ${st.typicalPct.toFixed(2)}%. Price now ${formatPrice(c.priceUsd)}.`,
        asOf: crypto.history.asOf,
        source: credit,
        sourceUrl: null,
        rule: `Picked because the 24-hour move is at least ${UNUSUAL_MOVE_MULTIPLE}× the coin's own median daily move over the past month, and at least ${UNUSUAL_MOVE_MIN_PCT}%.`,
        // A fall teaches drawdown; a rise doesn't.
        terms: st.lastPct < 0 ? termRefs("drawdown", "volume", "implied_volatility") : termRefs("volume", "implied_volatility"),
      });
    }
    if (moves.length && !unusual.length) quiet.push(`None of the ${moves.length} coins moved more than ${UNUSUAL_MOVE_MULTIPLE}× its typical daily move in the last 24 hours.`);
  } else unavailable.push("Crypto prices couldn't be loaded, so crypto moves weren't checked.");

  // 2. The US Treasury yield curve: inverted or flat.
  if (official) {
    const y = (sym: string) => official.find((a) => a.symbol === sym && a.quote && typeof a.quote.value === "number");
    const long = y("US10Y");
    const short = y("US3M");
    if (long?.quote && short?.quote) {
      const gap = long.quote.value - short.quote.value;
      const shape = gap < 0 ? "inverted" : gap < FLAT_CURVE_PT ? "flat" : null;
      if (shape) {
        observations.push({
          kind: "yield_curve",
          title: shape === "inverted" ? `The US Treasury yield curve is inverted: the 10-year yields ${Math.abs(gap * 100).toFixed(0)} basis points less than the 3-month` : `The US Treasury yield curve is nearly flat: the 10-year yields only ${(gap * 100).toFixed(0)} basis points more than the 3-month`,
          detail: `10-year ${long.quote.value.toFixed(2)}%, 3-month ${short.quote.value.toFixed(2)}% (${long.quote.asOf.slice(0, 10)}). Normally longer loans pay more than shorter ones.`,
          asOf: long.quote.asOf,
          source: long.quote.source.attribution.text,
          sourceUrl: long.quote.source.attribution.href,
          rule: `Picked because the 10-year minus 3-month gap is below zero (inverted) or below ${FLAT_CURVE_PT} percentage points (flat).`,
          terms: termRefs("yield_curve", "yield", "basis_point"),
        });
      } else quiet.push(`The US Treasury yield curve slopes upward as usual: 10-year ${long.quote.value.toFixed(2)}%, 3-month ${short.quote.value.toFixed(2)}%.`);
    } else unavailable.push("US Treasury yields weren't available, so the yield curve wasn't checked.");
  } else unavailable.push("Official figures couldn't be loaded, so the yield curve wasn't checked.");

  // 3. Rate decisions in the next week, and 4. economic figures that changed.
  if (economy) {
    const soon = upcoming(economy.calendar.events, now, 6).filter((e) => Number(eventRecord(e, now).daysAway) <= NOTABLE_DAYS_AHEAD);
    for (const e of soon) {
      const days = Number(eventRecord(e, now).daysAway);
      observations.push({
        kind: "rate_decision",
        title: `${e.institution} rate decision ${days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`} (${e.date})`,
        detail: `${e.about}${e.withProjections ? " With the Summary of Economic Projections." : ""}`,
        asOf: economy.calendar.capturedAt,
        source: `${e.institution}'s published calendar`,
        sourceUrl: e.sourceUrl,
        rule: `Picked because the decision is within ${NOTABLE_DAYS_AHEAD} days. The date only: ATLAS Explain never guesses the outcome.`,
        terms: termRefs("rates_fed", "reference_rate", "basis_point"),
      });
    }
    if (!soon.length) quiet.push(`No Fed, ECB, Bank of Canada or Bank of England rate decision in the next ${NOTABLE_DAYS_AHEAD} days.`);
    // A policy rate's "change since the last move" stays the same for months; it only counts while the
    // move itself is recent (the day it took effect is the last step in its series).
    const movedOn = (i: Indicator): string | null => {
      const s = i.series;
      for (let k = s.length - 1; k > 0; k--) if (s[k]!.v !== s[k - 1]!.v) return s[k]!.t;
      return null;
    };
    const recentEnough = (i: Indicator) => {
      if (i.changeWindow !== "since the last change") return true;
      const day = movedOn(i);
      return day != null && now - Date.parse(`${day.slice(0, 10)}T12:00:00Z`) <= POLICY_MOVE_DAYS * 86_400_000;
    };
    const changed = economy.indicators.filter((i) => i.unit === "%" && i.change != null && Math.abs(i.change) >= ECONOMIC_CHANGE_MIN_PT && recentEnough(i));
    for (const i of changed) {
      observations.push({
        kind: "economic_change",
        title: `${i.name} ${i.change! > 0 ? "rose" : "fell"} ${Math.abs(i.change!).toFixed(2)} percentage points to ${i.value.toFixed(2)}%`,
        detail: `For ${i.period}, ${i.changeWindow} (${signedPt(i.change!)} pt).${i.note ? ` ${i.note}` : ""}`,
        asOf: economy.generatedAt,
        source: i.source,
        sourceUrl: i.sourceUrl,
        rule: i.changeWindow === "since the last change" ? `Picked because the rate moved by at least ${ECONOMIC_CHANGE_MIN_PT} percentage points within the last ${POLICY_MOVE_DAYS} days.` : `Picked because it changed by at least ${ECONOMIC_CHANGE_MIN_PT} percentage points since the previous figure.`,
        terms: termRefs("basis_point", "rates"),
      });
    }
    if (economy.indicators.length && !changed.length) quiet.push(`No inflation, jobs or rate figure changed by ${ECONOMIC_CHANGE_MIN_PT} percentage points or more in its latest release.`);
  } else unavailable.push("Economic data couldn't be loaded, so rate decisions and economic figures weren't checked.");

  // 5. Official releases from the last day.
  if (news) {
    const recent = (news.items["market:official"] ?? []).filter((n) => now - Date.parse(n.seenAt) <= RELEASE_HOURS * 3_600_000).sort((a, b) => b.seenAt.localeCompare(a.seenAt));
    for (const n of recent.slice(0, 3)) {
      observations.push({ kind: "official_release", title: n.title, detail: `Published by ${n.domain}.`, asOf: n.seenAt, source: n.domain, sourceUrl: n.url, rule: `Picked because it is an official press release from the last ${RELEASE_HOURS} hours.`, terms: [] });
    }
    if (!recent.length) quiet.push(`No official press release in the last ${RELEASE_HOURS} hours.`);
  } else unavailable.push("Headlines couldn't be loaded, so official releases weren't checked.");

  const limits = [
    "Each item was picked by the fixed rule shown with it, from data that has already happened. None of it says what happens next.",
    "Unusual is measured against each coin's own past month only; a longer history could tell a different story.",
    "These are observations to learn from, never a suggestion to act.",
  ];
  const lines = [
    `What stands out in ATLAS Explain's data, ${utc(new Date(now).toISOString())}:`,
    ...(observations.length ? observations.map((o) => `\n- ${o.title}.\n  ${o.detail}\n  Why it's here: ${o.rule}\n  Source: ${o.source}${o.sourceUrl ? ` (${o.sourceUrl})` : ""}${o.terms.length ? `\n  Terms: ${o.terms.map((t) => t.title).join(", ")}` : ""}`) : ["\nNothing passed the rules today."]),
    ...(quiet.length ? ["\nChecked, nothing unusual:", ...quiet.map((q) => `- ${q}`)] : []),
    ...(unavailable.length ? ["\nNot checked:", ...unavailable.map((u) => `- ${u}`)] : []),
    "\nLimits:", ...limits.map((l) => `- ${l}`),
  ];
  return data(lines.join("\n"), { asOf: new Date(now).toISOString(), observations, quiet, unavailable, limits });
}

/* ---------- coming up: decisions and data releases, with countdowns and "if this happens" ---------- */

export async function upcomingEvents(only: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const file = await loadEconomy(fetcher);
  if (!file) return text(NO_ECONOMY, true);
  const events = comingUp(file, now, 12).filter((e) => !only || (only === "rates" ? e.kind === "rate_decision" : e.kind !== "rate_decision")).slice(0, 8);
  if (!events.length) return data(`No scheduled ${only === "data" ? "data release" : only === "rates" ? "rate decision" : "event"} is in the calendars ATLAS Explain read. Nothing is shown in its place.`, { refreshedAt: file.generatedAt, events: [] });
  const lines = events.map((e) => {
    const when = `${utc(e.time)} (${countdown(e.time, now)})`;
    const outs = e.scenarios.outcomes.map((o) => `    - If ${o.outcome.charAt(0).toLowerCase()}${o.outcome.slice(1)}: ${o.meaning}`).join("\n");
    return `- ${e.title}, ${when}.${e.context ? ` ${e.context}` : ""}\n  People watch: ${e.scenarios.watch.join("; ")}.\n  If this happens:\n${outs}\n  ${e.scenarios.caution} Source: ${e.sourceUrl}`;
  });
  return data(`Coming up, soonest first:\n${lines.join("\n\n")}\n\nTimes from each central bank's and the BLS's own calendars. These explain each possible outcome; they never say which will happen.`, {
    refreshedAt: file.generatedAt,
    events: events.map((e) => ({ kind: e.kind, who: e.who, title: e.title, time: e.time, countdown: countdown(e.time, now), about: e.about, context: e.context, sourceUrl: e.sourceUrl, scenarios: e.scenarios })),
  });
}

/* ---------- investment scam warning signs ---------- */

/** Official releases that are about fraud (SEC, CFTC and others), from the headlines ATLAS Explain already reads. */
const FRAUD_WORDS = /fraud|scam|ponzi|scheme|misappropriat|deceiv|pump-and-dump|unregistered|impersonat/i;

export async function scamRedFlags(pitch: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const text_ = (pitch ?? "").slice(0, 4000);
  const matched = text_.trim() ? matchRedFlags(text_) : [];
  const body = await getJson(NEWS_DATA_URL, fetcher);
  const news = body == null ? null : readNewsFile(body, now);
  const actions = (news?.items["market:official"] ?? []).filter((n) => FRAUD_WORDS.test(n.title)).slice(0, 4);
  const lines: string[] = [];
  if (text_.trim()) {
    lines.push(matched.length
      ? `This shows ${matched.length} of the warning signs regulators describe:`
      : "None of the common warning signs ATLAS Explain looks for appear in this text. That doesn't make it safe: check who is behind it before anything else.");
    for (const f of matched) lines.push(`- ${f.title}. ${f.why} (${f.source.name}: ${f.source.url})`);
  } else {
    lines.push("Warning signs of investment fraud, as regulators describe them:");
    for (const f of RED_FLAGS) lines.push(`- ${f.title}. ${f.why}`);
  }
  lines.push("\nCheck the seller or adviser is registered, using the regulator's own site:", ...CHECKS.map((x) => `- ${x.name}: ${x.url}`));
  lines.push("\nReport it:", ...REPORT.map((x) => `- ${x.name}: ${x.url}`));
  if (actions.length) lines.push("\nRecent official fraud actions:", ...actions.map((n) => `- ${n.title} (${n.domain}, ${utc(n.seenAt)}): ${n.url}`));
  lines.push("\nThis points out warning signs only; it can't say whether something is a scam. ATLAS Explain doesn't keep the text it was given.");
  return data(lines.join("\n"), {
    matched: matched.map(({ id, title, why, source }) => ({ id, title, why, source })),
    allSigns: RED_FLAGS.map((f) => f.title),
    check: CHECKS,
    report: REPORT,
    recentActions: actions.map((n) => ({ title: n.title, publisher: n.domain, url: n.url, seenAt: n.seenAt })),
  });
}

/* ---------- money maths (pure arithmetic on the person's numbers) ---------- */

export function moneyMathsTool(args: Record<string, unknown>): ToolResult {
  const n = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : undefined);
  const r = moneyMaths({
    calculation: String(args.calculation) as MoneyCalc,
    amount: n(args.amount), monthly: n(args.monthly), ratePct: n(args.rate_pct), feePct: n(args.fee_pct), inflationPct: n(args.inflation_pct),
    years: n(args.years), volatilityPct: n(args.volatility_pct), correlation: n(args.correlation), holdings: n(args.holdings),
  });
  if ("error" in r) return text(r.error, true);
  return data(`${r.lines.join("\n")}\n\nArithmetic on the numbers given; never a forecast.`, r as unknown as Record<string, unknown>);
}

/* ---------- US Treasury auctions (TreasuryDirect, from ATLAS Explain's own data site) ---------- */

const KINDS: Record<string, readonly string[]> = { bill: ["Bill", "CMB"], bills: ["Bill", "CMB"], note: ["Note"], notes: ["Note"], bond: ["Bond"], bonds: ["Bond"], tips: ["TIPS"], frn: ["FRN"], frns: ["FRN"] };
const billions = (usd: number) => "$" + `${(usd / 1e9).toFixed(usd % 1e9 ? 1 : 0)} billion`;
const auctionName = (a: Auction) => `${a.term} ${a.type === "Bill" ? "bill" : a.type === "Note" ? "note" : a.type === "Bond" ? "bond" : a.type}`;

export async function treasuryAuctions(kind: string | undefined, fetcher: Fetcher, now = Date.now()): Promise<ToolResult> {
  const file = await loadEconomy(fetcher);
  if (!file) return text(NO_ECONOMY, true);
  const au = file.auctions;
  if (!au) return text("Treasury auctions haven't been captured yet. Nothing is shown in their place; try again in a few hours.", true);
  const k = kind?.trim().toLowerCase() ?? "";
  const types = k ? KINDS[k] : undefined;
  if (k && !types) return text(`"${kind}" isn't a kind of Treasury security ATLAS Explain lists. Try bills, notes, bonds or TIPS, or leave it empty.`, true);
  const keep = (a: Auction) => !types || types.includes(a.type);
  const today = new Date(now).toISOString().slice(0, 10);
  const upcomingList = au.upcoming.filter((a) => keep(a) && a.auctionDate >= today);
  const recent = au.recent.filter(keep).slice(0, 8);
  const lines = [
    upcomingList.length ? "Announced, not yet auctioned:" : "No announced auction is waiting to be held in the lists ATLAS Explain read.",
    ...upcomingList.map((a) => `- ${a.auctionDate}: ${auctionName(a)}, ${billions(a.offeringUsd)}, issued ${a.issueDate}${a.couponPct != null ? ` (coupon ${a.couponPct.toFixed(3)}%)` : ""}`),
    recent.length ? "\nLatest results:" : "",
    ...recent.map((a) => `- ${a.auctionDate}: ${auctionName(a)}, ${billions(a.offeringUsd)}${a.yieldPct != null ? `, ${a.type === "Bill" || a.type === "CMB" ? "investment rate" : "high yield"} ${a.yieldPct.toFixed(3)}%` : ""}${a.bidToCover != null ? `, bid-to-cover ${a.bidToCover.toFixed(2)}` : ""}${a.indirectPct != null ? `, ${a.indirectPct.toFixed(0)}% to indirect bidders` : ""}`),
    "\nBid-to-cover is how many dollars were bid for each dollar sold; a higher figure means more demand at that auction. The yield is the rate the auction set for that security.",
    `Source: TreasuryDirect (U.S. Department of the Treasury), read ${utc(au.capturedAt)} by ATLAS Explain's data job. Describes auctions that are announced or done; it never predicts a result.`,
  ].filter(Boolean);
  return data(lines.join("\n"), { refreshedAt: au.capturedAt, upcoming: upcomingList, recent, source: "TreasuryDirect, U.S. Department of the Treasury" });
}

/* ---------- countries compared (World Bank, from ATLAS Explain's own data site) ---------- */

const WORLD_WORDS: Record<string, WorldIndicatorId> = {
  gdp: "gdp_growth", growth: "gdp_growth", "gdp growth": "gdp_growth", "economic growth": "gdp_growth",
  inflation: "inflation", prices: "inflation", cpi: "inflation",
  unemployment: "unemployment", jobs: "unemployment", jobless: "unemployment",
  "gdp per person": "gdp_per_capita", "gdp per capita": "gdp_per_capita", "per capita": "gdp_per_capita", income: "gdp_per_capita", "per person": "gdp_per_capita",
};
const COUNTRY_WORDS: Record<string, string> = { us: "USA", usa: "USA", america: "USA", uk: "GBR", britain: "GBR", eu: "EUU", europe: "EUU", "euro area": "EUU", korea: "KOR", turkey: "TUR", saudi: "SAU" };
const NO_WORLD = "ATLAS Explain's country figures couldn't be loaded right now. Nothing is shown in their place; try again later.";

function countryCode(word: string): string | null {
  const w = word.trim().toLowerCase();
  if (!w) return null;
  return COUNTRY_WORDS[w] ?? WORLD_COUNTRIES.find((c) => c.code.toLowerCase() === w || c.name.toLowerCase() === w)?.code ?? WORLD_COUNTRIES.find((c) => c.name.toLowerCase().startsWith(w))?.code ?? null;
}
const worldValue = (unit: string, v: number) => (unit === "USD" ? "$" + Math.round(v).toLocaleString("en-US") : `${v.toFixed(1)}%`);

export async function compareCountries(indicator: string | undefined, countries: string | undefined, fetcher: Fetcher): Promise<ToolResult> {
  const body = await getJson(WORLD_DATA_URL, fetcher);
  const file: WorldFile | null = body == null ? null : readWorldFile(body);
  if (!file) return text(NO_WORLD, true);
  const iq = indicator?.trim().toLowerCase() ?? "";
  const one = iq ? WORLD_WORDS[iq] ?? WORLD_INDICATORS.find((i) => i.id === iq || i.name.toLowerCase() === iq)?.id : undefined;
  if (iq && !one) return text(`No indicator called "${indicator}". Try GDP growth, inflation, unemployment or GDP per person, or leave it empty for all four.`, true);
  const asked = (countries ?? "").split(",").map((w) => w.trim()).filter(Boolean);
  const codes = asked.map(countryCode);
  const unknown = asked.filter((_, i) => !codes[i]);
  if (unknown.length) return text(`Not in the G20 list ATLAS Explain covers: ${unknown.join(", ")}. It covers ${WORLD_COUNTRIES.map((c) => c.name).join(", ")}.`, true);
  const pick = asked.length ? WORLD_COUNTRIES.filter((c) => codes.includes(c.code)) : WORLD_COUNTRIES;
  const inds = WORLD_INDICATORS.filter((i) => !one || i.id === one).filter((i) => file.indicators.some((d) => d.id === i.id));
  const latestOf = (id: WorldIndicatorId, code: string) => {
    const sr = file.indicators.find((d) => d.id === id)?.rows.find((r) => r.country === code)?.series;
    return sr?.length ? sr[sr.length - 1]! : null;
  };
  const rows = pick.map((c) => ({ code: c.code, name: c.name, values: Object.fromEntries(inds.map((i) => [i.id, latestOf(i.id, c.code)])) }));
  let lines: string[];
  if (inds.length === 1) {
    const i = inds[0]!;
    const sorted = [...rows].sort((a, b) => (b.values[i.id]?.value ?? -Infinity) - (a.values[i.id]?.value ?? -Infinity));
    lines = [`${i.name} (${i.about.replace(/\.$/, "")}), highest first:`, ...sorted.map((r) => { const v = r.values[i.id]; return `- ${r.name}: ${v ? `${worldValue(i.unit, v.value)} (${v.year})` : "no figure published"}`; })];
  } else {
    lines = rows.map((r) => `${r.name}: ${inds.map((i) => { const v = r.values[i.id]; return `${i.name.toLowerCase()} ${v ? `${worldValue(i.unit, v.value)} (${v.year})` : "not published"}`; }).join("; ")}`);
  }
  const source = `${file.source.name} (${file.source.url}), ${file.source.licence}. Read ${utc(file.generatedAt)} by ATLAS Explain's data job.`;
  return data(`${lines.join("\n")}\n\nYears differ by country: each figure shows the latest year the World Bank has published. Actual values only, never a projection.\nSource: ${source}`, {
    refreshedAt: file.generatedAt,
    source,
    indicators: inds.map(({ id, name, unit, about }) => ({ id, name, unit, about })),
    countries: rows,
  });
}

/* ---------- data series: clean rows for charts, spreadsheets and reports (government and World Bank data only) ---------- */

/** What each source allows; crypto and stock prices are never offered as data (their sources don't allow it). */
const SERIES_LICENCE: Record<string, string> = {
  "U.S. Bureau of Labor Statistics": "Public domain (US government work). Credit the source.",
  "Federal Reserve Bank of New York": "Free to reuse with credit to the Federal Reserve Bank of New York.",
  "U.S. Department of the Treasury, Fiscal Data": "Public domain (US government work). Credit the source.",
  "European Central Bank": "Free to reuse with credit to the European Central Bank.",
  "Bank of Canada": "Free to reuse with credit to the Bank of Canada.",
  "Bank of England": "Free to reuse with credit to the Bank of England (its terms apply).",
};
const ECON_SERIES_WORDS: Record<string, IndicatorId> = {
  cpi: "us_cpi", "us cpi": "us_cpi", "us inflation": "us_cpi", inflation: "us_cpi",
  "us unemployment": "us_unemployment", unemployment: "us_unemployment", jobs: "us_unemployment",
  "fed funds": "us_fed_funds", "federal funds": "us_fed_funds", fed: "us_fed_funds", sofr: "us_sofr",
  "euro inflation": "euro_hicp", hicp: "euro_hicp", "euro area inflation": "euro_hicp",
  ecb: "euro_deposit_rate", "ecb rate": "euro_deposit_rate", "euro deposit rate": "euro_deposit_rate",
  boc: "ca_policy_rate", "canada rate": "ca_policy_rate", "bank of canada": "ca_policy_rate",
  boe: "uk_bank_rate", "bank rate": "uk_bank_rate", "uk rate": "uk_bank_rate", "bank of england": "uk_bank_rate",
  debt: "us_debt", "us debt": "us_debt", "national debt": "us_debt",
};
const NOT_DATA = /\b(bitcoin|btc|ether(eum)?|eth|solana|sol|crypto|coins?|stocks?|share prices?|aapl|nvda|msft|s&p|nasdaq)\b/i;

type SeriesOut = { id: string; name: string; unit: string; frequency: string; country: string | null; source: string; sourceUrl: string; licence: string; points: { date: string; value: number }[] };

const frequencyOf = (dates: string[]) => (dates.every((d) => /^\d{4}$/.test(d)) ? "yearly" : dates.every((d) => /^\d{4}-\d{2}$/.test(d)) ? "monthly" : "daily");
const csvCell = (v: string | number | null) => (v == null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export async function dataSeries(series: string | undefined, countries: string | undefined, fetcher: Fetcher): Promise<ToolResult> {
  const [economy, worldBody] = await Promise.all([loadEconomy(fetcher), getJson(WORLD_DATA_URL, fetcher)]);
  const world: WorldFile | null = worldBody == null ? null : readWorldFile(worldBody);
  const econ = (economy?.indicators ?? []).filter((i) => i.series.length > 1);
  const worldMetas = WORLD_INDICATORS.filter((w) => world?.indicators.some((d) => d.id === w.id));
  const catalog = [
    ...econ.map((i) => ({ id: i.id as string, name: i.name, unit: i.unit as string, points: i.series.length, source: i.source, needsCountry: false })),
    ...worldMetas.map((w) => ({ id: `world_${w.id}`, name: `${w.name} by country`, unit: w.unit as string, points: world!.indicators.find((d) => d.id === w.id)!.rows[0]?.series.length ?? 0, source: world!.source.name, needsCountry: true })),
    ...(world?.sharePrices ? [{ id: "world_share_prices", name: "Share prices by country (OECD, all shares, 2015 = 100)", unit: "index", points: world.sharePrices.rows[0]?.series.length ?? 0, source: OECD_SHARES_SOURCE.name, needsCountry: true }] : []),
  ];
  if (!catalog.length) return text("ATLAS Explain's data series couldn't be loaded right now. Nothing is shown in their place; try again later.", true);
  const asked = (series ?? "").split(",").map((w) => w.trim()).filter(Boolean);
  if (!asked.length) {
    const lines = catalog.map((c) => `- ${c.id}: ${c.name} (${c.unit}), ${c.points} points, ${c.source}${c.needsCountry ? "; give countries" : ""}`);
    return data(
      `Data series ATLAS Explain can give as rows, for charts, spreadsheets or reports:\n${lines.join("\n")}\n\nAsk for one to four by id or name, for example "us_cpi, uk_bank_rate", or "world_inflation" with countries "Japan, Germany". Crypto and stock prices aren't offered as data: their sources don't allow it.`,
      { series: [], available: catalog.map((c) => ({ id: c.id, name: c.name, unit: c.unit, points: c.points, source: c.source })), csv: "" },
    );
  }
  if (asked.length > 4) return text("Ask for at most four series at a time.", true);
  // The OECD's share-price index is an official, freely reusable measure of a whole market, not a stock's price.
  const SHARE_WORDS = /^(world_share_prices|share prices?|stock market|stock markets|equity prices|share price index)$/i;
  const blocked = asked.find((w) => !SHARE_WORDS.test(w.trim()) && NOT_DATA.test(w));
  if (blocked) return text(`"${blocked}" isn't offered as data: crypto and stock prices come from sources that don't allow redistribution. price_history and crypto_prices show coin prices inside the chat instead.`, true);
  const wantCountries = (countries ?? "").split(",").map((w) => w.trim()).filter(Boolean);
  const codes = wantCountries.map(countryCode);
  const unknownCountry = wantCountries.filter((_, i) => !codes[i]);
  if (unknownCountry.length) return text(`Not in the G20 list ATLAS Explain covers: ${unknownCountry.join(", ")}.`, true);
  if (codes.length > 6) return text("Give at most six countries.", true);

  const out: SeriesOut[] = [];
  const unknown: string[] = [];
  for (const word of asked) {
    const w = word.toLowerCase().replace(/\s+/g, " ");
    if (SHARE_WORDS.test(w)) {
      if (!world?.sharePrices) { unknown.push(word); continue; }
      for (const code of codes.length ? (codes as string[]) : ["USA"]) {
        const row = world.sharePrices.rows.find((r) => r.country === code);
        if (!row) continue;
        out.push({
          id: "world_share_prices", name: `Share prices, ${WORLD_COUNTRIES.find((c) => c.code === code)?.name ?? code} (all shares, 2015 = 100)`, unit: "index", frequency: "monthly", country: code,
          source: OECD_SHARES_SOURCE.name, sourceUrl: OECD_SHARES_SOURCE.url, licence: `${OECD_SHARES_SOURCE.licence}. Cite: OECD (2026), Financial market, OECD Data Explorer.`,
          points: row.series.map((p) => ({ date: p.t, value: p.v })),
        });
      }
      continue;
    }
    // A world_ id, or a plain word like "inflation" when countries are given, means the World Bank series.
    const worldId = w.startsWith("world_") ? w.slice(6) : codes.length ? (WORLD_WORDS[w] ?? WORLD_INDICATORS.find((i) => i.name.toLowerCase() === w)?.id) : undefined;
    const meta = worldMetas.find((i) => i.id === worldId);
    if (meta && world) {
      const rows = world.indicators.find((d) => d.id === meta.id)?.rows ?? [];
      for (const code of codes.length ? (codes as string[]) : ["USA"]) {
        const row = rows.find((r) => r.country === code);
        if (!row?.series.length) continue;
        out.push({
          id: `world_${meta.id}`, name: `${meta.name}, ${WORLD_COUNTRIES.find((c) => c.code === code)?.name ?? code}`, unit: meta.unit, frequency: "yearly", country: code,
          source: world.source.name, sourceUrl: world.source.url, licence: `${world.source.licence}. Credit the World Bank.`,
          points: row.series.map((p) => ({ date: p.year, value: p.value })),
        });
      }
      continue;
    }
    const ind = econ.find((i) => i.id === w) ?? econ.find((i) => i.id === ECON_SERIES_WORDS[w]);
    if (!ind) {
      unknown.push(word);
      continue;
    }
    const points = ind.series.map((p) => ({ date: p.t, value: p.v }));
    out.push({ id: ind.id, name: ind.name, unit: ind.unit, frequency: frequencyOf(points.map((p) => p.date)), country: null, source: ind.source, sourceUrl: ind.sourceUrl, licence: SERIES_LICENCE[ind.source] ?? `Credit ${ind.source}.`, points });
  }
  if (unknown.length) return text(`No data series called ${unknown.map((u) => `"${u}"`).join(", ")}. Leave the series empty to list them all.`, true);
  if (!out.length) return text("No figures were published for those countries.", true);
  const csv = ["series,name,country,date,value,unit", ...out.flatMap((s) => s.points.map((p) => [s.id, s.name, s.country, p.date, p.value, s.unit].map(csvCell).join(",")))].join("\n");
  const heads = out.map((s) => `- ${s.name} (${s.unit === "USD" ? "US dollars" : s.unit === "index" ? "index, 2015 = 100" : "%"}, ${s.frequency}): ${s.points.length} points, ${s.points[0]!.date} to ${s.points[s.points.length - 1]!.date}. Source: ${s.source} (${s.sourceUrl}). ${s.licence}`);
  return data(
    `Data series, actual published values only (never a projection):\n${heads.join("\n")}\n\nAs CSV, ready for a chart, spreadsheet or report (keep the source lines with it):\n\`\`\`csv\n${csv}\n\`\`\``,
    { series: out, csv },
  );
}

const text_of = (r: ToolResult) => r.content[0]?.text.split("\n\n")[0] ?? "";

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
      return ok({ tools: visibleTools() }, true);
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
      // Borderless, so the transparent view blends into the conversation; the dashboards ask for the side panel.
      if (app) return ok({ contents: [{ uri, mimeType: MCP_APP_MIME, text: app.html, _meta: { ui: { prefersBorder: false, ...(SIDE_PANEL_APPS.has(uri) ? { preferredDisplayMode: "fullscreen" } : {}) } } }] }, true);
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
        case "evidence_brief": return ok(await evidenceBrief(s(args.asset) ?? "", fetcher));
        case "notable_today": return ok(await notableToday(fetcher));
        case "money_maths": return ok(moneyMathsTool(args));
        case "decision_explainer": return enabledV2.has("decision_explainer") ? ok(await decisionExplainer(args.bank, s(args.date), fetcher)) : fail(-32602, `Unknown tool: ${String(name)}`);
        case "speech_tracker": return enabledV2.has("speech_tracker") ? ok(await speechTracker(args.bank, args.days, fetcher)) : fail(-32602, `Unknown tool: ${String(name)}`);
        case "rate_change_impact": return enabledV2.has("rate_change_impact") ? ok(rateChangeImpactTool(args)) : fail(-32602, `Unknown tool: ${String(name)}`);
        case "upcoming_events": return ok(await upcomingEvents(s(args.only), fetcher));
        case "scam_red_flags": return ok(await scamRedFlags(s(args.pitch), fetcher));
        case "treasury_auctions": return ok(await treasuryAuctions(s(args.kind), fetcher));
        case "compare_countries": return ok(await compareCountries(s(args.indicator), s(args.countries), fetcher));
        case "data_series": return ok(await dataSeries(s(args.series), s(args.countries), fetcher));
        default: return fail(-32602, `Unknown tool: ${String(name)}`);
      }
    }
    default:
      // 2026-07-28: an unknown method is HTTP 404 with -32601, so clients can tell it from a missing endpoint.
      return fail(-32601, `Method not found: ${message.method}`, undefined, modern ? 404 : undefined);
  }
}

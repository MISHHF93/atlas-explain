/**
 * Crypto prices on ATLAS Explain's own data site (data/v1/crypto.json), the one home for:
 *   - the ten coins ATLAS Explain follows (the app's CoinGecko and Kraken lists derive from it),
 *   - parsers for the public sources the data job reads (Kraken first, CoinGecko as the backup),
 *   - the published file's shape and its reader.
 * The data job (scripts/data/build-data.ts) collects prices and 30 days of hourly closes and
 * publishes them; the MCP connector reads only this file, so it calls ATLAS Explain's own API.
 * Pure and dependency-free, so it runs in the job under plain Node and in the app and server.
 */

export interface CryptoCoin {
  symbol: string;
  name: string;
  coingeckoId: string;
  krakenPair: string;
  /** Result keys Kraken may use for this pair (legacy X/Z names and altnames). */
  krakenKeys: readonly string[];
}

export const CRYPTO_COINS: readonly CryptoCoin[] = [
  { symbol: "BTC", name: "Bitcoin", coingeckoId: "bitcoin", krakenPair: "XBTUSD", krakenKeys: ["XXBTZUSD", "XBTUSD"] },
  { symbol: "ETH", name: "Ethereum", coingeckoId: "ethereum", krakenPair: "ETHUSD", krakenKeys: ["XETHZUSD", "ETHUSD"] },
  { symbol: "SOL", name: "Solana", coingeckoId: "solana", krakenPair: "SOLUSD", krakenKeys: ["SOLUSD"] },
  { symbol: "XRP", name: "XRP", coingeckoId: "ripple", krakenPair: "XRPUSD", krakenKeys: ["XXRPZUSD", "XRPUSD"] },
  { symbol: "ADA", name: "Cardano", coingeckoId: "cardano", krakenPair: "ADAUSD", krakenKeys: ["ADAUSD"] },
  { symbol: "DOGE", name: "Dogecoin", coingeckoId: "dogecoin", krakenPair: "XDGUSD", krakenKeys: ["XDGUSD", "XXDGZUSD"] },
  { symbol: "LTC", name: "Litecoin", coingeckoId: "litecoin", krakenPair: "LTCUSD", krakenKeys: ["XLTCZUSD", "LTCUSD"] },
  { symbol: "DOT", name: "Polkadot", coingeckoId: "polkadot", krakenPair: "DOTUSD", krakenKeys: ["DOTUSD"] },
  { symbol: "LINK", name: "Chainlink", coingeckoId: "chainlink", krakenPair: "LINKUSD", krakenKeys: ["LINKUSD"] },
  { symbol: "AVAX", name: "Avalanche", coingeckoId: "avalanche-2", krakenPair: "AVAXUSD", krakenKeys: ["AVAXUSD"] },
];

export const CRYPTO_SCHEMA = "atlas-explain-crypto-v1";
export { CRYPTO_DATA_URL } from "../core/links.ts";
export const KRAKEN_PUBLIC_API = "https://api.kraken.com/0/public";
export const COINGECKO_PUBLIC_API = "https://api.coingecko.com/api/v3";
export const CRYPTO_CREDIT = {
  kraken: "Prices: Kraken public market data (api.kraken.com).",
  coingecko: "Prices by CoinGecko (www.coingecko.com).",
} as const;
export type CryptoSource = keyof typeof CRYPTO_CREDIT;

export interface CryptoPrice {
  symbol: string;
  name: string;
  priceUsd: number;
  changePct: number | null;
  changeWindow: string;
  /** Best bid and ask at capture time (Kraken only; CoinGecko gives a single price). */
  bidUsd?: number;
  askUsd?: number;
}

/** One side of an order book: [price USD, size in coins], best first. */
export type BookSide = [number, number][];

/** Kraken order books, the best levels on each side (captured with the history). */
export interface CryptoBooks {
  source: "kraken";
  asOf: string;
  books: Record<string, { bids: BookSide; asks: BookSide }>;
}

export interface CryptoFile {
  schema: typeof CRYPTO_SCHEMA;
  generatedAt: string;
  prices: { source: CryptoSource; asOf: string; coins: CryptoPrice[] };
  /** Hourly closes, oldest first, as [unix seconds, USD]; up to 30 days per coin. */
  history: { source: CryptoSource; asOf: string; interval: "1h"; series: Record<string, [number, number][]> };
  books?: CryptoBooks;
}

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const pos = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const round = (v: number) => Number(v.toPrecision(8));

function krakenResult(body: unknown): Rec | null {
  if (!isRec(body) || (Array.isArray(body.error) && body.error.length > 0)) return null;
  return isRec(body.result) ? body.result : null;
}

/** Kraken Ticker: last trade and today's open (00:00 UTC). */
export function parseKrakenTicker(body: unknown): CryptoPrice[] {
  const result = krakenResult(body);
  if (!result) return [];
  return CRYPTO_COINS.flatMap((c) => {
    const key = c.krakenKeys.find((k) => isRec(result[k]));
    const t = key ? (result[key] as Rec) : null;
    const last = t && Array.isArray(t.c) ? pos(t.c[0]) : null;
    if (!t || last == null) return [];
    const open = pos(t.o);
    const bid = Array.isArray(t.b) ? pos(t.b[0]) : null;
    const ask = Array.isArray(t.a) ? pos(t.a[0]) : null;
    const quote = bid != null && ask != null && ask >= bid ? { bidUsd: round(bid), askUsd: round(ask) } : {};
    return [{ symbol: c.symbol, name: c.name, priceUsd: round(last), changePct: open ? Number((((last - open) / open) * 100).toFixed(2)) : null, changeWindow: "since 00:00 UTC", ...quote }];
  });
}

/** How many levels of each side of the book are kept. */
export const BOOK_LEVELS = 100;

/** Kraken Depth → the best BOOK_LEVELS bids (highest first) and asks (lowest first). */
export function parseKrakenDepth(body: unknown): { bids: BookSide; asks: BookSide } | null {
  const result = krakenResult(body);
  const book = result ? Object.values(result).find(isRec) : null;
  if (!book) return null;
  const side = (rows: unknown): BookSide =>
    (Array.isArray(rows) ? rows : []).flatMap((r) => {
      const p = Array.isArray(r) ? pos(r[0]) : null;
      const v = Array.isArray(r) ? pos(r[1]) : null;
      return p != null && v != null ? [[round(p), round(v)] as [number, number]] : [];
    });
  const bids = side(book.bids).sort((a, b) => b[0] - a[0]).slice(0, BOOK_LEVELS);
  const asks = side(book.asks).sort((a, b) => a[0] - b[0]).slice(0, BOOK_LEVELS);
  return bids.length && asks.length && asks[0]![0] >= bids[0]![0] ? { bids, asks } : null;
}

/** CoinGecko /coins/markets: price and 24-hour change. */
export function parseCoinGeckoMarkets(body: unknown): CryptoPrice[] {
  if (!Array.isArray(body)) return [];
  const byId = new Map(body.filter(isRec).map((r) => [r.id, r]));
  return CRYPTO_COINS.flatMap((c) => {
    const r = byId.get(c.coingeckoId);
    const last = r ? pos(r.current_price) : null;
    if (!r || last == null) return [];
    const pct = typeof r.price_change_percentage_24h === "number" && Number.isFinite(r.price_change_percentage_24h) ? Number(r.price_change_percentage_24h.toFixed(2)) : null;
    return [{ symbol: c.symbol, name: c.name, priceUsd: round(last), changePct: pct, changeWindow: "in the last 24 hours" }];
  });
}

/** Kraken OHLC rows → hourly closes [unix seconds, USD], oldest first. */
export function parseKrakenOhlc(body: unknown): [number, number][] {
  const result = krakenResult(body);
  const rows = result ? Object.entries(result).find(([k, v]) => k !== "last" && Array.isArray(v))?.[1] : null;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    const t = Array.isArray(r) ? Number(r[0]) : NaN;
    const c = Array.isArray(r) ? pos(r[4]) : null;
    return Number.isFinite(t) && c != null ? [[t, round(c)] as [number, number]] : [];
  });
}

/** CoinGecko /market_chart (days=30 gives hourly points) → [unix seconds, USD], oldest first. */
export function parseCoinGeckoChart(body: unknown): [number, number][] {
  if (!isRec(body) || !Array.isArray(body.prices)) return [];
  return body.prices.flatMap((p) => {
    const t = Array.isArray(p) ? Number(p[0]) : NaN;
    const c = Array.isArray(p) ? pos(p[1]) : null;
    return Number.isFinite(t) && c != null ? [[Math.round(t / 1000), round(c)] as [number, number]] : [];
  });
}

const SOURCES: readonly string[] = ["kraken", "coingecko"];
const isTime = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

/** Reads a published crypto.json; null if it isn't one. Drops any malformed row instead of guessing. */
export function readCryptoFile(body: unknown): CryptoFile | null {
  if (!isRec(body) || body.schema !== CRYPTO_SCHEMA || !isTime(body.generatedAt)) return null;
  const p = body.prices;
  const h = body.history;
  if (!isRec(p) || !SOURCES.includes(p.source as string) || !isTime(p.asOf) || !Array.isArray(p.coins)) return null;
  if (!isRec(h) || !SOURCES.includes(h.source as string) || !isTime(h.asOf) || !isRec(h.series)) return null;
  const known = new Set(CRYPTO_COINS.map((c) => c.symbol));
  const coins = p.coins
    .filter((c): c is CryptoPrice => isRec(c) && known.has(c.symbol as string) && pos(c.priceUsd) != null && typeof c.changeWindow === "string" && (c.changePct === null || typeof c.changePct === "number"))
    .map((c) => {
      const ok = pos(c.bidUsd) != null && pos(c.askUsd) != null && (c.askUsd as number) >= (c.bidUsd as number);
      const { bidUsd: _b, askUsd: _a, ...rest } = c;
      return ok ? { ...rest, bidUsd: c.bidUsd, askUsd: c.askUsd } : rest;
    });
  const series: Record<string, [number, number][]> = {};
  for (const [symbol, rows] of Object.entries(h.series)) {
    if (!known.has(symbol) || !Array.isArray(rows)) continue;
    const clean = rows.filter((r): r is [number, number] => Array.isArray(r) && Number.isFinite(r[0]) && pos(r[1]) != null);
    if (clean.length >= 2) series[symbol] = clean;
  }
  return {
    schema: CRYPTO_SCHEMA,
    generatedAt: body.generatedAt,
    prices: { source: p.source as CryptoSource, asOf: p.asOf, coins },
    history: { source: h.source as CryptoSource, asOf: h.asOf, interval: "1h", series },
    ...readBooks(body.books, known),
  };
}

function readBooks(raw: unknown, known: Set<string>): { books?: CryptoBooks } {
  if (!isRec(raw) || raw.source !== "kraken" || !isTime(raw.asOf) || !isRec(raw.books)) return {};
  const side = (rows: unknown): BookSide =>
    Array.isArray(rows) ? rows.filter((r): r is [number, number] => Array.isArray(r) && pos(r[0]) != null && pos(r[1]) != null).slice(0, BOOK_LEVELS) : [];
  const books: CryptoBooks["books"] = {};
  for (const [symbol, b] of Object.entries(raw.books)) {
    if (!known.has(symbol) || !isRec(b)) continue;
    const bids = side(b.bids);
    const asks = side(b.asks);
    if (bids.length && asks.length) books[symbol] = { bids, asks };
  }
  return Object.keys(books).length ? { books: { source: "kraken", asOf: raw.asOf, books } } : {};
}

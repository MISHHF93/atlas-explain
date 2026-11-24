/**
 * Crypto prices in the web app, from one place: the file ATLAS Explain's data job captures every
 * 10 minutes (captured-prices.ts), the same file the connector reads. The data job fetches Kraken,
 * with CoinGecko as its backup, so the browser never asks either itself. While the page is open,
 * Kraken's public tick stream (live-ticker.ts) moves the captured prices between captures.
 * When the file can't be read, the app says so; it never fills the gap from somewhere else.
 * These network clients are loaded on demand. Prices are never used for ML or training.
 */
import type { AssetDetailView, AssetsState, Fetcher, SparkPoint } from "./assets";
import { capturedCatalog, capturedChart, capturedCitation, isFresh, loadCapturedFile } from "./captured-prices";
import { startTicker, withTicks } from "./live-ticker";
import { type PriceFeedOptions, DEFAULT_PRICE_FEED } from "./price-feed";
export { onTicks } from "./live-ticker";
export { DEFAULT_PRICE_FEED, isLivePriceSource, priceAttribution, priceFeedFromRemoteValues, type PriceFeedOptions } from "./price-feed";

export const PRICE_FETCH_TIMEOUT_MS = 8_000;
export const PRICES_UNAVAILABLE = "Live prices couldn't be loaded right now. We'll try again shortly.";

export async function loadLiveCatalog(
  _feed: PriceFeedOptions = DEFAULT_PRICE_FEED,
  fetcher: Fetcher = fetch,
  now: number = Date.now(),
  timeoutMs: number = PRICE_FETCH_TIMEOUT_MS,
): Promise<AssetsState> {
  const captured = await loadCapturedFile(fetcher, now, timeoutMs);
  const catalog = captured ? capturedCatalog(captured, now) : null;
  if (!catalog) return { kind: "error", reason: PRICES_UNAVAILABLE };
  // Kraken-captured prices go real time: the page streams Kraken's ticks over them while open.
  if (catalog.source !== "kraken") return { kind: "ready", catalog };
  startTicker();
  return { kind: "ready", catalog: withTicks(catalog, now) };
}

export type ChartRange = 1 | 7 | 30;
export const CHART_RANGES: readonly { days: ChartRange; label: string; caption: string }[] = [
  { days: 1, label: "24H", caption: "last 24 hours" },
  { days: 7, label: "7D", caption: "last 7 days" },
  { days: 30, label: "30D", caption: "last 30 days" },
];

/** The captured file holds 30 days of hourly closes, so every range can be drawn from it. */
export function supportsChartRanges(_feed: PriceFeedOptions = DEFAULT_PRICE_FEED): boolean {
  return true;
}

/** A coin's price over a chosen range, from the captured file. Empty when it can't be read or is too old. */
export async function loadLiveChart(
  symbol: string,
  days: ChartRange,
  _feed: PriceFeedOptions = DEFAULT_PRICE_FEED,
  fetcher: Fetcher = fetch,
  now: number = Date.now(),
): Promise<SparkPoint[]> {
  const captured = await loadCapturedFile(fetcher, now);
  return captured && isFresh(captured, now) ? capturedChart(captured, symbol, days, now) : [];
}

/** One coin's price with its last two days of hourly closes, from the captured file. */
export async function loadLiveDetail(
  symbol: string,
  feed: PriceFeedOptions = DEFAULT_PRICE_FEED,
  fetcher: Fetcher = fetch,
  now: number = Date.now(),
  timeoutMs: number = PRICE_FETCH_TIMEOUT_MS,
): Promise<AssetDetailView | null> {
  const list = await loadLiveCatalog(feed, fetcher, now, timeoutMs);
  if (list.kind !== "ready") return null;
  const base = list.catalog.assets.find((asset) => asset.symbol === symbol);
  const captured = await loadCapturedFile(fetcher, now, timeoutMs);
  if (!base || !captured) return null;
  const points = isFresh(captured, now) ? capturedChart(captured, symbol, 2, now) : [];
  return {
    ...base,
    spark: { interval: "1h", points, reason: points.length ? null : "Not enough recent hourly prices were collected to draw a sparkline." },
    citation: capturedCitation(captured),
  };
}

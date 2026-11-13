/**
 * Live public crypto prices when ATLAS on this computer is not reachable.
 * The provider is selected with Firebase Remote Config `price_provider`.
 * These network clients are loaded on demand. Prices are never used for ML
 * or training.
 */
import type { AssetDetailView, AssetsState, Fetcher, SparkPoint } from "./assets";
import { COINGECKO_CITATION, COINGECKO_COINS, loadCoinGeckoCatalog, loadCoinGeckoChart } from "./coingecko";
import { KRAKEN_API, KRAKEN_CITATION, KRAKEN_PAIRS, loadKrakenCatalog, readKrakenOhlc } from "./kraken";
import { type PriceFeedOptions, DEFAULT_PRICE_FEED } from "./price-feed";

export {
  DEFAULT_PRICE_FEED,
  DEFAULT_PRICE_PROVIDER,
  PRICE_PROVIDER_IDS,
  isLivePriceSource,
  parsePriceProvider,
  priceAttribution,
  priceFeedFromRemoteValues,
  readCoinGeckoDemoKey,
  type PriceFeedOptions,
  type PriceProviderId,
} from "./price-feed";

export const PRICE_CACHE_MS = 60_000;
export const PRICE_FETCH_TIMEOUT_MS = 8_000;

export interface PriceCache {
  catalog: { key: string; at: number; state: AssetsState } | null;
  details: Map<string, { at: number; detail: AssetDetailView }>;
}

export function createPriceCache(): PriceCache {
  return { catalog: null, details: new Map() };
}

const sharedCache = createPriceCache();

function catalogCacheKey(feed: PriceFeedOptions): string {
  return `${feed.provider}:${feed.coinGeckoDemoKey ? "demo" : "public"}`;
}

async function getJson(url: string, fetcher: Fetcher, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { signal: ctl.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) throw new Error(`Price feed answered ${res.status}.`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function loadLiveCatalog(
  feed: PriceFeedOptions = DEFAULT_PRICE_FEED,
  fetcher: Fetcher = fetch,
  now: number = Date.now(),
  timeoutMs: number = PRICE_FETCH_TIMEOUT_MS,
  cache: PriceCache = sharedCache,
): Promise<AssetsState> {
  const key = catalogCacheKey(feed);
  const hit = cache.catalog;
  if (hit && hit.key === key && hit.state.kind === "ready" && now - hit.at < PRICE_CACHE_MS) return hit.state;
  const state =
    feed.provider === "coingecko"
      ? await loadCoinGeckoCatalog(fetcher, now, timeoutMs, feed.coinGeckoDemoKey)
      : await loadKrakenCatalog(fetcher, now, timeoutMs);
  if (state.kind === "ready") cache.catalog = { key, at: now, state };
  return state;
}

export async function loadLiveDetail(
  symbol: string,
  feed: PriceFeedOptions = DEFAULT_PRICE_FEED,
  fetcher: Fetcher = fetch,
  now: number = Date.now(),
  timeoutMs: number = PRICE_FETCH_TIMEOUT_MS,
  cache: PriceCache = sharedCache,
): Promise<AssetDetailView | null> {
  const list = await loadLiveCatalog(feed, fetcher, now, timeoutMs, cache);
  if (list.kind !== "ready") return null;
  const base = list.catalog.assets.find((asset) => asset.symbol === symbol);
  if (!base) return null;
  const key = `${catalogCacheKey(feed)}:${symbol}`;
  const hit = cache.details.get(key);
  if (hit && now - hit.at < PRICE_CACHE_MS) return hit.detail;

  let points: SparkPoint[];
  let reason: string | null;
  let citation: string;
  if (feed.provider === "coingecko") {
    const coin = COINGECKO_COINS.find((item) => item.symbol === symbol);
    if (!coin) return null;
    points = await loadCoinGeckoChart(coin.id, fetcher, timeoutMs, feed.coinGeckoDemoKey).catch(() => []);
    reason = points.length >= 2 ? null : "CoinGecko did not return enough recent prices to draw a sparkline.";
    citation = COINGECKO_CITATION;
  } else {
    const pair = KRAKEN_PAIRS.find((item) => item.symbol === symbol);
    if (!pair) return null;
    points = await getJson(`${KRAKEN_API}/OHLC?pair=${pair.pair}&interval=60`, fetcher, timeoutMs)
      .then((body) => readKrakenOhlc(body))
      .catch(() => []);
    reason = points.length >= 2 ? null : "Kraken did not return enough hourly bars to draw a sparkline.";
    citation = KRAKEN_CITATION;
  }
  const detail: AssetDetailView = {
    ...base,
    spark: { interval: "1h", points: points.length >= 2 ? points : [], reason },
    citation,
  };
  cache.details.set(key, { at: now, detail });
  return detail;
}

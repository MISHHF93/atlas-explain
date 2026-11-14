/**
 * Live public crypto prices when ATLAS on this computer is not reachable.
 * The provider is selected with Firebase Remote Config `price_provider`.
 * These network clients are loaded on demand. Prices are never used for ML
 * or training.
 */
import { CRYPTO_STALE_MS, type AssetDetailView, type AssetsState, type Fetcher, type SparkPoint } from "./assets";
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

/** Where the last good price list is kept between page loads. Prices only: nothing about the visitor. */
export interface PriceStore {
  read(): string | null;
  write(value: string): void;
}

export const PRICE_STORE_KEY = "atlas-explain-live-prices";

/** This browser's storage, or null where there is none (tests, private mode). */
export function browserPriceStore(): PriceStore | null {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage;
    if (!storage || typeof storage.getItem !== "function") return null;
    return {
      read: () => {
        try {
          return storage.getItem(PRICE_STORE_KEY);
        } catch {
          return null;
        }
      },
      write: (value) => {
        try {
          storage.setItem(PRICE_STORE_KEY, value);
        } catch {
          // Storage full or blocked: the list is simply fetched again next time.
        }
      },
    };
  } catch {
    return null;
  }
}

type CatalogHit = NonNullable<PriceCache["catalog"]>;

function readStored(store: PriceStore | null, key: string): CatalogHit | null {
  if (!store) return null;
  try {
    const hit = JSON.parse(store.read() ?? "null") as Partial<CatalogHit> | null;
    if (!hit || hit.key !== key || typeof hit.at !== "number" || hit.state?.kind !== "ready" || !Array.isArray(hit.state.catalog?.assets)) return null;
    return hit as CatalogHit;
  } catch {
    return null;
  }
}

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
  store: PriceStore | null = cache === sharedCache ? browserPriceStore() : null,
): Promise<AssetsState> {
  const key = catalogCacheKey(feed);
  /** The hit, when it is for this feed and younger than maxAge. */
  const within = (hit: CatalogHit | null, maxAge: number): CatalogHit | null =>
    hit && hit.key === key && hit.state.kind === "ready" && now - hit.at >= 0 && now - hit.at < maxAge ? hit : null;
  const inMemory = within(cache.catalog, PRICE_CACHE_MS);
  if (inMemory) return inMemory.state;
  // A reload within the minute reuses the stored list, so reloading never hammers a free feed.
  const stored = readStored(store, key);
  const justStored = within(stored, PRICE_CACHE_MS);
  if (justStored) {
    cache.catalog = justStored;
    return justStored.state;
  }
  const state =
    feed.provider === "coingecko"
      ? await loadCoinGeckoCatalog(fetcher, now, timeoutMs, feed.coinGeckoDemoKey)
      : await loadKrakenCatalog(fetcher, now, timeoutMs);
  if (state.kind === "ready") {
    cache.catalog = { key, at: now, state };
    store?.write(JSON.stringify(cache.catalog));
    return state;
  }
  // The feed refused or failed: show the last good list while it is still recent. Its own
  // "as of" time is shown next to the prices, so nothing is passed off as newer than it is.
  const last = within(cache.catalog, CRYPTO_STALE_MS) ?? within(stored, CRYPTO_STALE_MS);
  return last ? last.state : state;
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

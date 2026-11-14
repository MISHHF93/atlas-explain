/**
 * Live crypto prices from CoinGecko's public API (keyless, or with an optional
 * Demo API key read from Remote Config). Attribution is required and is shown
 * next to the prices. These figures are never used for ML or training.
 *
 * A coin CoinGecko does not return stays out of the list: nothing is filled in.
 * Paper predictions still come only from ATLAS, so every light here stays grey.
 */
import {
  mapAsset,
  type AssetDetailView,
  type AssetsState,
  type CatalogView,
  type Fetcher,
  type SparkPoint,
} from "./assets";

export const COINGECKO_API = "https://api.coingecko.com/api/v3";
export const COINGECKO_SITE = "https://www.coingecko.com";
export const COINGECKO_SOURCE_LABEL = "CoinGecko";
export const COINGECKO_WINDOW = "in the last 24 hours";
export const COINGECKO_CITATION = "Prices by CoinGecko (www.coingecko.com).";
export const COINGECKO_GREY_REASON =
  "Price predictions are not shown. These are live prices only.";
export const COINGECKO_STOCK_NOTE =
  "Stock prices aren't available yet. Crypto prices are live.";

export interface CoinGeckoCoin {
  symbol: string;
  name: string;
  id: string;
}

export const COINGECKO_COINS: readonly CoinGeckoCoin[] = [
  { symbol: "BTC", name: "Bitcoin", id: "bitcoin" },
  { symbol: "ETH", name: "Ethereum", id: "ethereum" },
  { symbol: "SOL", name: "Solana", id: "solana" },
  { symbol: "XRP", name: "XRP", id: "ripple" },
  { symbol: "ADA", name: "Cardano", id: "cardano" },
  { symbol: "DOGE", name: "Dogecoin", id: "dogecoin" },
  { symbol: "LTC", name: "Litecoin", id: "litecoin" },
  { symbol: "DOT", name: "Polkadot", id: "polkadot" },
  { symbol: "LINK", name: "Chainlink", id: "chainlink" },
  { symbol: "AVAX", name: "Avalanche", id: "avalanche-2" },
];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const pos = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};
const finite = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

export function coinGeckoHeaders(demoKey?: string): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (demoKey) headers["x-cg-demo-api-key"] = demoKey;
  return headers;
}

export async function getCoinGeckoJson(
  url: string,
  fetcher: Fetcher,
  timeoutMs: number,
  demoKey?: string,
): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetcher(url, {
      signal: ctl.signal,
      cache: "no-store",
      credentials: "omit",
      headers: coinGeckoHeaders(demoKey),
    });
    if (res.status === 429) throw new Error("rate_limited");
    if (!res.ok) throw new Error(`CoinGecko answered ${res.status}.`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Turn a /coins/markets payload into a catalog. Pure, so it is tested without a network. */
export function readCoinGeckoMarkets(body: unknown, now: number = Date.now()): CatalogView | null {
  if (!Array.isArray(body)) return null;
  const byId = new Map<string, Rec>();
  for (const row of body) {
    if (isRec(row) && typeof row.id === "string") byId.set(row.id, row);
  }
  const assets = COINGECKO_COINS.flatMap((coin) => {
    const row = byId.get(coin.id);
    if (!row) return [];
    const last = pos(row.current_price);
    if (last == null) return [];
    const changePct = finite(row.price_change_percentage_24h);
    const asOf = typeof row.last_updated === "string" && Number.isFinite(Date.parse(row.last_updated))
      ? row.last_updated
      : new Date(now).toISOString();
    const asset = mapAsset(
      {
        symbol: coin.symbol,
        name: coin.name,
        class: "crypto",
        source: { label: COINGECKO_SOURCE_LABEL },
        quote: {
          price: last,
          changePct,
          changeWindow: COINGECKO_WINDOW,
          asOf,
          status: "ok",
          freshnessLabel: "Live from CoinGecko",
        },
        light: { reason: COINGECKO_GREY_REASON, horizonLabel: "ATLAS not connected" },
      },
      now,
    );
    if (asset && typeof row.image === "string" && /^https:\/\/(coin-images|assets)\.coingecko\.com\//.test(row.image)) asset.image = row.image;
    return asset ? [asset] : [];
  });
  if (assets.length === 0) return null;
  return {
    asOf: new Date(now).toISOString(),
    assets,
    missing: [{ klass: "stock", reason: COINGECKO_STOCK_NOTE }],
    gateReason: COINGECKO_GREY_REASON,
    stockCitation: null,
    source: "coingecko",
  };
}

function errorState(reason: string): AssetsState {
  return { kind: "error", title: "Live prices could not be loaded", reason };
}

/** Read the public markets list. Never throws; a failure becomes an honest state. */
export async function loadCoinGeckoCatalog(
  fetcher: Fetcher = fetch,
  now: number = Date.now(),
  timeoutMs = 8000,
  demoKey?: string,
): Promise<AssetsState> {
  try {
    const ids = COINGECKO_COINS.map((c) => c.id).join(",");
    const url = `${COINGECKO_API}/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=${COINGECKO_COINS.length}&page=1&sparkline=false&price_change_percentage=24h`;
    const catalog = readCoinGeckoMarkets(await getCoinGeckoJson(url, fetcher, timeoutMs, demoKey), now);
    return catalog
      ? { kind: "ready", catalog }
      : errorState("CoinGecko's public price feed did not return usable prices. Try again in a moment.");
  } catch (error) {
    if (error instanceof Error && error.message === "rate_limited") {
      return errorState("CoinGecko's public price feed is rate-limited right now. Try again in a moment.");
    }
    return errorState("CoinGecko's public price feed is not answering. Check your connection and try again.");
  }
}

/** Recent prices from /coins/{id}/market_chart, used for the sparkline. */
export function readCoinGeckoChart(body: unknown, maxPoints = 48): SparkPoint[] {
  if (!isRec(body) || !Array.isArray(body.prices)) return [];
  return body.prices
    .map((row) => {
      if (!Array.isArray(row) || row.length < 2) return null;
      const t = finite(row[0]);
      const c = pos(row[1]);
      if (t == null || c == null) return null;
      return { t: new Date(t).toISOString(), c };
    })
    .filter((point): point is SparkPoint => point != null)
    .slice(-maxPoints);
}

export async function loadCoinGeckoChart(
  id: string,
  fetcher: Fetcher = fetch,
  timeoutMs = 8000,
  demoKey?: string,
): Promise<SparkPoint[]> {
  const url = `${COINGECKO_API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=2`;
  return readCoinGeckoChart(await getCoinGeckoJson(url, fetcher, timeoutMs, demoKey));
}

export async function loadCoinGeckoDetail(
  symbol: string,
  fetcher: Fetcher = fetch,
  now: number = Date.now(),
  timeoutMs = 8000,
  demoKey?: string,
): Promise<AssetDetailView | null> {
  const coin = COINGECKO_COINS.find((item) => item.symbol === symbol);
  if (!coin) return null;
  const list = await loadCoinGeckoCatalog(fetcher, now, timeoutMs, demoKey);
  if (list.kind !== "ready") return null;
  const base = list.catalog.assets.find((asset) => asset.symbol === symbol);
  if (!base) return null;
  const points = await loadCoinGeckoChart(coin.id, fetcher, timeoutMs, demoKey).catch(() => []);
  return {
    ...base,
    spark: {
      interval: "1h",
      points: points.length >= 2 ? points : [],
      reason: points.length >= 2 ? null : "CoinGecko did not return enough recent prices to draw a sparkline.",
    },
    citation: COINGECKO_CITATION,
  };
}

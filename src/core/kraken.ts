/**
 * Live crypto prices from Kraken's public REST API (keyless, CORS-enabled).
 * Used when ATLAS on this computer is not reachable, so the hosted app and a
 * fresh extension still show real prices. This is the hackathon demo default;
 * a market launch needs written consent or a switch to CoinGecko. See
 * docs/legal/DATA_SOURCES.md. These figures are never used for ML or training.
 *
 * Only public market data is read. No keys, no accounts, no balances.
 * A pair Kraken does not return stays out of the list: nothing is filled in.
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

export const KRAKEN_API = "https://api.kraken.com/0/public";
export const KRAKEN_SOURCE_LABEL = "Kraken public API";
export const KRAKEN_CITATION = "Prices: Kraken public market data (api.kraken.com).";
export const KRAKEN_WINDOW = "since 00:00 UTC";
export const KRAKEN_GREY_REASON =
  "Paper predictions come from ATLAS on your computer. Prices here are live from Kraken; the light stays grey until ATLAS is connected.";
export const KRAKEN_STOCK_NOTE =
  "Stock prices and every paper prediction come from ATLAS on your computer. Connect ATLAS to see them.";

export interface KrakenPair {
  symbol: string;
  name: string;
  pair: string;
  /** Result keys Kraken may use for this pair (legacy X/Z names and altnames). */
  keys: readonly string[];
}

export const KRAKEN_PAIRS: readonly KrakenPair[] = [
  { symbol: "BTC", name: "Bitcoin", pair: "XBTUSD", keys: ["XXBTZUSD", "XBTUSD"] },
  { symbol: "ETH", name: "Ethereum", pair: "ETHUSD", keys: ["XETHZUSD", "ETHUSD"] },
  { symbol: "SOL", name: "Solana", pair: "SOLUSD", keys: ["SOLUSD"] },
  { symbol: "XRP", name: "XRP", pair: "XRPUSD", keys: ["XXRPZUSD", "XRPUSD"] },
  { symbol: "ADA", name: "Cardano", pair: "ADAUSD", keys: ["ADAUSD"] },
  { symbol: "DOGE", name: "Dogecoin", pair: "XDGUSD", keys: ["XDGUSD", "XXDGZUSD"] },
  { symbol: "LTC", name: "Litecoin", pair: "LTCUSD", keys: ["XLTCZUSD", "LTCUSD"] },
  { symbol: "DOT", name: "Polkadot", pair: "DOTUSD", keys: ["DOTUSD"] },
  { symbol: "LINK", name: "Chainlink", pair: "LINKUSD", keys: ["LINKUSD"] },
  { symbol: "AVAX", name: "Avalanche", pair: "AVAXUSD", keys: ["AVAXUSD"] },
];

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const pos = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function getJson(url: string, fetcher: Fetcher, timeoutMs: number): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetcher(url, { signal: ctl.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) throw new Error(`Kraken answered ${res.status}.`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function krakenResult(body: unknown): Rec | null {
  if (!isRec(body)) return null;
  if (Array.isArray(body.error) && body.error.length > 0) return null;
  return isRec(body.result) ? body.result : null;
}

/** Turn a Kraken Ticker payload into a catalog. Pure, so it is tested without a network. */
export function readKrakenTicker(body: unknown, now: number = Date.now()): CatalogView | null {
  const result = krakenResult(body);
  if (!result) return null;
  const asOf = new Date(now).toISOString();
  const assets = KRAKEN_PAIRS.flatMap((p) => {
    const key = p.keys.find((k) => isRec(result[k]));
    const t = key ? (result[key] as Rec) : null;
    if (!t) return [];
    const last = Array.isArray(t.c) ? pos(t.c[0]) : null;
    const open = pos(t.o);
    if (last == null) return [];
    const changePct = open != null ? ((last - open) / open) * 100 : null;
    const asset = mapAsset(
      {
        symbol: p.symbol,
        name: p.name,
        class: "crypto",
        source: { label: KRAKEN_SOURCE_LABEL },
        quote: {
          price: last,
          changePct,
          changeWindow: KRAKEN_WINDOW,
          asOf,
          status: "ok",
          freshnessLabel: "Live from Kraken public API",
        },
        light: { reason: KRAKEN_GREY_REASON, horizonLabel: "ATLAS not connected" },
      },
      now,
    );
    return asset ? [asset] : [];
  });
  if (assets.length === 0) return null;
  return {
    asOf,
    assets,
    missing: [{ klass: "stock", reason: KRAKEN_STOCK_NOTE }],
    gateReason: KRAKEN_GREY_REASON,
    stockCitation: null,
    source: "kraken",
  };
}

/** Read the public ticker. Never throws; a failure becomes an honest state. */
export async function loadKrakenCatalog(fetcher: Fetcher = fetch, now: number = Date.now(), timeoutMs = 8000): Promise<AssetsState> {
  try {
    const url = `${KRAKEN_API}/Ticker?pair=${KRAKEN_PAIRS.map((p) => p.pair).join(",")}`;
    const catalog = readKrakenTicker(await getJson(url, fetcher, timeoutMs), now);
    return catalog
      ? { kind: "ready", catalog }
      : { kind: "error", title: "Live prices could not be loaded", reason: "Kraken's public price feed did not return usable prices. Try again in a moment." };
  } catch {
    return { kind: "error", title: "Live prices could not be loaded", reason: "Kraken's public price feed is not answering. Check your connection and try again." };
  }
}

/** Hourly closes for the last two days from Kraken OHLC. */
export function readKrakenOhlc(body: unknown, maxPoints = 48): SparkPoint[] {
  const result = krakenResult(body);
  if (!result) return [];
  const rows = Object.entries(result).find(([k, v]) => k !== "last" && Array.isArray(v))?.[1];
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => (Array.isArray(r) ? { t: new Date(Number(r[0]) * 1000).toISOString(), c: pos(r[4]) } : null))
    .filter((p): p is SparkPoint => p != null && p.c != null && Number.isFinite(Date.parse(p.t)))
    .slice(-maxPoints);
}

export async function loadKrakenDetail(symbol: string, fetcher: Fetcher = fetch, now: number = Date.now(), timeoutMs = 8000): Promise<AssetDetailView | null> {
  const pair = KRAKEN_PAIRS.find((p) => p.symbol === symbol);
  if (!pair) return null;
  const list = await loadKrakenCatalog(fetcher, now, timeoutMs);
  if (list.kind !== "ready") return null;
  const base = list.catalog.assets.find((a) => a.symbol === symbol);
  if (!base) return null;
  const points: SparkPoint[] = await getJson(`${KRAKEN_API}/OHLC?pair=${pair.pair}&interval=60`, fetcher, timeoutMs)
    .then((body) => readKrakenOhlc(body))
    .catch(() => []);
  return {
    ...base,
    spark: {
      interval: "1h",
      points: points.length >= 2 ? points : [],
      reason: points.length >= 2 ? null : "Kraken did not return enough hourly bars to draw a sparkline.",
    },
    citation: KRAKEN_CITATION,
  };
}

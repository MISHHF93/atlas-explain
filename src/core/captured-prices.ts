/**
 * The app's first source for crypto prices and charts: the file ATLAS Explain captures itself
 * (data/v1/crypto.json on the connector's Worker, refreshed every 10 minutes). The connector reads
 * the same file, so the app and AI assistants show the same price, change and time.
 *
 * Only when the captured file is missing or older than CAPTURED_FRESH_MS does the app fall back to
 * asking a public provider directly (price-provider.ts), and then it says which one answered.
 */
import { mapAsset, type CatalogView, type Fetcher, type SparkPoint } from "./assets";
import { CRYPTO_DATA_URL } from "./links";
import { CRYPTO_CREDIT, readCryptoFile, type CryptoFile } from "../data/crypto";

/** Captured every 10 minutes; past this, the direct fallback is used instead. */
export const CAPTURED_FRESH_MS = 20 * 60_000;
/** One read a minute is plenty: the file changes every 10 minutes. */
const READ_EVERY_MS = 60_000;
export const CAPTURED_GREY_REASON = "Price predictions are not shown. These are live prices only.";
export const CAPTURED_STOCK_NOTE = "Stocks show their official SEC figures; their prices aren't shown.";
const PROVIDER_NAME = { kraken: "Kraken", coingecko: "CoinGecko" } as const;

let last: { at: number; file: CryptoFile | null } | null = null;

/** The captured file, or null when it can't be read right now. Never throws. */
export async function loadCapturedFile(fetcher: Fetcher = fetch, now: number = Date.now(), timeoutMs = 6_000): Promise<CryptoFile | null> {
  if (last && now - last.at >= 0 && now - last.at < READ_EVERY_MS) return last.file;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  let file: CryptoFile | null;
  try {
    const res = await fetcher(CRYPTO_DATA_URL, { signal: ctl.signal, cache: "no-cache", credentials: "omit" });
    file = res.ok ? readCryptoFile(await res.json()) : null;
  } catch {
    file = null;
  } finally {
    clearTimeout(timer);
  }
  last = { at: now, file };
  return file;
}

/** For tests: forget the last read. */
export function resetCapturedCache(): void {
  last = null;
}

export function isFresh(file: CryptoFile, now: number = Date.now()): boolean {
  const age = now - Date.parse(file.prices.asOf);
  return age >= -60_000 && age < CAPTURED_FRESH_MS;
}

/** The captured prices as the app's catalog, or null when the file is too old to call live. */
export function capturedCatalog(file: CryptoFile, now: number = Date.now()): CatalogView | null {
  if (!isFresh(file, now)) return null;
  const provider = PROVIDER_NAME[file.prices.source];
  const assets = file.prices.coins.flatMap((coin) => {
    const asset = mapAsset(
      {
        symbol: coin.symbol,
        name: coin.name,
        class: "crypto",
        source: { label: provider },
        quote: {
          price: coin.priceUsd,
          changePct: coin.changePct,
          changeWindow: coin.changeWindow,
          asOf: file.prices.asOf,
          status: "ok",
          freshnessLabel: `Live from ${provider}, collected by ATLAS Explain`,
        },
        light: { reason: CAPTURED_GREY_REASON, horizonLabel: "ATLAS not connected" },
      },
      now,
    );
    return asset ? [asset] : [];
  });
  if (!assets.length) return null;
  return {
    asOf: file.prices.asOf,
    assets,
    missing: [{ klass: "stock", reason: CAPTURED_STOCK_NOTE }],
    gateReason: CAPTURED_GREY_REASON,
    stockCitation: null,
    source: file.prices.source,
  };
}

/** A coin's hourly closes over the last `days`, oldest first. Empty when there aren't two. */
export function capturedChart(file: CryptoFile, symbol: string, days: number, now: number = Date.now()): SparkPoint[] {
  const since = now / 1000 - days * 86_400;
  const points = (file.history.series[symbol] ?? []).filter(([t]) => t >= since).map(([t, c]) => ({ t: new Date(t * 1000).toISOString(), c }));
  return points.length >= 2 ? points : [];
}

/** The credit line under captured prices and charts. */
export function capturedCitation(file: CryptoFile): string {
  return `${CRYPTO_CREDIT[file.prices.source]} Collected by ATLAS Explain.`;
}

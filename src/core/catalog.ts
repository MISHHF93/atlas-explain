/**
 * The public multi-asset catalog: plain copy per class, search and filters, recently viewed,
 * number formatting and the Explain prompt. Pure functions on the Asset schema; no network, no DOM.
 * See docs/ux/MULTI_ASSET_CATALOG.md §5.
 */
import { assetFromLiveRow, type Asset, type AssetClass } from "./asset-schema";
import type { CatalogView } from "./assets";

export interface ClassInfo {
  label: string;
  /** Two plain sentences on how this market works, shown at the top of its section. */
  intro: string;
  /** Glossary ids behind "Learn how it works". */
  learn: string[];
}

/** Order of sections in the All view. */
export const CLASS_ORDER: readonly AssetClass[] = ["crypto", "stock", "etf", "index", "forex", "commodity", "future", "option", "rate"];

export const CLASS_INFO: Record<AssetClass, ClassInfo> = {
  crypto: { label: "Crypto", intro: "Cryptocurrencies trade around the clock, every day, on many exchanges at once. Prices here are live and move 24/7.", learn: ["spread", "volume"] },
  stock: { label: "Stocks", intro: "A share is a small piece of ownership in a company. US stock markets are open on weekdays, 9:30 am to 4 pm New York time.", learn: ["market_order", "volume", "gap"] },
  etf: { label: "ETFs", intro: "An exchange-traded fund holds a basket of investments, such as an index, a sector or bonds, and trades like a single stock.", learn: ["spread", "volume"] },
  index: { label: "Indices", intro: "An index tracks a group of stocks to describe a market, like the S&P 500 for large US companies. You can't hold an index directly.", learn: ["volume"] },
  forex: { label: "Forex", intro: "Currencies trade in pairs: EUR/USD is how many US dollars one euro buys. The rates here are official daily reference rates, not live trading prices.", learn: ["spread"] },
  commodity: { label: "Commodities", intro: "Raw materials such as oil and natural gas. Benchmark prices are set at specific delivery points and published daily.", learn: ["volume"] },
  future: { label: "Futures", intro: "A futures contract is an agreement to trade something at a set price on a future date. Each contract has a fixed size and an expiry.", learn: ["margin"] },
  option: { label: "Options", intro: "An option gives the right, but not the duty, to trade something at a set price before it expires. Its value depends on time and volatility.", learn: ["implied_volatility", "margin"] },
  rate: { label: "Rates", intro: "Government bond yields show what it costs a government to borrow for different lengths of time. Together they draw the yield curve.", learn: [] },
};

export type ClassFilter = AssetClass | "all";

/** Search across name, symbol and class, then filter. An empty query keeps everything. */
export function searchAssets(
  assets: readonly Asset[],
  query: string,
  filter: { klass: ClassFilter; onlyIds?: ReadonlySet<string> | null },
): Asset[] {
  const q = query.trim().toLowerCase().replace(/\s+/g, " ");
  return assets.filter((a) => {
    if (filter.klass !== "all" && a.class !== filter.klass) return false;
    if (filter.onlyIds && !filter.onlyIds.has(a.id)) return false;
    if (!q) return true;
    const hay = `${a.name} ${a.symbol} ${a.symbol.replace("/", "")} ${CLASS_INFO[a.class].label}`.toLowerCase();
    return q.split(" ").every((part) => hay.includes(part));
  });
}

/** Sections for the All view, in CLASS_ORDER, skipping empty classes. */
export function groupByClass(assets: readonly Asset[]): { klass: AssetClass; assets: Asset[] }[] {
  return CLASS_ORDER.map((klass) => ({ klass, assets: assets.filter((a) => a.class === klass) })).filter((g) => g.assets.length > 0);
}

/** Classes that have at least one asset, for the filter chips. */
export function presentClasses(assets: readonly Asset[]): AssetClass[] {
  const have = new Set(assets.map((a) => a.class));
  return CLASS_ORDER.filter((k) => have.has(k));
}

/** Public live-price rows (CoinGecko or Kraken) as Assets. ATLAS rows never appear here. */
export function assetsFromLiveCatalog(view: CatalogView): Asset[] {
  return view.assets.map((row) => assetFromLiveRow(row, view.source)).filter((a): a is Asset => a !== null);
}

/** Finds an asset by its URL segment: the symbol ("BTC", "EUR/USD", "EURUSD") or the full id. */
export function findAsset(assets: readonly Asset[], key: string): Asset | undefined {
  const k = key.trim().toUpperCase();
  return assets.find((a) => a.symbol.toUpperCase() === k || a.symbol.replace("/", "").toUpperCase() === k || a.id.toUpperCase() === k);
}

/* ---------- recently viewed (this device only) ---------- */

export const RECENT_KEY = "atlas-explain-recent-assets";
export const RECENT_MAX = 10;
const ID_SHAPE = /^[a-z]+:[A-Z0-9:._/-]{1,40}$/;

export function readRecent(raw: string | null): string[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && ID_SHAPE.test(v)).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function addRecent(list: readonly string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, RECENT_MAX);
}

/* ---------- formatting ---------- */

/** "$68,169.70", "1.0842", "4.21%". Never formats a missing value as 0. */
export function formatValue(a: Asset): string | null {
  const q = a.quote;
  if (!q) return null;
  if (a.class === "rate" || a.currency === "%") return `${q.value.toFixed(2)}%`;
  if (a.class === "forex") return q.value.toFixed(q.value < 10 ? 4 : 2);
  const digits = q.value >= 1000 ? 2 : q.value >= 1 ? 2 : q.value >= 0.01 ? 4 : 6;
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: a.currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(q.value);
  } catch {
    return `${q.value.toFixed(digits)} ${a.currency}`;
  }
}

/** "+0.12%" or "−0.03 pt" for rates (a change in yield is in percentage points). */
export function formatChange(a: Asset): { text: string; tone: "up" | "down" | "flat" } | null {
  const q = a.quote;
  if (!q) return null;
  if (a.class === "rate" && q.change != null) {
    const v = q.change;
    return { text: `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)} pt`, tone: v > 0 ? "up" : v < 0 ? "down" : "flat" };
  }
  if (q.changePct == null) return null;
  const v = q.changePct;
  return { text: `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`, tone: v > 0 ? "up" : v < 0 ? "down" : "flat" };
}

export const MODE_LABEL: Record<"live" | "delayed" | "daily" | "reference", string> = {
  live: "Live",
  delayed: "Delayed",
  daily: "Daily",
  reference: "Reference",
};

export const MODE_HELP: Record<"live" | "delayed" | "daily" | "reference", string> = {
  live: "Updated within about a minute.",
  delayed: "Delayed by at least 15 minutes, as the exchange requires.",
  daily: "One official value per day.",
  reference: "An official published rate, not a trading price.",
};

/** "13 Nov, 4:00 PM" in the reader's own time zone; daily and reference values show the date only. */
export function formatAsOf(a: Asset, locale?: string): string | null {
  const q = a.quote;
  if (!q) return null;
  const d = new Date(q.asOf);
  if (Number.isNaN(d.getTime())) return null;
  if (q.mode === "daily" || q.mode === "reference") return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(d);
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(d);
}

/** The question sent to Explain: only public fields, education wording, never a trade request. */
export function explainAssetPrompt(a: Asset): string {
  const value = formatValue(a);
  const change = formatChange(a);
  const figure = value
    ? `${value}${change ? ` (${change.text} ${a.quote?.changeWindow ?? ""})` : ""}, ${MODE_LABEL[a.quote!.mode].toLowerCase()} data from ${a.quote!.source.label}`
    : "no price shown";
  return `Explain for a beginner what ${a.name} (${a.symbol}) is, as a ${CLASS_INFO[a.class].label.toLowerCase()} instrument, and what this figure means: ${figure}. ` +
    "Explain the terms involved. Do not recommend a trade.";
}

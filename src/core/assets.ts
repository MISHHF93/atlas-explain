/**
 * The asset view model: catalog rows and details, mapped from the captured price file (and, before it,
 * any payload) and checked field by field. Education only.
 *
 * Every field is re-checked here: a light leaves grey only with a real direction,
 * at least MIN_SAMPLE_SIZE resolved samples and a MIN_HIT_RATE hit rate. Any text
 * with trade wording is dropped. Missing numbers stay missing; nothing is filled in.
 * No balances, accounts or keys are read, even if a payload carried them.
 */
import { MIN_HIT_RATE, MIN_SAMPLE_SIZE, PAPER_PREDICTION_LABEL, type SignalColour } from "./signal.ts";

/** Poll cadence while Assets is open. Crypto trades 24/7; IEX stock bars land once a day. */
export const POLL_CRYPTO_MS = 15_000;
export const POLL_STOCK_MS = 15 * 60_000;
/** Client-side staleness bounds, checked again even when ATLAS says "ok". */
export const CRYPTO_STALE_MS = 20 * 60_000;
export const STOCK_STALE_MS = 5 * 86_400_000;

export const LEANS_UP_LABEL = "Leans up";
export const LEANS_DOWN_LABEL = "Leans down";
export const NO_EVIDENCE_LABEL = "Not enough evidence";
export const SHADOW_DISCLAIMER =
  "Paper prediction from ATLAS shadow models. They run on paper only and are not cleared for use. Education only, not investment advice.";

const TRADE_WORD = /\b(buy|sell|short|long|hold|entry|exit|order|position)\b/i;
const SYMBOL = /^[A-Z0-9][A-Z0-9.\-/]{0,15}$/;

export type AssetClass = "crypto" | "stock";
export type Freshness = "live" | "daily" | "stale" | "missing";
export type Lean = "up" | "down" | "none";

export interface LeanView {
  horizon: string;
  horizonLabel: string;
  lean: Lean;
  colour: SignalColour;
  label: string;
  reason: string;
  sampleSize: number | null;
  hitRate: number | null;
}

export interface QuoteView {
  price: number | null;
  changePct: number | null;
  changeWindow: string;
  asOf: string | null;
  freshness: Freshness;
  freshnessLabel: string;
  reason: string | null;
}

export interface AssetView {
  /** Coin image URL from CoinGecko's API data, when the feed provides one. */
  image?: string;
  symbol: string;
  name: string;
  klass: AssetClass;
  sourceLabel: string;
  badge: "Live" | "Daily" | "Stale" | "No data";
  quote: QuoteView;
  light: LeanView;
  leans: LeanView[];
}

export interface SparkPoint {
  t: string;
  c: number;
}

export interface AssetDetailView extends AssetView {
  spark: { interval: string; points: SparkPoint[]; reason: string | null };
  citation: string | null;
}

/** The shared evidence gate, as ATLAS reports it. Codes are kept; the digest translates them. */
export interface GateView {
  passed: boolean;
  failed: string[];
  shadowWeeks: number | null;
  requiredWeeks: number | null;
}

export interface CatalogView {
  asOf: string | null;
  assets: AssetView[];
  missing: { klass: AssetClass; reason: string }[];
  gateReason: string;
  stockCitation: string | null;
  /** Absent when this ATLAS build does not report the gate (for example the MCP list). */
  gate?: GateView | null;
  /** Where the list came from. ATLAS on this computer, or a public live-price provider when ATLAS is not reachable. */
  source?: "atlas" | "kraken" | "coingecko";
}

/* ---------- small readers ---------- */

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, max = 400): string | null => {
  if (typeof v !== "string") return null;
  const flat = v.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
const iso = (v: unknown): string | null => {
  const s = str(v, 40);
  return s && Number.isFinite(Date.parse(s)) ? s : null;
};

/** Text that may reach the screen: never trade wording. */
export function safeText(value: unknown, fallback: string, max = 400): string {
  const s = str(value, max);
  return s && !TRADE_WORD.test(s) ? s : fallback;
}

/* ---------- lean ---------- */

/** One horizon's lean. Grey unless every check passes on this side too. */
export function mapLean(raw: unknown): LeanView {
  const r = isRec(raw) ? raw : {};
  const hitRaw = num(r.hitRate);
  const hit = hitRaw != null && hitRaw >= 0 && hitRaw <= 1 ? hitRaw : null;
  const nRaw = num(r.sampleSize);
  const n = nRaw != null && Number.isInteger(nRaw) && nRaw >= 0 ? nRaw : null;
  const horizon = safeText(r.horizon, "", 12);
  const horizonLabel = safeText(r.horizonLabel, horizon || "This horizon", 40);
  const reasonRaw = str(r.reason);
  const reason = reasonRaw && !TRADE_WORD.test(reasonRaw) ? reasonRaw : null;
  const claimed = r.lean === "up" || r.lean === "down" ? r.lean : "none";
  const colourOk = (claimed === "up" && r.colour === "green") || (claimed === "down" && r.colour === "red");
  const evidence = n != null && n >= MIN_SAMPLE_SIZE && hit != null && hit >= MIN_HIT_RATE;
  const lean: Lean = claimed !== "none" && colourOk && evidence && reason != null ? claimed : "none";
  const colour: SignalColour = lean === "up" ? "green" : lean === "down" ? "red" : "grey";
  return {
    horizon,
    horizonLabel,
    lean,
    colour,
    label: lean === "up" ? LEANS_UP_LABEL : lean === "down" ? LEANS_DOWN_LABEL : NO_EVIDENCE_LABEL,
    // A server reason written for a direction is never shown under a grey light.
    reason: lean === "none" ? greyReason(claimed === "none" ? reason : null, n, hit) : (reason as string),
    sampleSize: n,
    hitRate: hit,
  };
}

function greyReason(reason: string | null, n: number | null, hit: number | null): string {
  if (reason) return reason;
  if (n == null || n < MIN_SAMPLE_SIZE) return `Not enough evidence: ${n ?? 0} of ${MIN_SAMPLE_SIZE} resolved paper samples. The light stays grey.`;
  if (hit == null || hit < MIN_HIT_RATE) return `Not enough evidence: hit rate under ${Math.round(MIN_HIT_RATE * 100)}%. The light stays grey.`;
  return "Not enough evidence. The light stays grey.";
}

export const GREY_LEAN: LeanView = mapLean(null);

/* ---------- quote ---------- */

export function mapQuote(raw: unknown, klass: AssetClass, now: number = Date.now()): QuoteView {
  const r = isRec(raw) ? raw : {};
  const priceRaw = num(r.price);
  const price = priceRaw != null && priceRaw > 0 ? priceRaw : null;
  const changePct = price == null ? null : num(r.changePct);
  const asOf = iso(r.asOf);
  const status = r.status === "ok" || r.status === "stale" ? r.status : "missing";
  const limit = klass === "crypto" ? CRYPTO_STALE_MS : STOCK_STALE_MS;
  const age = asOf ? now - Date.parse(asOf) : Infinity;
  let freshness: Freshness;
  if (price == null || status === "missing" || !asOf) freshness = "missing";
  else if (status === "stale" || age > limit) freshness = "stale";
  else freshness = klass === "crypto" ? "live" : "daily";
  const defaultLabel = {
    live: "Live from Kraken (24/7)",
    daily: "Daily close, updated next morning",
    stale: klass === "crypto" ? "Stale: no recent Kraken bar" : "Stale: no recent IEX session",
    missing: "No data yet",
  }[freshness];
  const label = safeText(r.freshnessLabel, defaultLabel, 90);
  return {
    price,
    changePct: changePct == null ? null : Math.round(changePct * 100) / 100,
    changeWindow: safeText(r.changeWindow, klass === "crypto" ? "24h" : "1 session", 40),
    asOf,
    freshness,
    // A server label that still says "Live" while the bar is old would be dishonest, so it is replaced.
    freshnessLabel: (freshness === "stale" && !/stale/i.test(label)) || (freshness === "live" && /stale/i.test(label)) ? defaultLabel : label,
    reason: str(r.reason) && !TRADE_WORD.test(String(r.reason)) ? str(r.reason) : null,
  };
}

export function badgeFor(q: QuoteView): AssetView["badge"] {
  return q.freshness === "live" ? "Live" : q.freshness === "daily" ? "Daily" : q.freshness === "stale" ? "Stale" : "No data";
}

/* ---------- asset rows ---------- */

export function mapAsset(raw: unknown, now: number = Date.now()): AssetView | null {
  if (!isRec(raw)) return null;
  const klass: AssetClass | null = raw.class === "crypto" ? "crypto" : raw.class === "stock" ? "stock" : null;
  const symbol = typeof raw.symbol === "string" ? raw.symbol.trim().toUpperCase() : "";
  if (!klass || !SYMBOL.test(symbol)) return null;
  const quote = mapQuote(raw.quote, klass, now);
  const leans = Array.isArray(raw.leans) ? raw.leans.slice(0, 6).map(mapLean) : [];
  const light = isRec(raw.light) ? mapLean(raw.light) : leans.find((l) => l.colour !== "grey") ?? leans[0] ?? GREY_LEAN;
  const source = isRec(raw.source) ? raw.source : {};
  return {
    symbol,
    name: safeText(raw.name, symbol, 60),
    klass,
    sourceLabel: safeText(source.label, klass === "crypto" ? "Kraken spot" : "IEX HIST (one venue, T+1)", 60),
    badge: badgeFor(quote),
    quote,
    light,
    leans,
  };
}

/* ---------- formatting ---------- */

export function formatPrice(price: number | null): string {
  if (price == null) return "—";
  const digits = price >= 1000 ? 2 : price >= 10 ? 2 : price >= 1 ? 3 : 5;
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: digits > 3 ? 4 : 2, maximumFractionDigits: digits })}`;
}

export function formatChange(pct: number | null): { text: string; tone: "up" | "down" | "flat" } {
  if (pct == null) return { text: "—", tone: "flat" };
  const tone = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return { text: `${sign}${Math.abs(pct).toFixed(2)}%`, tone };
}

/** "over 24h" / "since the 2026-11-06 close". */
export function changeWindowText(q: Pick<QuoteView, "changeWindow">): string {
  // A window that already reads as a phrase ("since …", "in the last 24 hours", "over 24 hours") is kept as it is.
  return /^(since|in|over)\b/i.test(q.changeWindow) ? q.changeWindow : `over ${q.changeWindow}`;
}

export function sampleLabel(l: LeanView): string {
  return l.sampleSize == null ? "Sample —" : `Sample ${l.sampleSize} of ${MIN_SAMPLE_SIZE} needed`;
}

/** SVG path for a sparkline in a w×h box. Empty string when there is nothing to draw. */
export function sparkPath(points: readonly SparkPoint[], w: number, h: number, pad = 2): string {
  if (points.length < 2) return "";
  const ys = points.map((p) => p.c);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const span = hi - lo || 1;
  return points
    .map((p, i) => {
      const x = pad + (i / (points.length - 1)) * (w - 2 * pad);
      const y = pad + (1 - (p.c - lo) / span) * (h - 2 * pad);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * The one price sparkline: a line, the shaded area under it and a dot on the latest price.
 * Built from numbers only (sparkPath), so it is safe to set as markup. Used by the ATLAS asset
 * sheet and the public catalog chart, so both draw the same chart.
 */
export function sparkSvg(points: readonly SparkPoint[], w = 312, h = 64): string {
  const pad = 2;
  const line = sparkPath(points, w, h, pad);
  if (!line) return "";
  const last = points[points.length - 1]!;
  const ys = points.map((p) => p.c);
  const lo = Math.min(...ys);
  const span = Math.max(...ys) - lo || 1;
  const endX = (w - pad).toFixed(1);
  const endY = (pad + (1 - (last.c - lo) / span) * (h - 2 * pad)).toFixed(1);
  const area = `${line} L${endX} ${h} L${pad.toFixed(1)} ${h} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">` +
    `<path class="spark-area" d="${area}"/>` +
    `<path class="spark-line" d="${line}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` +
    `<circle class="spark-end" cx="${endX}" cy="${endY}" r="3" vector-effect="non-scaling-stroke"/></svg>`;
}

/* ---------- connection ---------- */

export type AssetsState =
  | { kind: "loading" }
  | { kind: "ready"; catalog: CatalogView }
  | { kind: "not_connected"; reason: string }
  | { kind: "hosted" }
  | { kind: "error"; reason: string; title?: string };

export const NOT_CONNECTED_TITLE = "Prices are unavailable right now";
export const NOT_CONNECTED_BODY =
  "We couldn't load prices just now. Check your connection, then try again.";
export const HOSTED_BODY = NOT_CONNECTED_BODY;

export type Fetcher = (url: string, init: { method?: string; signal: AbortSignal; cache: RequestCache; credentials: RequestCredentials; headers?: Record<string, string>; body?: string }) => Promise<Response>;

/** Next poll delay: crypto every 15 s while visible; stocks-only lists every 15 min; paused when hidden. */
export function nextPollMs(assets: readonly Pick<AssetView, "klass">[], visible: boolean): number | null {
  if (!visible) return null;
  return assets.some((a) => a.klass === "crypto") ? POLL_CRYPTO_MS : POLL_STOCK_MS;
}

export { PAPER_PREDICTION_LABEL };

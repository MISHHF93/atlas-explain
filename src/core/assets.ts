/**
 * Asset catalog, live prices and paper predictions read from ATLAS on this computer
 * (POST http://localhost:3000/api/mcp/public when that route is present, otherwise GET /api/explain/assets). Education only.
 *
 * Every field is re-checked here: a light leaves grey only with a real direction,
 * at least MIN_SAMPLE_SIZE resolved samples and a MIN_HIT_RATE hit rate. Any text
 * with trade wording is dropped. Missing numbers stay missing; nothing is filled in.
 * No balances, accounts or keys are read, even if a payload carried them.
 */
import { ATLAS_ORIGIN } from "./atlas-origin";
import { MIN_HIT_RATE, MIN_SAMPLE_SIZE, PAPER_PREDICTION_LABEL, type SignalColour } from "./signal";
import {
  MCP_ASSETS_SCHEMA,
  adaptMcpAsset,
  callMcp,
  mcpToolNames,
  structuredContent,
} from "./atlas-mcp";

export { ATLAS_ORIGIN } from "./atlas-origin";
export const ASSETS_PATH = "/api/explain/assets";
export const ASSETS_SCHEMA = "atlas-explain-assets-v1";
export const ASSET_SCHEMA = "atlas-explain-asset-v1";

/** Poll cadence while the popup is open. Crypto trades 24/7; IEX stock bars land once a day. */
export const POLL_CRYPTO_MS = 15_000;
export const POLL_STOCK_MS = 15 * 60_000;
/** Client-side staleness bounds, checked again even when ATLAS says "ok". */
export const CRYPTO_STALE_MS = 15 * 60_000;
export const STOCK_STALE_MS = 5 * 86_400_000;

export const LEANS_UP_LABEL = "Leans up";
export const LEANS_DOWN_LABEL = "Leans down";
export const NO_EVIDENCE_LABEL = "Not enough evidence";
export const SHADOW_DISCLAIMER =
  "Paper prediction from ATLAS shadow models. They run on paper only and are not cleared for use. Education only, not investment advice.";

const TRADE_WORD = /\b(buy|sell|short|long|hold|entry|exit|order|position)\b/i;
const PRIVATE_KEY = /balance|account|equity|portfolio|pnl|secret|token|password/i;
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
}

const GATE_CODE = /^[a-z0-9_]{1,48}$/;

export function readGate(raw: unknown): GateView | null {
  if (!isRec(raw) || typeof raw.passed !== "boolean") return null;
  const failed = (Array.isArray(raw.failed) ? raw.failed : []).filter((c): c is string => typeof c === "string" && GATE_CODE.test(c)).slice(0, 12);
  const weeks = (v: unknown) => (num(v) != null && (v as number) >= 0 && (v as number) < 520 ? (v as number) : null);
  return { passed: raw.passed && failed.length === 0, failed, shadowWeeks: weeks(raw.shadowWeeks), requiredWeeks: weeks(raw.requiredWeeks) };
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

export function hasTradeWording(text: string): boolean {
  return TRADE_WORD.test(text);
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
    missing: "No data on this computer",
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

export function readCatalog(payload: unknown, now: number = Date.now()): CatalogView | null {
  if (!isRec(payload) || payload.schema !== ASSETS_SCHEMA || payload.paperOnly !== true) return null;
  const rows = Array.isArray(payload.assets) ? payload.assets : [];
  const assets = rows.slice(0, 400).map((r) => mapAsset(r, now)).filter((a): a is AssetView => a != null);
  const missing = (Array.isArray(payload.missing) ? payload.missing : [])
    .filter(isRec)
    .map((m) => ({ klass: (m.class === "stock" ? "stock" : "crypto") as AssetClass, reason: safeText(m.reason, "No data on this computer yet.") }));
  const gate = isRec(payload.gate) ? payload.gate : {};
  const sources = isRec(payload.sources) && isRec(payload.sources.stock) ? payload.sources.stock : {};
  return {
    asOf: iso(payload.asOf),
    assets,
    missing,
    gateReason: safeText(gate.reason, ""),
    stockCitation: str(sources.citation),
    gate: readGate(payload.gate),
  };
}

export function readDetail(payload: unknown, now: number = Date.now()): AssetDetailView | null {
  if (!isRec(payload) || payload.schema !== ASSET_SCHEMA || payload.paperOnly !== true) return null;
  const base = mapAsset(payload, now);
  if (!base) return null;
  const spark = isRec(payload.sparkline) ? payload.sparkline : {};
  const points = (Array.isArray(spark.points) ? spark.points : [])
    .filter(isRec)
    .map((p) => ({ t: iso(p.t), c: num(p.c) }))
    .filter((p): p is SparkPoint => p.t != null && p.c != null && p.c > 0)
    .slice(-200);
  return {
    ...base,
    spark: {
      interval: safeText(spark.interval, "", 8),
      points: points.length >= 2 ? points : [],
      reason: points.length >= 2 ? null : safeText(spark.reason, "Not enough stored bars to draw a sparkline."),
    },
    citation: str(payload.citation),
  };
}

/** Defence in depth: a payload that names private fields is refused outright. */
export function carriesPrivateFields(payload: unknown, depth = 0): boolean {
  if (depth > 6) return false;
  if (Array.isArray(payload)) return payload.some((v) => carriesPrivateFields(v, depth + 1));
  if (!isRec(payload)) return false;
  return Object.entries(payload).some(([k, v]) => PRIVATE_KEY.test(k) || carriesPrivateFields(v, depth + 1));
}

/* ---------- list filters ---------- */

export type ClassFilter = "all" | AssetClass;

export function filterAssets(assets: readonly AssetView[], query: string, klass: ClassFilter = "all"): AssetView[] {
  const q = query.trim().toLowerCase();
  return assets.filter((a) => {
    if (klass !== "all" && a.klass !== klass) return false;
    if (!q) return true;
    return a.symbol.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.symbol.replace("-USD", "").toLowerCase() === q;
  });
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
  return /^since\b/i.test(q.changeWindow) ? q.changeWindow : `over ${q.changeWindow}`;
}

export function hitLabel(l: LeanView): string {
  return l.hitRate == null ? "Hit rate —" : `Hit rate ${Math.round(l.hitRate * 100)}%`;
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

/* ---------- explain hand-off ---------- */

/** The question sent to the Explain tab. Context only: price, freshness, lean and why. */
export function explainAssetQuestion(a: AssetView): string {
  const ch = formatChange(a.quote.changePct).text;
  const price = a.quote.price == null ? "no recent price on this computer" : `${formatPrice(a.quote.price)} (${ch} ${changeWindowText(a.quote)}, ${a.quote.freshnessLabel})`;
  const lean = a.light.colour === "grey" ? `the ATLAS paper light is grey (${NO_EVIDENCE_LABEL.toLowerCase()})` : `the ATLAS paper model ${a.light.label.toLowerCase()} over the ${a.light.horizonLabel.toLowerCase()}`;
  return `Explain, for a beginner, what is going on with ${a.name} (${a.symbol}): ${price}; ${lean}. ` +
    `Explain what the price change, the data freshness, hit rate and sample size mean here. Do not recommend a trade.`;
}

/* ---------- connection ---------- */

export type AssetsState =
  | { kind: "loading" }
  | { kind: "ready"; catalog: CatalogView }
  | { kind: "not_connected"; reason: string }
  | { kind: "hosted" }
  | { kind: "error"; reason: string };

export const NOT_CONNECTED_TITLE = "Connect ATLAS (run it on this computer)";
export const NOT_CONNECTED_BODY =
  "Assets, prices and paper predictions come from ATLAS on this computer at localhost:3000. Start ATLAS, then this list fills in. Until then every light stays grey.";
export const HOSTED_BODY =
  "The web app cannot read ATLAS on your computer. Install the ATLAS Explain extension and run ATLAS locally to see live assets. Every light stays grey here.";

/** Whether this page may try localhost at all. The hosted web app never does. */
export function canReachLocalAtlas(loc: { protocol: string; hostname: string }, isExtension: boolean): boolean {
  if (isExtension) return true;
  return loc.hostname === "localhost" || loc.hostname === "127.0.0.1";
}

export type Fetcher = (url: string, init: { method?: string; signal: AbortSignal; cache: RequestCache; credentials: RequestCredentials; headers?: Record<string, string>; body?: string }) => Promise<Response>;

/** Read one ATLAS URL. Never throws; never sends cookies. */
export async function readAtlas(path: string, fetcher: Fetcher = fetch, timeoutMs = 6000): Promise<{ ok: true; body: unknown } | { ok: false; reason: string; reachable: boolean }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetcher(`${ATLAS_ORIGIN}${path}`, { signal: ctl.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) {
      const reason = res.status === 404 ? "This ATLAS build has no Explain asset route yet. Update ATLAS." : res.status === 403 || res.status === 401 ? "ATLAS only answers Explain on this computer." : `ATLAS answered ${res.status}.`;
      return { ok: false, reason, reachable: true };
    }
    const body: unknown = await res.json();
    if (carriesPrivateFields(body)) return { ok: false, reason: "ATLAS sent fields Explain never reads, so the answer was dropped.", reachable: true };
    return { ok: true, body };
  } catch {
    return { ok: false, reason: "ATLAS is not answering at localhost:3000.", reachable: false };
  } finally {
    clearTimeout(timer);
  }
}

export function readMcpCatalog(payload: unknown, now: number = Date.now()): CatalogView | null {
  if (!isRec(payload) || payload.schema !== MCP_ASSETS_SCHEMA || payload.paperOnly !== true) return null;
  if (payload.executionPermission !== "none") return null;
  if (carriesPrivateFields(payload)) return null;
  const rows = Array.isArray(payload.assets) ? payload.assets : [];
  const assets = rows.slice(0, 400).map((r) => mapAsset(adaptMcpAsset(r), now)).filter((a): a is AssetView => a != null);
  const asOf = iso(payload.asOf);
  return { asOf, assets, missing: [], gateReason: "", stockCitation: null };
}

async function loadCatalogViaMcp(fetcher: Fetcher, now: number): Promise<AssetsState | null> {
  const listed = await callMcp("tools/list", {}, fetcher, 6000, carriesPrivateFields);
  if (!listed.ok) return null;
  const names = mcpToolNames(listed.result);
  if (!names.includes("list_assets") || names.some((n) => /order|balance|account|transfer|withdraw/.test(n))) return null;
  const called = await callMcp("tools/call", { name: "list_assets", arguments: {} }, fetcher, 6000, carriesPrivateFields);
  if (!called.ok) {
    return called.reachable && called.reason.includes("never reads")
      ? { kind: "error", reason: called.reason }
      : null;
  }
  const payload = structuredContent(called.result);
  if (carriesPrivateFields(payload)) {
    return { kind: "error", reason: "ATLAS sent fields Explain never reads, so the answer was dropped." };
  }
  const catalog = readMcpCatalog(payload, now);
  return catalog ? { kind: "ready", catalog } : null;
}

export async function loadCatalog(fetcher?: Fetcher, now: number = Date.now()): Promise<AssetsState> {
  const viaMcp = await loadCatalogViaMcp(fetcher ?? fetch, now);
  if (viaMcp) return viaMcp;
  const r = await readAtlas(ASSETS_PATH, fetcher);
  if (!r.ok) return r.reachable ? { kind: "error", reason: r.reason } : { kind: "not_connected", reason: r.reason };
  const catalog = readCatalog(r.body, now);
  return catalog ? { kind: "ready", catalog } : { kind: "error", reason: "ATLAS sent an asset list Explain does not recognise." };
}

export async function loadDetail(symbol: string, fetcher?: Fetcher, now: number = Date.now()): Promise<AssetDetailView | null> {
  if (!SYMBOL.test(symbol)) return null;
  const r = await readAtlas(`${ASSETS_PATH}/${encodeURIComponent(symbol)}`, fetcher);
  return r.ok ? readDetail(r.body, now) : null;
}

/** Next poll delay: crypto every 15 s while visible; stocks-only lists every 15 min; paused when hidden. */
export function nextPollMs(assets: readonly Pick<AssetView, "klass">[], visible: boolean): number | null {
  if (!visible) return null;
  return assets.some((a) => a.klass === "crypto") ? POLL_CRYPTO_MS : POLL_STOCK_MS;
}

export { PAPER_PREDICTION_LABEL };

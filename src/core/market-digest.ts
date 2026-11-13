/**
 * Grounded daily digest: built only from the ATLAS asset catalog on this computer.
 * Every line carries its source and time. Nothing is estimated: a market without a
 * fresh quote is left out and counted, and a missing engine says "not connected yet".
 * Education only. No direction is ever stated beyond ATLAS's own paper light.
 */
import type { AssetClass, AssetView, CatalogView, GateView } from "./assets";
import { MIN_HIT_RATE, MIN_SAMPLE_SIZE } from "./signal";

const ZONE = "America/Toronto";

export interface ClassSummary {
  klass: AssetClass;
  label: string;
  total: number;
  counted: number;
  up: number;
  down: number;
  flat: number;
  medianPct: number | null;
  window: string;
  sourceLabel: string;
  asOfLine: string;
}

export interface TrackRecord {
  colour: "green" | "red" | "grey";
  label: string;
  horizonLabel: string;
  sampleSize: number | null;
  hitRate: number | null;
  line: string;
}

export interface Mover {
  symbol: string;
  name: string;
  klass: AssetClass;
  changePct: number;
  window: string;
  record: TrackRecord;
  howWeKnow: string;
}

export interface EvidenceSummary {
  cleared: number;
  total: number;
  closest: { symbol: string; sampleSize: number } | null;
  stillNeeded: string[];
  line: string;
}

export interface NotConnected {
  title: string;
  source: string;
  why: string;
}

export type MarketDigestView =
  | { kind: "ready"; classes: ClassSummary[]; movers: Mover[]; evidence: EvidenceSummary; stockCitation: string | null; notConnected: NotConnected[]; howWeKnow: string }
  | { kind: "not_connected"; reason: string }
  | { kind: "empty"; reason: string };

export const MARKET_NOT_CONNECTED =
  "Connect ATLAS on this computer to see today's grounded digest. Nothing is estimated while it is away.";
export const MARKET_EMPTY = "ATLAS answered, but no market has a fresh quote right now. Nothing is filled in.";
export const HOW_WE_KNOW =
  "Each line names its source and time from ATLAS on this computer. Grey means not enough evidence yet, not a forecast. Education only.";

/** Engines ATLAS has, but does not yet expose per asset to Explain. Shown as honest gaps. */
export const NOT_CONNECTED_YET: NotConnected[] = [
  { title: "News for this asset", source: "GDELT", why: "ATLAS does not filter news by symbol yet." },
  { title: "Filings for this ticker", source: "SEC EDGAR", why: "ATLAS returns market-wide filings, not one ticker yet." },
  { title: "Short interest", source: "FINRA", why: "Not collected by ATLAS yet." },
  { title: "What usually followed drops like this", source: "ATLAS drop studies", why: "The study runs, but has no read-only route yet." },
];

const GATE_PLAIN: Record<string, string> = {
  n_oos: "more out-of-sample results",
  brier_beats_base_rate: "probabilities that beat a simple base rate",
  logloss_beats_base_rate: "probabilities that beat a simple base rate",
  deflated_sharpe: "a result that survives a multiple-testing check",
  pbo: "a pass on the overfitting check",
  shadow_weeks: "more weeks of paper tracking",
  coverage: "more weeks of paper tracking",
  calibration: "better-calibrated probabilities",
};

/** Plain words for ATLAS gate codes. Unknown codes are named as "another ATLAS check". */
export function plainGateCheck(code: string): string {
  return GATE_PLAIN[code] ?? "another ATLAS check";
}

export function stillNeeded(gate: GateView | null | undefined): string[] {
  if (!gate) return [];
  const out: string[] = [];
  for (const code of gate.failed) {
    let text = plainGateCheck(code);
    if ((code === "shadow_weeks" || code === "coverage") && gate.shadowWeeks != null && gate.requiredWeeks != null) {
      text = `${fmtWeeks(gate.shadowWeeks)} of ${fmtWeeks(gate.requiredWeeks)} paper weeks so far`;
    }
    if (!out.includes(text)) out.push(text);
  }
  return out;
}

function fmtWeeks(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function fresh(a: AssetView): boolean {
  return a.quote.changePct != null && (a.quote.freshness === "live" || a.quote.freshness === "daily");
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  const hi = s[m] ?? 0;
  const v = s.length % 2 ? hi : ((s[m - 1] ?? hi) + hi) / 2;
  return Math.round(v * 100) / 100;
}

function mostCommon(xs: string[]): string {
  const counts = new Map<string, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best = "";
  let n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
}

/** "4:33 PM EST" for live quotes; "12 Nov close" for daily sessions. Never invents a time. */
export function asOfLine(klass: AssetClass, asOf: string | null): string {
  if (!asOf || !Number.isFinite(Date.parse(asOf))) return "time not reported";
  const d = new Date(asOf);
  if (klass === "stock") {
    return `${new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", day: "numeric", month: "short" }).format(d)} close`;
  }
  return new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(d);
}

export function pct(n: number): string {
  const r = Math.round(n * 10) / 10;
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(1)}%`;
}

/** Track record line: sample count first, hit rate only with its gate context. */
export function trackRecord(a: AssetView): TrackRecord {
  const l = a.light;
  const n = l.sampleSize;
  const hit = l.hitRate;
  let line: string;
  if (n == null) line = "Track record not reported by ATLAS.";
  else if (n === 0) line = `No resolved paper calls yet (needs ${MIN_SAMPLE_SIZE}).`;
  else {
    const hitText = hit == null ? "hit rate not reported" : `${Math.round(hit * 100)}% right so far`;
    line = n >= MIN_SAMPLE_SIZE
      ? `${n} resolved paper calls, ${hitText} (gate: ${MIN_SAMPLE_SIZE} calls and ${Math.round(MIN_HIT_RATE * 100)}%).`
      : `${n} of ${MIN_SAMPLE_SIZE} resolved paper calls, ${hitText}. Too few to count yet.`;
  }
  return { colour: l.colour, label: l.label, horizonLabel: l.horizonLabel, sampleSize: n, hitRate: hit, line };
}

function classLabel(k: AssetClass): string {
  return k === "crypto" ? "Crypto" : "Stocks";
}

export function buildMarketDigest(catalog: CatalogView | null, opts: { moversPerClass?: number } = {}): MarketDigestView {
  if (!catalog) return { kind: "not_connected", reason: MARKET_NOT_CONNECTED };
  const per = opts.moversPerClass ?? 3;
  const classes: ClassSummary[] = [];
  const movers: Mover[] = [];
  for (const klass of ["crypto", "stock"] as AssetClass[]) {
    const rows = catalog.assets.filter((a) => a.klass === klass);
    if (!rows.length) continue;
    const counted = rows.filter(fresh);
    const changes = counted.map((a) => a.quote.changePct as number);
    const latest = counted.map((a) => a.quote.asOf).filter((t): t is string => !!t).sort().pop() ?? null;
    classes.push({
      klass,
      label: classLabel(klass),
      total: rows.length,
      counted: counted.length,
      up: changes.filter((c) => c > 0).length,
      down: changes.filter((c) => c < 0).length,
      flat: changes.filter((c) => c === 0).length,
      medianPct: median(changes),
      window: mostCommon(counted.map((a) => a.quote.changeWindow)),
      sourceLabel: rows[0]?.sourceLabel ?? "",
      asOfLine: asOfLine(klass, latest),
    });
    const top = [...counted].sort((a, b) => Math.abs(b.quote.changePct as number) - Math.abs(a.quote.changePct as number)).slice(0, per);
    for (const a of top) {
      movers.push({
        symbol: a.symbol,
        name: a.name,
        klass,
        changePct: a.quote.changePct as number,
        window: a.quote.changeWindow,
        record: trackRecord(a),
        howWeKnow: `${a.sourceLabel} · ${asOfLine(klass, a.quote.asOf)} · paper light: ${a.light.label.toLowerCase()}`,
      });
    }
  }
  if (!classes.some((c) => c.counted > 0)) return { kind: "empty", reason: MARKET_EMPTY };
  const all = catalog.assets;
  const cleared = all.filter((a) => a.light.colour !== "grey").length;
  const best = all.reduce<AssetView | null>((m, a) => ((a.light.sampleSize ?? -1) > (m?.light.sampleSize ?? -1) ? a : m), null);
  const closest = best && best.light.sampleSize != null && best.light.sampleSize > 0 ? { symbol: best.symbol, sampleSize: best.light.sampleSize } : null;
  const needed = stillNeeded(catalog.gate);
  const evidenceLine = cleared === 0
    ? `0 of ${all.length} markets have cleared the evidence gate, so every light is grey.${closest ? ` Closest: ${closest.symbol} with ${closest.sampleSize} of ${MIN_SAMPLE_SIZE} resolved calls.` : ""}`
    : `${cleared} of ${all.length} markets have cleared the evidence gate.`;
  return {
    kind: "ready",
    classes,
    movers,
    evidence: { cleared, total: all.length, closest, stillNeeded: needed, line: evidenceLine },
    stockCitation: catalog.assets.some((a) => a.klass === "stock") ? catalog.stockCitation : null,
    notConnected: NOT_CONNECTED_YET,
    howWeKnow: HOW_WE_KNOW,
  };
}

/** "29 of 32 down over 24h · median −2.6%" */
export function breadthLine(c: ClassSummary): string {
  if (!c.counted) return `No fresh quotes for ${c.label.toLowerCase()} right now.`;
  const lead = c.down >= c.up ? `${c.down} of ${c.counted} down` : `${c.up} of ${c.counted} up`;
  const window = c.window === "24h" ? "over 24h" : c.window;
  return `${lead} ${window}${c.medianPct != null ? ` · median ${pct(c.medianPct)}` : ""}`;
}

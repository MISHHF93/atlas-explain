/**
 * Parsers for the free official data sources (docs/ux/MULTI_ASSET_CATALOG.md §4).
 * Pure functions: text in, Asset records out. They run in the scheduled data job
 * (scripts/data/build-data.ts, Node 24) and in tests. They never invent a value:
 * an unreadable or stale series is dropped, not filled in.
 *
 * Imports use explicit .ts extensions so Node can run this file without a build step.
 */
import { SOURCES, type Asset, type SourceRef } from "../core/asset-schema.ts";

const DAY_MS = 86_400_000;
/** A daily series older than this is treated as discontinued or stale and dropped. */
export const MAX_AGE_DAYS = 10;

/** Date-only values are pinned to 12:00 UTC so they read as the same calendar day in every time zone. */
export function noonUtc(isoDate: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? `${isoDate}T12:00:00Z` : null;
}

function positive(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fresh(isoDate: string, now: number): boolean {
  const t = Date.parse(`${isoDate}T12:00:00Z`);
  return Number.isFinite(t) && now - t <= MAX_AGE_DAYS * DAY_MS && t <= now + DAY_MS;
}

const round = (v: number, digits: number): number => Number(v.toFixed(digits));

function referenceAsset(input: {
  id: string;
  symbol: string;
  name: string;
  klass: "rate" | "forex";
  venue: string;
  currency: string;
  country: string | null;
  value: number;
  previous: number | null;
  date: string;
  source: SourceRef;
  hours: string;
  classData: Asset["classData"];
  relatedTerms?: string[];
}): Asset {
  const isRate = input.klass === "rate";
  const change = input.previous == null ? null : round(input.value - input.previous, isRate ? 2 : 6);
  return {
    id: input.id,
    symbol: input.symbol,
    name: input.name,
    class: input.klass,
    venue: input.venue,
    currency: input.currency,
    country: input.country,
    session: { state: "unknown", hours: input.hours, nextChange: null },
    quote: {
      value: input.value,
      change,
      changePct: isRate || input.previous == null ? null : round(((input.value - input.previous) / input.previous) * 100, 3),
      changeWindow: "vs previous business day",
      asOf: noonUtc(input.date)!,
      mode: "reference",
      source: input.source,
    },
    noQuoteReason: null,
    facts: [],
    status: { state: "none" },
    relatedTerms: input.relatedTerms ?? [],
    classData: input.classData,
  };
}

/* ---------- US Treasury: daily par yield curve (CSV) ---------- */

const TREASURY_TENORS: readonly [column: string, tenor: string, name: string][] = [
  ["1 Mo", "1M", "1-month"],
  ["3 Mo", "3M", "3-month"],
  ["6 Mo", "6M", "6-month"],
  ["1 Yr", "1Y", "1-year"],
  ["2 Yr", "2Y", "2-year"],
  ["5 Yr", "5Y", "5-year"],
  ["10 Yr", "10Y", "10-year"],
  ["20 Yr", "20Y", "20-year"],
  ["30 Yr", "30Y", "30-year"],
];

/** Rows look like `11/13/2026,4.10,...`, newest first. */
export function parseTreasuryCsv(csv: string, now: number = Date.now()): Asset[] {
  const lines = csv.trim().split(/\r?\n/);
  const header = (lines[0] ?? "").split(",").map((h) => h.replace(/"/g, "").trim());
  const rows = lines.slice(1).map((line) => line.split(",")).filter((cells) => /^\d{2}\/\d{2}\/\d{4}$/.test(cells[0] ?? ""));
  const iso = (us: string) => `${us.slice(6, 10)}-${us.slice(0, 2)}-${us.slice(3, 5)}`;
  rows.sort((a, b) => iso(b[0]!).localeCompare(iso(a[0]!)));
  const [latest, previous] = rows;
  if (!latest) return [];
  const date = iso(latest[0]!);
  if (!fresh(date, now)) return [];
  const out: Asset[] = [];
  for (const [column, tenor, label] of TREASURY_TENORS) {
    const i = header.indexOf(column);
    if (i < 1) continue;
    const value = positive(latest[i]);
    if (value == null) continue;
    out.push(referenceAsset({
      id: `rate:US:${tenor}`,
      symbol: `US${tenor}`,
      name: `US ${label} Treasury yield`,
      klass: "rate",
      venue: "US Treasury",
      currency: "%",
      country: "US",
      value,
      previous: previous ? positive(previous[i]) : null,
      date,
      source: SOURCES.us_treasury,
      hours: "Published each US business day, after the market closes",
      classData: { class: "rate", tenor, curve: "US Treasury par yield" },
    }));
  }
  return out;
}

/* ---------- ECB: euro reference rates (XML, last 90 days) ---------- */

/** Pairs shown from ECB data. Crosses not against EUR are derived from two ECB rates and labelled so. */
const ECB_PAIRS: readonly [base: string, quote: string, name: string][] = [
  ["EUR", "USD", "Euro / US dollar"],
  ["EUR", "GBP", "Euro / British pound"],
  ["EUR", "JPY", "Euro / Japanese yen"],
  ["EUR", "CHF", "Euro / Swiss franc"],
  ["GBP", "USD", "British pound / US dollar"],
  ["USD", "JPY", "US dollar / Japanese yen"],
  ["USD", "CHF", "US dollar / Swiss franc"],
  ["AUD", "USD", "Australian dollar / US dollar"],
];

export function parseEcbXml(xml: string, now: number = Date.now()): Asset[] {
  const days = [...xml.matchAll(/<Cube time="(\d{4}-\d{2}-\d{2})">(.*?)<\/Cube>/gs)].map((m) => {
    const rates = new Map<string, number>([["EUR", 1]]);
    for (const r of m[2]!.matchAll(/<Cube currency="([A-Z]{3})" rate="([0-9.]+)"\s*\/>/g)) {
      const v = positive(r[2]);
      if (v != null) rates.set(r[1]!, v);
    }
    return { date: m[1]!, rates };
  });
  days.sort((a, b) => b.date.localeCompare(a.date));
  const [latest, previous] = days;
  if (!latest || !fresh(latest.date, now)) return [];
  const cross = (rates: Map<string, number>, base: string, quote: string): number | null => {
    const b = rates.get(base);
    const q = rates.get(quote);
    return b && q ? q / b : null;
  };
  const out: Asset[] = [];
  for (const [base, quote, name] of ECB_PAIRS) {
    const raw = cross(latest.rates, base, quote);
    if (raw == null) continue;
    const digits = raw >= 20 ? 3 : 5;
    const prev = previous ? cross(previous.rates, base, quote) : null;
    out.push(referenceAsset({
      id: `fx:${base}${quote}`,
      symbol: `${base}/${quote}`,
      name,
      klass: "forex",
      venue: "ECB",
      currency: quote,
      country: null,
      value: round(raw, digits),
      previous: prev == null ? null : round(prev, digits),
      date: latest.date,
      source: SOURCES.ecb,
      hours: "Reference rate published each ECB business day, around 16:00 CET",
      classData: { class: "forex", base, quote, derived: base !== "EUR" },
      relatedTerms: ["spread"],
    }));
  }
  return out;
}

/* ---------- Bank of Canada: Valet API (JSON) ---------- */

interface ValetBody {
  observations?: Array<Record<string, unknown> & { d?: string }>;
}

/** Latest two fresh observations for one series. Discontinued series (old dates) yield nothing. */
function valetSeries(body: ValetBody, key: string, now: number): { date: string; value: number; previous: number | null } | null {
  const points = (body.observations ?? [])
    .map((o) => ({ date: typeof o.d === "string" ? o.d : "", value: positive((o[key] as { v?: unknown } | undefined)?.v) }))
    .filter((p): p is { date: string; value: number } => p.value != null && /^\d{4}-\d{2}-\d{2}$/.test(p.date))
    .sort((a, b) => b.date.localeCompare(a.date));
  const [latest, previous] = points;
  if (!latest || !fresh(latest.date, now)) return null;
  return { date: latest.date, value: latest.value, previous: previous?.value ?? null };
}

const BOC_FX: readonly [code: string, name: string][] = [
  ["USD", "US dollar / Canadian dollar"],
  ["EUR", "Euro / Canadian dollar"],
  ["GBP", "British pound / Canadian dollar"],
  ["JPY", "Japanese yen / Canadian dollar"],
  ["CNY", "Chinese yuan / Canadian dollar"],
  ["MXN", "Mexican peso / Canadian dollar"],
];

/** Series FX{CUR}CAD are Canadian dollars per one unit of the foreign currency: the CUR/CAD quote. */
export function parseBocFx(json: string, now: number = Date.now()): Asset[] {
  const body = JSON.parse(json) as ValetBody;
  const out: Asset[] = [];
  for (const [code, name] of BOC_FX) {
    const s = valetSeries(body, `FX${code}CAD`, now);
    if (!s) continue;
    out.push(referenceAsset({
      id: `fx:${code}CAD`,
      symbol: `${code}/CAD`,
      name,
      klass: "forex",
      venue: "Bank of Canada",
      currency: "CAD",
      country: "CA",
      value: s.value,
      previous: s.previous,
      date: s.date,
      source: SOURCES.boc,
      hours: "Indicative rate published each Canadian business day by 16:30 ET",
      classData: { class: "forex", base: code, quote: "CAD", derived: false },
      relatedTerms: ["spread"],
    }));
  }
  return out;
}

const BOC_BONDS: readonly [series: string, tenor: string, label: string][] = [
  ["BD.CDN.2YR.DQ.YLD", "2Y", "2-year"],
  ["BD.CDN.3YR.DQ.YLD", "3Y", "3-year"],
  ["BD.CDN.5YR.DQ.YLD", "5Y", "5-year"],
  ["BD.CDN.7YR.DQ.YLD", "7Y", "7-year"],
  ["BD.CDN.10YR.DQ.YLD", "10Y", "10-year"],
  ["BD.CDN.LONG.DQ.YLD", "LONG", "long-term"],
];

export function parseBocBonds(json: string, now: number = Date.now()): Asset[] {
  const body = JSON.parse(json) as ValetBody;
  const out: Asset[] = [];
  for (const [series, tenor, label] of BOC_BONDS) {
    const s = valetSeries(body, series, now);
    if (!s) continue;
    out.push(referenceAsset({
      id: `rate:CA:${tenor}`,
      symbol: `CA${tenor}`,
      name: `Canada ${label} benchmark bond yield`,
      klass: "rate",
      venue: "Bank of Canada",
      currency: "%",
      country: "CA",
      value: s.value,
      previous: s.previous,
      date: s.date,
      source: SOURCES.boc,
      hours: "Published each Canadian business day",
      classData: { class: "rate", tenor, curve: "Government of Canada benchmark" },
    }));
  }
  return out;
}

/* ---------- EIA: daily energy spot prices (API v2, values are strings) ---------- */

export const EIA_SERIES: readonly { seriesId: string; id: string; symbol: string; name: string; unit: string; benchmark: string }[] = [
  { seriesId: "PET.RWTC.D", id: "commodity:WTI", symbol: "WTI", name: "WTI crude oil", unit: "barrel", benchmark: "WTI, Cushing, Oklahoma spot" },
  { seriesId: "PET.RBRTE.D", id: "commodity:BRENT", symbol: "BRENT", name: "Brent crude oil", unit: "barrel", benchmark: "Brent, Europe spot" },
  { seriesId: "NG.RNGWHHD.D", id: "commodity:HENRYHUB", symbol: "NATGAS", name: "Natural gas (Henry Hub)", unit: "million BTU", benchmark: "Henry Hub, Louisiana spot" },
];

/** One EIA series response: rows of { period: "YYYY-MM-DD", value: "71.4" }, newest first or not. */
export function parseEiaSeries(json: string, meta: (typeof EIA_SERIES)[number], now: number = Date.now()): Asset | null {
  const body = JSON.parse(json) as { response?: { data?: Array<Record<string, unknown>> } };
  const rows = (body.response?.data ?? [])
    .map((r) => ({ date: typeof r.period === "string" ? r.period : "", value: positive(r.value) }))
    .filter((r): r is { date: string; value: number } => r.value != null && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
    .sort((a, b) => b.date.localeCompare(a.date));
  const [latest, previous] = rows;
  // EIA spot prices are published weekly, so allow a little longer than other daily series.
  if (!latest || now - Date.parse(`${latest.date}T12:00:00Z`) > 21 * DAY_MS) return null;
  const lagDays = Math.max(0, Math.round((now - Date.parse(`${latest.date}T12:00:00Z`)) / DAY_MS));
  return {
    id: meta.id,
    symbol: meta.symbol,
    name: meta.name,
    class: "commodity",
    venue: "EIA",
    currency: "USD",
    country: "US",
    session: { state: "unknown", hours: "Daily spot values, published weekly by the EIA", nextChange: null },
    quote: {
      value: latest.value,
      change: previous ? round(latest.value - previous.value, 2) : null,
      changePct: previous ? round(((latest.value - previous.value) / previous.value) * 100, 2) : null,
      changeWindow: "vs previous trading day",
      asOf: noonUtc(latest.date)!,
      mode: "daily",
      source: SOURCES.eia,
    },
    noQuoteReason: null,
    facts: [],
    status: { state: "none" },
    relatedTerms: ["volume"],
    classData: { class: "commodity", unit: meta.unit, benchmark: meta.benchmark, publishLagDays: lagDays },
  };
}

/* ---------- the published file ---------- */

export const MARKET_SCHEMA = "atlas-explain-market-v1";

export interface MarketFile {
  schema: typeof MARKET_SCHEMA;
  generatedAt: string;
  sources: Record<string, { ok: boolean; count: number; note: string }>;
  assets: Asset[];
}

/**
 * What money from one year buys in another: the standard calculation used by statistics agencies and the
 * Minneapolis Fed, amount × (price index in the later year ÷ price index in the earlier year), on each country's
 * official consumer price index as yearly averages (src/data/price-levels.json, built by
 * scripts/data/build-price-levels.ts). Describes the past only; never a forecast.
 */
import levels from "../data/price-levels.json";

export type PriceCountry = "US" | "CA" | "UK" | "EA";

interface Series {
  name: string;
  currency: string;
  source: string;
  sourceUrl: string;
  licence: string;
  base: string;
  values: Record<string, number>;
}
const SERIES = levels.series as Record<PriceCountry, Series>;

const SYMBOL: Record<PriceCountry, string> = { US: "$", CA: "C$", UK: "£", EA: "€" };
const PLACE: Record<PriceCountry, string> = { US: "the US", CA: "Canada", UK: "the UK", EA: "the euro area" };

/** "us", "Canada", "britain", "eurozone"… → the country code; null when it isn't one of the four. */
export function priceCountry(v: unknown): PriceCountry | null {
  const s = String(v ?? "").trim().toLowerCase().replace(/[^a-z ]/g, "");
  if (["us", "usa", "united states", "america", "usd"].includes(s)) return "US";
  if (["ca", "can", "canada", "cad"].includes(s)) return "CA";
  if (["uk", "gb", "gbr", "united kingdom", "britain", "great britain", "england", "gbp"].includes(s)) return "UK";
  if (["ea", "eu", "euro", "euro area", "eurozone", "europe", "eur"].includes(s)) return "EA";
  return null;
}

/** The years each country covers, first and last full year. */
export function coverage(country: PriceCountry): { from: number; to: number } {
  const years = Object.keys(SERIES[country].values).map(Number);
  return { from: Math.min(...years), to: Math.max(...years) };
}

export interface InflationResult {
  country: PriceCountry;
  amount: number;
  fromYear: number;
  toYear: number;
  /** What `amount` in fromYear buys about the same as, in toYear's money. */
  value: number;
  /** How much prices changed from fromYear to toYear, in percent. */
  changePct: number;
  /** The average yearly change over the period, in percent. */
  yearlyPct: number;
  /** The amount's equivalent in every year between, for a chart. */
  points: { year: number; value: number }[];
  lines: string[];
  source: { name: string; series: string; url: string; licence: string };
}

const money = (c: PriceCountry, v: number) =>
  `${v < 0 ? "−" : ""}${SYMBOL[c]}${Math.abs(v) >= 100 ? Math.round(Math.abs(v)).toLocaleString("en-US") : Math.abs(v).toFixed(2)}`;
const pct = (v: number) => `${Number(Math.abs(v).toFixed(1))}%`;

export function inflationCalculator(input: { country: PriceCountry; amount: number; fromYear: number; toYear?: number }): InflationResult | { error: string } {
  const c = input.country;
  const s = SERIES[c];
  if (!s) return { error: "Choose the US, Canada, the UK or the euro area." };
  const span = coverage(c);
  const amount = input.amount;
  const from = Math.trunc(input.fromYear);
  const to = Math.trunc(input.toYear ?? span.to);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) return { error: "Give an amount above zero." };
  for (const y of [from, to]) {
    if (!Number.isFinite(y) || y < span.from || y > span.to) {
      const why = c === "UK" ? " (the UK's consumer prices index starts in 1988)" : c === "EA" ? " (the euro area's index starts in 1997)" : "";
      return { error: `For ${PLACE[c]}, choose years from ${span.from} to ${span.to}, the latest full year${why}.` };
    }
  }
  if (from === to) return { error: "Choose two different years." };
  const a = s.values[String(from)]!;
  const b = s.values[String(to)]!;
  const value = Math.round(amount * (b / a) * 100) / 100;
  const changePct = Math.round((b / a - 1) * 1000) / 10;
  const years = Math.abs(to - from);
  const yearlyPct = Math.round((Math.pow(Math.max(a, b) / Math.min(a, b), 1 / years) - 1) * 1000) / 10;
  const step = from < to ? 1 : -1;
  const points: InflationResult["points"] = [];
  for (let y = from; y !== to + step; y += step) {
    const v = s.values[String(y)];
    if (v != null) points.push({ year: y, value: Math.round(amount * (v / a) * 100) / 100 });
  }
  // Described in date order, whichever way the question goes.
  const early = s.values[String(Math.min(from, to))]!;
  const late = s.values[String(Math.max(from, to))]!;
  const chronoPct = (late / early - 1) * 100;
  const lines = [
    from < to
      ? `In ${PLACE[c]}, ${money(c, amount)} in ${from} buys about what ${money(c, value)} buys in ${to}.`
      : `In ${PLACE[c]}, ${money(c, amount)} in ${from} buys about what ${money(c, value)} bought in ${to}.`,
    `Prices ${chronoPct >= 0 ? "rose" : "fell"} ${pct(chronoPct)} between ${Math.min(from, to)} and ${Math.max(from, to)}, about ${pct(yearlyPct)} a year on average.`,
    chronoPct >= 0
      ? `Put the other way: money kept as cash from ${Math.min(from, to)} to ${Math.max(from, to)} lost about ${pct((1 - early / late) * 100)} of its buying power.`
      : `Put the other way: money kept as cash from ${Math.min(from, to)} to ${Math.max(from, to)} gained about ${pct((early / late - 1) * 100)} in buying power.`,
    `From ${s.name}, yearly averages (${s.source}). A single month or a person's own spending can differ; this describes the past and is not a forecast.`,
  ];
  if (c === "EA") lines.push("The euro area's index covers the countries in the euro area each year, so its make-up changes as countries join.");
  return { country: c, amount, fromYear: from, toYear: to, value, changePct, yearlyPct, points, lines, source: { name: s.source, series: s.name, url: s.sourceUrl, licence: s.licence } };
}

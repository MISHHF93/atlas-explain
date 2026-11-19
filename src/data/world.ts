/**
 * Countries compared, on ATLAS Explain's own data site (data/v1/world.json): GDP growth, inflation,
 * unemployment and GDP per person for the G20, from the World Bank's World Development Indicators
 * through its keyless Data360 API (CC BY 4.0). Actual published values only: a projection or forecast
 * row is never kept, and a missing year stays missing. Pure and dependency-free (parsers only), so it
 * runs in the Worker, on a computer and in tests.
 */

export const WORLD_SCHEMA = "atlas-explain-world-v1";

export type WorldIndicatorId = "gdp_growth" | "inflation" | "unemployment" | "gdp_per_capita";

export const WORLD_INDICATORS: readonly { id: WorldIndicatorId; code: string; name: string; unit: "%" | "USD"; about: string }[] = [
  { id: "gdp_growth", code: "WB_WDI_NY_GDP_MKTP_KD_ZG", name: "GDP growth", unit: "%", about: "Real GDP growth over the year, after removing inflation." },
  { id: "inflation", code: "WB_WDI_FP_CPI_TOTL_ZG", name: "Inflation", unit: "%", about: "Consumer prices, change over the year." },
  { id: "unemployment", code: "WB_WDI_SL_UEM_TOTL_ZS", name: "Unemployment", unit: "%", about: "Share of the labour force without work and looking for it (ILO modelled estimate)." },
  { id: "gdp_per_capita", code: "WB_WDI_NY_GDP_PCAP_CD", name: "GDP per person", unit: "USD", about: "GDP divided by population, in current US dollars." },
];

/** The G20: 19 countries and the European Union. */
export const WORLD_COUNTRIES: readonly { code: string; name: string }[] = [
  { code: "USA", name: "United States" }, { code: "CAN", name: "Canada" }, { code: "MEX", name: "Mexico" }, { code: "BRA", name: "Brazil" },
  { code: "ARG", name: "Argentina" }, { code: "GBR", name: "United Kingdom" }, { code: "DEU", name: "Germany" }, { code: "FRA", name: "France" },
  { code: "ITA", name: "Italy" }, { code: "EUU", name: "European Union" }, { code: "TUR", name: "Türkiye" }, { code: "SAU", name: "Saudi Arabia" },
  { code: "ZAF", name: "South Africa" }, { code: "IND", name: "India" }, { code: "CHN", name: "China" }, { code: "JPN", name: "Japan" },
  { code: "KOR", name: "South Korea" }, { code: "IDN", name: "Indonesia" }, { code: "AUS", name: "Australia" }, { code: "RUS", name: "Russia" },
];

export const WORLD_SOURCE = {
  name: "World Bank, World Development Indicators",
  url: "https://data360.worldbank.org/en/dataset/WB_WDI",
  licence: "CC BY 4.0",
} as const;

/** The Data360 request for one indicator, all G20 members, the last `years` years. */
export function worldUrl(code: string, toYear: number, years = 9): string {
  const areas = WORLD_COUNTRIES.map((c) => c.code).join(",");
  return `https://data360api.worldbank.org/data360/data?DATABASE_ID=WB_WDI&INDICATOR=${code}&REF_AREA=${areas}&timePeriodFrom=${toYear - years}&timePeriodTo=${toYear}`;
}

export interface WorldValue {
  year: string;
  value: number;
}
export interface WorldRow {
  country: string;
  /** Oldest first; actual values only. */
  series: WorldValue[];
}
export interface WorldIndicatorData {
  id: WorldIndicatorId;
  capturedAt: string;
  rows: WorldRow[];
}
export interface WorldFile {
  schema: typeof WORLD_SCHEMA;
  generatedAt: string;
  source: typeof WORLD_SOURCE;
  indicators: WorldIndicatorData[];
  /** OECD monthly share-price indices (2015 = 100), when captured. */
  sharePrices?: SharePrices;
}

/* ---------- OECD share prices: a broad, official measure of each stock market, monthly ---------- */

/**
 * The OECD's terms (oecd.org/en/about/terms-conditions, "Data", read 19 Nov 2026): Data may be downloaded,
 * copied, shared and distributed "for any purpose, even for commercial use", with credit to the OECD in the
 * form OECD (year), (dataset name), (data source) DOI or URL. The dataset lists no third-party restriction.
 */
export const OECD_SHARES_SOURCE = {
  name: "OECD, Financial market (Main Economic Indicators): share prices",
  url: "https://data-explorer.oecd.org/",
  licence: "OECD terms: any use, including commercial, with credit to the OECD",
} as const;

export interface SharePrices {
  capturedAt: string;
  /** Index, 2015 = 100, monthly averages; oldest first. */
  rows: { country: string; series: { t: string; v: number }[] }[];
}

/** The OECD request: every G20 member it covers, monthly, from `fromMonth` (YYYY-MM). */
export function oecdSharesUrl(fromMonth: string): string {
  const areas = WORLD_COUNTRIES.map((c) => c.code).filter((c) => c !== "EUU").join("+");
  return `https://sdmx.oecd.org/public/rest/data/OECD.SDD.STES,DSD_STES@DF_FINMARK,4.0/${areas}.M.SHARE......?startPeriod=${fromMonth}&format=csv`;
}

/** The OECD's CSV → one monthly series per country, index 2015 = 100 only. */
export function parseOecdShares(csv: string, capturedAt: string): SharePrices | null {
  const lines = csv.trim().split(/\r?\n/);
  const head = lines[0]?.split(",") ?? [];
  const col = (name: string) => head.indexOf(name);
  const [ia, it, iv, iu, ib] = [col("REF_AREA"), col("TIME_PERIOD"), col("OBS_VALUE"), col("UNIT_MEASURE"), col("BASE_PER")];
  if (ia < 0 || it < 0 || iv < 0) return null;
  const by = new Map<string, Map<string, number>>();
  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const country = c[ia]!, t = c[it]!, v = Number(c[iv]);
    if (!KNOWN.has(country) || !/^\d{4}-\d{2}$/.test(t) || !Number.isFinite(v) || v <= 0) continue;
    if (iu >= 0 && c[iu] !== "IX") continue;
    if (ib >= 0 && c[ib] && c[ib] !== "2015") continue;
    if (!by.has(country)) by.set(country, new Map());
    by.get(country)!.set(t, v);
  }
  const rows = WORLD_COUNTRIES.filter((w) => by.has(w.code)).map((w) => ({
    country: w.code,
    series: [...by.get(w.code)!.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([t, v]) => ({ t, v: Math.round(v * 100) / 100 })),
  })).filter((r) => r.series.length >= 2);
  return rows.length ? { capturedAt, rows } : null;
}

const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const KNOWN = new Set(WORLD_COUNTRIES.map((c) => c.code));

/** One Data360 answer as a series per country; null if it holds nothing usable. Forecast rows (status F) are dropped. */
export function parseData360(body: unknown, id: WorldIndicatorId, capturedAt: string): WorldIndicatorData | null {
  if (!isRec(body) || !Array.isArray(body.value)) return null;
  const by = new Map<string, Map<string, number>>();
  for (const v of body.value) {
    if (!isRec(v)) continue;
    const area = String(v.REF_AREA ?? "");
    const year = String(v.TIME_PERIOD ?? "");
    const value = Number(v.OBS_VALUE);
    if (!KNOWN.has(area) || !/^\d{4}$/.test(year) || v.OBS_VALUE == null || v.OBS_VALUE === "" || !Number.isFinite(value) || v.OBS_STATUS === "F") continue;
    if (!by.has(area)) by.set(area, new Map());
    by.get(area)!.set(year, value);
  }
  const rows = WORLD_COUNTRIES.filter((c) => by.has(c.code)).map((c) => ({
    country: c.code,
    series: [...by.get(c.code)!].sort(([a], [b]) => a.localeCompare(b)).map(([year, value]) => ({ year, value: Number(value.toFixed(value >= 1000 ? 0 : 2)) })),
  }));
  return rows.length ? { id, capturedAt, rows } : null;
}

/** A stored world.json, checked; null if it isn't one. */
export function readWorldFile(body: unknown): WorldFile | null {
  if (!isRec(body) || body.schema !== WORLD_SCHEMA || !Array.isArray(body.indicators)) return null;
  const ids = new Set(WORLD_INDICATORS.map((i) => i.id));
  const indicators = body.indicators.filter(
    (i): i is WorldIndicatorData => isRec(i) && ids.has(i.id as WorldIndicatorId) && typeof i.capturedAt === "string" && Array.isArray(i.rows) &&
      i.rows.every((r) => isRec(r) && KNOWN.has(String(r.country)) && Array.isArray(r.series) && r.series.every((p) => isRec(p) && /^\d{4}$/.test(String(p.year)) && Number.isFinite(p.value))),
  );
  const sp = isRec(body.sharePrices) && typeof body.sharePrices.capturedAt === "string" && Array.isArray(body.sharePrices.rows) ? body.sharePrices : null;
  const shareRows = sp ? (sp.rows as unknown[]).filter((r): r is SharePrices["rows"][number] => isRec(r) && KNOWN.has(String(r.country)) && Array.isArray(r.series) && r.series.every((p) => isRec(p) && /^\d{4}-\d{2}$/.test(String(p.t)) && Number.isFinite(p.v))) : [];
  const sharePrices = sp && shareRows.length ? { capturedAt: String(sp.capturedAt), rows: shareRows } : undefined;
  return indicators.length ? { schema: WORLD_SCHEMA, generatedAt: String(body.generatedAt), source: WORLD_SOURCE, indicators, ...(sharePrices ? { sharePrices } : {}) } : null;
}

/** The latest actual value of one indicator for one country, or null. */
export function latest(file: WorldFile, id: WorldIndicatorId, country: string): WorldValue | null {
  const s = file.indicators.find((i) => i.id === id)?.rows.find((r) => r.country === country)?.series;
  return s?.length ? s[s.length - 1]! : null;
}

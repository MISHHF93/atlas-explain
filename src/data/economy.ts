/**
 * The economy on ATLAS Explain's own data site (data/v1/economy.json): headline indicators from
 * free, keyless official sources, and the central-bank calendar.
 *   - US inflation (CPI, year over year) and unemployment: Bureau of Labor Statistics (api.bls.gov v1)
 *   - Effective federal funds rate (with the Fed's target range) and SOFR: Federal Reserve Bank of New York
 *   - Euro-area inflation (HICP, year over year): European Central Bank data portal
 *   - Canada's policy rate (target for the overnight rate): Bank of Canada Valet
 *   - US total public debt outstanding: US Treasury Fiscal Data
 *   - Rate-decision dates: Federal Reserve (FOMC), ECB Governing Council, Bank of Canada
 *
 * Every value keeps its source, its period and when it was published; a source that fails keeps
 * its last good values, and nothing is ever filled in. Pure and dependency-free (parsers only), so
 * it runs in the Worker, on a computer and in tests. Describes published figures; never a forecast.
 */

export const ECONOMY_SCHEMA = "atlas-explain-economy-v1";

export type IndicatorId = "us_cpi" | "us_unemployment" | "us_fed_funds" | "us_sofr" | "euro_hicp" | "ca_policy_rate" | "us_debt";

export interface Point {
  /** The period or day the value is for (YYYY-MM or YYYY-MM-DD). */
  t: string;
  v: number;
}

export interface Indicator {
  id: IndicatorId;
  name: string;
  /** "%" or "USD". */
  unit: "%" | "USD";
  /** The latest value, and the period it is for. */
  value: number;
  period: string;
  /** Change from the previous point, in percentage points for "%" and percent for "USD"; null if unknown. */
  change: number | null;
  changeWindow: string;
  /** Extra context in plain words, for example the Fed's target range. */
  note: string | null;
  /** Oldest first, up to 13 monthly or 60 daily points. */
  series: Point[];
  source: string;
  sourceUrl: string;
  /** When ATLAS Explain read it (ISO). */
  capturedAt: string;
}

export interface CalendarEvent {
  /** YYYY-MM-DD: the decision day (the last day of a two-day meeting). */
  date: string;
  /** The first day, for two-day meetings. */
  startDate: string | null;
  institution: "Federal Reserve" | "European Central Bank" | "Bank of Canada";
  title: string;
  /** What happens, in plain words. */
  about: string;
  /** The Fed marks meetings with a Summary of Economic Projections. */
  withProjections: boolean;
  sourceUrl: string;
}

export interface EconomyFile {
  schema: typeof ECONOMY_SCHEMA;
  generatedAt: string;
  indicators: Indicator[];
  calendar: { capturedAt: string; events: CalendarEvent[] };
}

export const ECONOMY_SOURCES = {
  blsCpi: "https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0",
  blsUnemployment: "https://api.bls.gov/publicAPI/v1/timeseries/data/LNS14000000",
  effr: "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/60.json",
  sofr: "https://markets.newyorkfed.org/api/rates/secured/sofr/last/60.json",
  // The ECB moved euro-area HICP from "ICP" to the new "HICP" dataset in Feb 2026 (method change).
  hicp: "https://data-api.ecb.europa.eu/service/data/HICP/M.U2.N.000000.4D0.ANR?lastNObservations=13&format=jsondata",
  bocPolicy: "https://www.bankofcanada.ca/valet/observations/V39079/json?recent=260",
  debt: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/debt_to_penny?sort=-record_date&page[size]=60&fields=record_date,tot_pub_debt_out_amt",
  fomc: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  ecbCalendar: "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html",
  bocEvents: "https://www.bankofcanada.ca/press/upcoming-events/",
} as const;

/** The page each indicator credits (human-readable, not the API). */
const CREDIT: Record<IndicatorId, { source: string; url: string }> = {
  us_cpi: { source: "U.S. Bureau of Labor Statistics", url: "https://www.bls.gov/cpi/" },
  us_unemployment: { source: "U.S. Bureau of Labor Statistics", url: "https://www.bls.gov/cps/" },
  us_fed_funds: { source: "Federal Reserve Bank of New York", url: "https://www.newyorkfed.org/markets/reference-rates/effr" },
  us_sofr: { source: "Federal Reserve Bank of New York", url: "https://www.newyorkfed.org/markets/reference-rates/sofr" },
  euro_hicp: { source: "European Central Bank", url: "https://data.ecb.europa.eu/data/datasets/HICP" },
  ca_policy_rate: { source: "Bank of Canada", url: "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/" },
  us_debt: { source: "U.S. Department of the Treasury, Fiscal Data", url: "https://fiscaldata.treasury.gov/datasets/debt-to-the-penny/" },
};

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};
const r2 = (v: number) => Math.round(v * 100) / 100;
const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}$/.test(s);

function indicator(id: IndicatorId, name: string, unit: Indicator["unit"], series: Point[], changeWindow: string, capturedAt: string, note: string | null = null): Indicator | null {
  if (series.length < 2) return null;
  const last = series[series.length - 1]!;
  const prev = series[series.length - 2]!;
  const change = unit === "%" ? r2(last.v - prev.v) : prev.v ? r2(((last.v - prev.v) / prev.v) * 100) : null;
  return { id, name, unit, value: last.v, period: last.t, change, changeWindow, note, series, source: CREDIT[id].source, sourceUrl: CREDIT[id].url, capturedAt };
}

/** BLS v1 monthly series (newest first) → [YYYY-MM, value], oldest first. Skips annual averages (M13). */
function blsMonths(body: unknown): Point[] {
  const series = isRec(body) && isRec(body.Results) && Array.isArray(body.Results.series) ? body.Results.series[0] : null;
  const data = isRec(series) && Array.isArray(series.data) ? series.data : [];
  if (!isRec(body) || body.status !== "REQUEST_SUCCEEDED") return [];
  return data
    .flatMap((d): Point[] => {
      if (!isRec(d) || typeof d.year !== "string" || typeof d.period !== "string" || !/^M(0[1-9]|1[0-2])$/.test(d.period)) return [];
      const v = num(d.value);
      return v == null ? [] : [{ t: `${d.year}-${d.period.slice(1)}`, v }];
    })
    .sort((a, b) => a.t.localeCompare(b.t));
}

/** US CPI-U (not seasonally adjusted) → inflation over 12 months, for the last 13 months. */
export function parseBlsCpi(body: unknown, capturedAt: string): Indicator | null {
  const months = blsMonths(body);
  const byMonth = new Map(months.map((p) => [p.t, p.v]));
  const yoy = months.flatMap((p): Point[] => {
    const [y, m] = p.t.split("-");
    const before = byMonth.get(`${Number(y) - 1}-${m}`);
    return before ? [{ t: p.t, v: r2(((p.v - before) / before) * 100) }] : [];
  });
  return indicator("us_cpi", "US inflation (CPI, over 12 months)", "%", yoy.slice(-13), "vs the month before", capturedAt);
}

/** US unemployment rate (seasonally adjusted), the last 13 months. */
export function parseBlsUnemployment(body: unknown, capturedAt: string): Indicator | null {
  return indicator("us_unemployment", "US unemployment rate", "%", blsMonths(body).slice(-13), "vs the month before", capturedAt);
}

/** New York Fed reference rates (newest first) → daily points, oldest first, and the latest row. */
function nyFed(body: unknown): { points: Point[]; latest: Rec | null } {
  const rows = isRec(body) && Array.isArray(body.refRates) ? body.refRates.filter(isRec) : [];
  const points = rows
    .flatMap((r): Point[] => {
      const v = num(r.percentRate);
      return isDay(r.effectiveDate) && v != null ? [{ t: r.effectiveDate, v }] : [];
    })
    .sort((a, b) => a.t.localeCompare(b.t));
  const latest = rows.find((r) => isDay(r.effectiveDate) && r.effectiveDate === points[points.length - 1]?.t) ?? null;
  return { points, latest };
}

export function parseEffr(body: unknown, capturedAt: string): Indicator | null {
  const { points, latest } = nyFed(body);
  const from = latest ? num(latest.targetRateFrom) : null;
  const to = latest ? num(latest.targetRateTo) : null;
  const note = from != null && to != null ? `The Federal Reserve's target range is ${from.toFixed(2)}% to ${to.toFixed(2)}%.` : null;
  return indicator("us_fed_funds", "Effective federal funds rate", "%", points, "vs the business day before", capturedAt, note);
}

export function parseSofr(body: unknown, capturedAt: string): Indicator | null {
  return indicator("us_sofr", "SOFR (secured overnight financing rate)", "%", nyFed(body).points, "vs the business day before", capturedAt);
}

/** ECB data portal (SDMX-JSON) monthly series → points, oldest first. */
export function parseEcbHicp(body: unknown, capturedAt: string): Indicator | null {
  if (!isRec(body) || !Array.isArray(body.dataSets) || !isRec(body.structure)) return null;
  const set = body.dataSets[0];
  const series = isRec(set) && isRec(set.series) ? Object.values(set.series)[0] : null;
  const obs = isRec(series) && isRec(series.observations) ? series.observations : null;
  const dims = isRec(body.structure.dimensions) && Array.isArray(body.structure.dimensions.observation) ? body.structure.dimensions.observation[0] : null;
  const periods = isRec(dims) && Array.isArray(dims.values) ? dims.values : [];
  if (!obs) return null;
  const points = Object.entries(obs)
    .flatMap(([i, row]): Point[] => {
      const p = periods[Number(i)];
      const v = Array.isArray(row) ? num(row[0]) : null;
      return isRec(p) && isMonth(p.id) && v != null ? [{ t: p.id, v }] : [];
    })
    .sort((a, b) => a.t.localeCompare(b.t));
  return indicator("euro_hicp", "Euro-area inflation (HICP, over 12 months)", "%", points.slice(-13), "vs the month before", capturedAt);
}

/** Bank of Canada Valet daily observations → the policy rate, one point per change plus the latest day. */
export function parseBocPolicy(body: unknown, capturedAt: string): Indicator | null {
  const rows = isRec(body) && Array.isArray(body.observations) ? body.observations.filter(isRec) : [];
  const daily = rows
    .flatMap((r): Point[] => {
      const cell = r.V39079;
      const v = isRec(cell) ? num(cell.v) : null;
      return isDay(r.d) && v != null ? [{ t: r.d, v }] : [];
    })
    .sort((a, b) => a.t.localeCompare(b.t));
  // The rate moves only on decision days: keep the first day of each level, and the latest day.
  const changes = daily.filter((p, i) => i === 0 || p.v !== daily[i - 1]!.v);
  const last = daily[daily.length - 1];
  const steps = last && changes[changes.length - 1]?.t !== last.t ? [...changes, last] : changes;
  const ind = indicator("ca_policy_rate", "Bank of Canada policy rate", "%", steps, "since the last change", capturedAt);
  if (!ind) return null;
  const current = changes[changes.length - 1]!;
  const before = changes[changes.length - 2];
  ind.change = before ? r2(current.v - before.v) : null;
  ind.note = before ? `Last changed on ${current.t}, from ${before.v.toFixed(2)}%.` : `Unchanged since at least ${current.t}.`;
  return ind;
}

/** US Treasury Debt to the Penny (newest first) → total public debt outstanding, daily. */
export function parseTreasuryDebt(body: unknown, capturedAt: string): Indicator | null {
  const rows = isRec(body) && Array.isArray(body.data) ? body.data.filter(isRec) : [];
  const points = rows
    .flatMap((r): Point[] => {
      const v = num(r.tot_pub_debt_out_amt);
      return isDay(r.record_date) && v != null ? [{ t: r.record_date, v: Math.round(v) }] : [];
    })
    .sort((a, b) => a.t.localeCompare(b.t));
  return indicator("us_debt", "US total public debt outstanding", "USD", points, "vs the business day before", capturedAt);
}

/* ---------- the central-bank calendar ---------- */

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
const strip = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();

/**
 * Federal Reserve FOMC calendar page: "2026 FOMC Meetings", then month and day-range pairs such as
 * "January" "27-28", "April/May" "30-1", "March" "17-18*" (* = with a Summary of Economic Projections).
 */
export function parseFomcCalendar(html: string): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  for (const panel of html.split(/<h4>/i).slice(1)) {
    const year = Number(/(\d{4}) FOMC Meetings/.exec(panel)?.[1]);
    if (!year) continue;
    const re = /fomc-meeting__month[^>]*>([\s\S]*?)<\/div>[\s\S]*?fomc-meeting__date[^>]*>([\s\S]*?)<\/div>/gi;
    for (const m of panel.matchAll(re)) {
      const month = strip(m[1]!).toLowerCase();
      const dateText = strip(m[2]!);
      const dm = /^(\d{1,2})(?:-(\d{1,2}))?(\*)?/.exec(dateText);
      const names = month.split("/").map((n) => MONTHS.indexOf(n.trim()) + 1);
      if (!dm || names.some((n) => n < 1) || /notation vote|unscheduled/i.test(dateText)) continue;
      const d1 = Number(dm[1]);
      const d2 = dm[2] ? Number(dm[2]) : d1;
      const startMonth = names[0]!;
      const endMonth = names[names.length - 1]!;
      out.push({
        date: iso(endMonth < startMonth ? year + 1 : year, endMonth, d2),
        startDate: dm[2] ? iso(year, startMonth, d1) : null,
        institution: "Federal Reserve",
        title: "FOMC meeting and rate decision",
        about: "The Federal Open Market Committee sets the target range for the federal funds rate; its statement comes out at 2 pm New York time on the last day.",
        withProjections: dm[3] === "*",
        sourceUrl: ECONOMY_SOURCES.fomc,
      });
    }
  }
  return out;
}

/** ECB "meetings of the Governing Council" page: <dt>DD/MM/YYYY</dt><dd>…monetary policy meeting… (Day 2)…</dd>. */
export function parseEcbCalendar(html: string): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const rows = [...html.matchAll(/<dt>\s*(\d{2})\/(\d{2})\/(\d{4})\s*<\/dt>\s*<dd>([\s\S]*?)<\/dd>/gi)];
  rows.forEach((m, i) => {
    const text = strip(m[4]!);
    if (!/(?<!non-)monetary policy meeting/i.test(text) || /Day 1/i.test(text)) return;
    const date = iso(Number(m[3]), Number(m[2]), Number(m[1]));
    const prev = rows[i - 1];
    const startDate = /Day 2/i.test(text) && prev && /Day 1/i.test(strip(prev[4]!)) ? iso(Number(prev[3]), Number(prev[2]), Number(prev[1])) : null;
    out.push({
      date,
      startDate,
      institution: "European Central Bank",
      title: "ECB monetary policy meeting and rate decision",
      about: "The ECB's Governing Council sets the euro area's key interest rates, then explains the decision at a press conference.",
      withProjections: false,
      sourceUrl: ECONOMY_SOURCES.ecbCalendar,
    });
  });
  return out;
}

/** Bank of Canada "upcoming events": each Interest Rate Announcement with its date. */
export function parseBocEvents(html: string): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const re = /media-date[^>]*>\s*([A-Z][a-z]+) (\d{1,2}), (\d{4})\s*<[\s\S]{0,400}?<a href="(https:\/\/www\.bankofcanada\.ca\/[^"]+)"[^>]*>\s*Interest Rate Announcement\s*</g;
  for (const m of html.matchAll(re)) {
    const month = MONTHS.indexOf(m[1]!.toLowerCase()) + 1;
    if (month < 1) continue;
    out.push({
      date: iso(Number(m[3]), month, Number(m[2])),
      startDate: null,
      institution: "Bank of Canada",
      title: "Bank of Canada interest rate announcement",
      about: "The Bank of Canada announces its target for the overnight rate at 9:45 am Eastern time.",
      withProjections: false,
      sourceUrl: m[4]!,
    });
  }
  return out;
}

/** Upcoming events only (from today), soonest first, one per institution and day. */
export function upcoming(events: CalendarEvent[], now: number, limit = 12): CalendarEvent[] {
  const today = new Date(now).toISOString().slice(0, 10);
  const seen = new Set<string>();
  return events
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.institution.localeCompare(b.institution))
    .filter((e) => (seen.has(e.institution + e.date) ? false : (seen.add(e.institution + e.date), true)))
    .slice(0, limit);
}

/* ---------- the published file ---------- */

const INDICATOR_IDS: readonly IndicatorId[] = ["us_cpi", "us_unemployment", "us_fed_funds", "us_sofr", "euro_hicp", "ca_policy_rate", "us_debt"];
const INSTITUTIONS: readonly string[] = ["Federal Reserve", "European Central Bank", "Bank of Canada"];
const isTime = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

/** Reads a published economy.json; null if it isn't one. Drops any malformed entry instead of guessing. */
export function readEconomyFile(body: unknown): EconomyFile | null {
  if (!isRec(body) || body.schema !== ECONOMY_SCHEMA || !isTime(body.generatedAt) || !Array.isArray(body.indicators) || !isRec(body.calendar)) return null;
  const indicators = body.indicators.filter((i): i is Indicator =>
    isRec(i) && INDICATOR_IDS.includes(i.id as IndicatorId) && typeof i.name === "string" && (i.unit === "%" || i.unit === "USD") &&
    typeof i.value === "number" && typeof i.period === "string" && Array.isArray(i.series) &&
    i.series.every((p) => isRec(p) && typeof p.t === "string" && typeof p.v === "number") &&
    typeof i.source === "string" && typeof i.sourceUrl === "string" && /^https:\/\//.test(i.sourceUrl) && isTime(i.capturedAt));
  const cal = body.calendar;
  const events = Array.isArray(cal.events)
    ? cal.events.filter((e): e is CalendarEvent => isRec(e) && isDay(e.date) && INSTITUTIONS.includes(e.institution as string) && typeof e.title === "string" && typeof e.sourceUrl === "string" && /^https:\/\//.test(e.sourceUrl))
    : [];
  return { schema: ECONOMY_SCHEMA, generatedAt: body.generatedAt, indicators, calendar: { capturedAt: isTime(cal.capturedAt) ? cal.capturedAt : body.generatedAt, events } };
}

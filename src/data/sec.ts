/**
 * SEC EDGAR parsers for stock and ETF pages (docs/ux/MULTI_ASSET_CATALOG.md §4, M4).
 * Official company figures and recent filings, each linked to the filing it came from.
 * No prices: free stock prices are not licensed for public display.
 *
 * Pure functions on real EDGAR JSON (company_tickers.json, submissions, XBRL company facts).
 */
import { NO_QUOTE_REASON, SOURCES, type Asset, type Fact, type SourceRef } from "../core/asset-schema.ts";

/** Curated, widely followed US companies. CIKs are looked up daily from the SEC's own ticker list. */
export const SEC_STOCKS: readonly [ticker: string, name: string][] = [
  ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["NVDA", "NVIDIA"], ["AMZN", "Amazon"], ["GOOGL", "Alphabet (Google)"],
  ["META", "Meta Platforms"], ["TSLA", "Tesla"], ["BRK-B", "Berkshire Hathaway"], ["JPM", "JPMorgan Chase"], ["V", "Visa"],
  ["MA", "Mastercard"], ["UNH", "UnitedHealth Group"], ["XOM", "ExxonMobil"], ["JNJ", "Johnson & Johnson"], ["PG", "Procter & Gamble"],
  ["HD", "Home Depot"], ["COST", "Costco"], ["WMT", "Walmart"], ["KO", "Coca-Cola"], ["PEP", "PepsiCo"],
  ["NFLX", "Netflix"], ["AMD", "AMD"], ["INTC", "Intel"], ["ORCL", "Oracle"], ["CRM", "Salesforce"],
  ["ADBE", "Adobe"], ["DIS", "Walt Disney"], ["BA", "Boeing"], ["CAT", "Caterpillar"], ["GS", "Goldman Sachs"],
];

/** ETFs that are their own SEC filer (unit trusts). Series funds file under a parent trust and are not listed. */
export const SEC_ETFS: readonly { ticker: string; name: string; category: "index" | "commodity"; about: string }[] = [
  { ticker: "SPY", name: "SPDR S&P 500 ETF Trust", category: "index", about: "Holds the stocks of the S&P 500 index." },
  { ticker: "DIA", name: "SPDR Dow Jones Industrial Average ETF Trust", category: "index", about: "Holds the 30 stocks of the Dow Jones Industrial Average." },
  { ticker: "GLD", name: "SPDR Gold Trust", category: "commodity", about: "Holds physical gold bars in a vault." },
];

const STOCK_TERMS = ["filings", "market_hours", "market_order"];
const US_HOURS = "Mon–Fri, 9:30 am–4:00 pm New York time (closed on US market holidays)";

/* ---------- tickers ---------- */

export function readTickerMap(json: string): Map<string, { cik: number; title: string }> {
  const body = JSON.parse(json) as Record<string, { cik_str?: unknown; ticker?: unknown; title?: unknown }>;
  const out = new Map<string, { cik: number; title: string }>();
  for (const row of Object.values(body)) {
    if (typeof row.ticker === "string" && typeof row.cik_str === "number" && typeof row.title === "string") {
      out.set(row.ticker.toUpperCase(), { cik: row.cik_str, title: row.title });
    }
  }
  return out;
}

export const cik10 = (cik: number): string => String(cik).padStart(10, "0");

/** Link to a filing's main document (or its index when no document is named). */
export function filingUrl(cik: number, accession: string, doc?: string): string {
  const folder = `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, "")}`;
  return doc ? `${folder}/${doc}` : `${folder}/`;
}

/* ---------- XBRL facts ---------- */

interface XbrlPoint {
  start?: string;
  end?: string;
  val?: number;
  accn?: string;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
}

type Facts = { facts?: Record<string, Record<string, { units?: Record<string, XbrlPoint[]> }>> };

const DAY_MS = 86_400_000;
/** Figures and filings older than this are not shown: a stale number is worse than none. */
export const MAX_FIGURE_AGE_DAYS = 548;
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** The latest full-year value from an annual report (10-K or 20-F), never a quarter. */
export function annualValue(points: readonly XbrlPoint[] | undefined): XbrlPoint | null {
  const annual = (points ?? []).filter((p) => {
    if (typeof p.val !== "number" || !Number.isFinite(p.val) || !isDate(p.start) || !isDate(p.end) || !isDate(p.filed)) return false;
    if (!/^(10-K|20-F|40-F)(\/A)?$/.test(p.form ?? "")) return false;
    const days = (Date.parse(p.end) - Date.parse(p.start)) / DAY_MS;
    return days >= 330 && days <= 380;
  });
  annual.sort((a, b) => b.end!.localeCompare(a.end!) || b.filed!.localeCompare(a.filed!));
  return annual[0] ?? null;
}

/**
 * The latest point-in-time value (for example shares outstanding on the cover page).
 * Companies with several share classes report one value per class for the same date;
 * that total is ambiguous here, so nothing is returned.
 */
export function latestInstant(points: readonly XbrlPoint[] | undefined): XbrlPoint | null {
  const usable = (points ?? []).filter((p) => typeof p.val === "number" && Number.isFinite(p.val) && p.val > 0 && isDate(p.end) && isDate(p.filed));
  usable.sort((a, b) => b.end!.localeCompare(a.end!) || b.filed!.localeCompare(a.filed!));
  const top = usable[0];
  if (!top) return null;
  const sameFiling = usable.filter((p) => p.end === top.end && p.accn === top.accn);
  return new Set(sameFiling.map((p) => p.val)).size > 1 ? null : top;
}

/** Companies rename their XBRL concepts over the years; take the most recent annual value across all names. */
export function freshestAnnual(...series: (readonly XbrlPoint[] | undefined)[]): XbrlPoint | null {
  return annualValue(series.flatMap((s) => s ?? []));
}

const recentEnough = (iso: string | undefined, now: number): boolean => isDate(iso) && now - Date.parse(`${iso}T12:00:00Z`) <= MAX_FIGURE_AGE_DAYS * DAY_MS;

const fmtDate = (iso: string): string =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso}T12:00:00Z`));

export function money(v: number): string {
  const sign = v < 0 ? "−" : "";
  const a = Math.abs(v);
  if (a >= 1e12) return `${sign}$${(a / 1e12).toFixed(2)} trillion`;
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(1)} billion`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)} million`;
  return `${sign}$${a.toLocaleString("en-US")}`;
}

function count(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} billion`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} million`;
  return v.toLocaleString("en-US");
}

function secSource(cik: number, p: { accn?: string }, label: string): SourceRef {
  return {
    ...SOURCES.sec_edgar,
    label,
    attribution: { text: "Source: SEC EDGAR", href: p.accn ? filingUrl(cik, p.accn) : `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik10(cik)}` },
  };
}

/**
 * Revenue, net income, diluted EPS and shares outstanding, each with its period and filing.
 * The annual figures all come from the same fiscal year (the latest one reported), and any
 * figure whose period ended more than about 18 months ago is left out.
 */
export function figuresFromFacts(cik: number, body: Facts, now: number = Date.now()): Fact[] {
  const gaap = body.facts?.["us-gaap"] ?? {};
  const dei = body.facts?.dei ?? {};
  const usd = (name: string) => gaap[name]?.units?.USD;
  const facts: Fact[] = [];
  const revenue = freshestAnnual(usd("RevenueFromContractWithCustomerExcludingAssessedTax"), usd("Revenues"), usd("SalesRevenueNet"), usd("RevenuesNetOfInterestExpense"));
  const income = freshestAnnual(usd("NetIncomeLoss"), usd("ProfitLoss"), usd("NetIncomeLossAvailableToCommonStockholdersBasic"));
  const eps = freshestAnnual(gaap.EarningsPerShareDiluted?.units?.["USD/shares"]);
  // The fiscal year shown: the latest year-end among the main figures, if it is recent.
  const yearEnd = [revenue, income].map((p) => p?.end).filter(isDate).sort().pop();
  const sameYear = (p: XbrlPoint | null): XbrlPoint | null =>
    p && yearEnd && p.end && Math.abs(Date.parse(p.end) - Date.parse(yearEnd)) <= 7 * DAY_MS && recentEnough(p.end, now) ? p : null;
  const add = (label: string, p: XbrlPoint | null, format: (v: number) => string, period: (p: XbrlPoint) => string) => {
    if (!p || typeof p.val !== "number") return;
    facts.push({
      kind: "figure",
      label,
      value: format(p.val),
      period: period(p),
      asOf: `${p.filed}T12:00:00Z`,
      source: secSource(cik, p, `${p.form ?? "Filing"}, filed ${fmtDate(p.filed!)}`),
    });
  };
  const fiscal = (p: XbrlPoint) => `year to ${fmtDate(p.end!)}`;
  add("Revenue", sameYear(revenue), money, fiscal);
  add("Net income", sameYear(income), money, fiscal);
  add("Diluted earnings per share", sameYear(eps), (v) => `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`, fiscal);
  const shares = latestInstant(dei.EntityCommonStockSharesOutstanding?.units?.shares);
  add("Shares outstanding", shares && recentEnough(shares.end, now) ? shares : null, count, (p) => `as of ${fmtDate(p.end!)}`);
  return facts;
}

/* ---------- recent filings ---------- */

const FORM_LABEL: Record<string, string> = {
  "10-K": "Annual report (10-K)",
  "10-Q": "Quarterly report (10-Q)",
  "8-K": "Current report on a major event (8-K)",
  "20-F": "Annual report, foreign company (20-F)",
  "6-K": "Current report, foreign company (6-K)",
  "N-CSR": "Shareholder report (N-CSR)",
  "485BPOS": "Prospectus update (485BPOS)",
};

interface Submissions {
  name?: string;
  tickers?: string[];
  exchanges?: string[];
  filings?: { recent?: Record<string, unknown[]> };
}

/** The latest filing of each main form type, newest first, at most `max`. */
export function recentFilings(cik: number, body: Submissions, max = 3, now: number = Date.now()): Fact[] {
  const r = body.filings?.recent ?? {};
  const form = (r.form ?? []) as string[];
  const out: Fact[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < form.length && out.length < max; i += 1) {
    const f = form[i]!;
    const label = FORM_LABEL[f];
    const filed = (r.filingDate as string[] | undefined)?.[i];
    const accn = (r.accessionNumber as string[] | undefined)?.[i];
    if (!label || seen.has(f) || !isDate(filed) || typeof accn !== "string" || !recentEnough(filed, now)) continue;
    seen.add(f);
    const doc = (r.primaryDocument as string[] | undefined)?.[i];
    const period = (r.reportDate as string[] | undefined)?.[i];
    out.push({
      kind: "filing",
      label,
      value: `Filed ${fmtDate(filed)}`,
      period: isDate(period) ? `period to ${fmtDate(period)}` : null,
      asOf: `${filed}T12:00:00Z`,
      source: { ...SOURCES.sec_edgar, label: "Read on sec.gov", attribution: { text: "Source: SEC EDGAR", href: filingUrl(cik, accn, typeof doc === "string" && /^[\w.-]+$/.test(doc) ? doc : undefined) } },
    });
  }
  return out;
}

/* ---------- assets ---------- */

export function stockFromSec(input: { ticker: string; name: string; cik: number; submissions: string; facts: string | null; now?: number }): Asset | null {
  const now = input.now ?? Date.now();
  const sub = JSON.parse(input.submissions) as Submissions;
  const facts = input.facts ? figuresFromFacts(input.cik, JSON.parse(input.facts) as Facts, now) : [];
  const filings = recentFilings(input.cik, sub, 3, now);
  if (facts.length === 0 && filings.length === 0) return null;
  const at = (sub.tickers ?? []).findIndex((t) => t.toUpperCase() === input.ticker);
  const exchange = at >= 0 ? sub.exchanges?.[at] ?? null : null;
  const symbol = input.ticker.replace("-", ".");
  return {
    id: `stock:US:${input.ticker}`,
    symbol,
    name: input.name,
    class: "stock",
    venue: exchange,
    currency: "USD",
    country: "US",
    session: { state: "unknown", hours: US_HOURS, nextChange: null },
    quote: null,
    noQuoteReason: NO_QUOTE_REASON.stock,
    facts: [...facts, ...filings],
    status: { state: "none" },
    relatedTerms: STOCK_TERMS,
    classData: { class: "stock", cik: cik10(input.cik), exchange },
  };
}

export function etfFromSec(input: { etf: (typeof SEC_ETFS)[number]; cik: number; submissions: string; facts: string | null; now?: number }): Asset | null {
  const now = input.now ?? Date.now();
  const sub = JSON.parse(input.submissions) as Submissions;
  const figures = input.facts ? figuresFromFacts(input.cik, JSON.parse(input.facts) as Facts, now).filter((f) => f.label === "Shares outstanding") : [];
  const filings = recentFilings(input.cik, sub, 3, now);
  const at = (sub.tickers ?? []).findIndex((t) => t.toUpperCase() === input.etf.ticker);
  const exchange = at >= 0 ? sub.exchanges?.[at] ?? null : null;
  return {
    id: `etf:US:${input.etf.ticker}`,
    symbol: input.etf.ticker,
    name: input.etf.name,
    class: "etf",
    venue: exchange,
    currency: "USD",
    country: "US",
    session: { state: "unknown", hours: US_HOURS, nextChange: null },
    quote: null,
    noQuoteReason: `${NO_QUOTE_REASON.etf} ${input.etf.about}`,
    facts: [...figures, ...filings],
    status: { state: "none" },
    relatedTerms: ["etf", "index", "filings"],
    classData: { class: "etf", cik: cik10(input.cik), exchange, etfCategory: input.etf.category },
  };
}

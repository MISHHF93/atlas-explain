/**
 * "What stands out today" and "Rates and the next decision" for the web app's Today, from the same
 * sources the connector uses: notable_today from the connector itself (each item picked by a stated rule),
 * and the policy rates and the central-bank calendar from economy.json on the data site. Descriptive only:
 * nothing here forecasts or suggests anything. Loaded after the first paint, off the first-load budget.
 */
import { readEconomyFile, upcoming, type EconomyFile, type IndicatorId } from "../data/economy";
import { ECONOMY_DATA_URL, MCP_URL } from "./links";

export interface NotableItem {
  kind: string;
  title: string;
  detail: string;
  rule: string;
  source: string;
  asOf: string | null;
}
export interface PolicyRate {
  bank: string;
  value: number;
  /** The last move in the series, in percentage points, and the day it took effect; null if none in the series. */
  change: number | null;
  movedOn: string | null;
  note: string | null;
  asOf: string;
  sourceUrl: string;
}
export interface NextDecision {
  institution: string;
  date: string;
  daysAway: number;
  sourceUrl: string;
}
export interface TodayBrief {
  notable: NotableItem[] | null;
  quiet: string[];
  rates: PolicyRate[];
  next: NextDecision | null;
  economyAsOf: string | null;
}

const RATES: [IndicatorId, string][] = [
  ["us_fed_funds", "Federal Reserve (effective fed funds)"],
  ["euro_deposit_rate", "European Central Bank (deposit rate)"],
  ["ca_policy_rate", "Bank of Canada (policy rate)"],
  ["uk_bank_rate", "Bank of England (Bank Rate)"],
];

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const isRec = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** The connector's notable_today answer, as plain items; null when it can't be read. */
export function readNotable(body: unknown): { items: NotableItem[]; quiet: string[] } | null {
  const sc = isRec(body) && isRec(body.result) && isRec(body.result.structuredContent) ? body.result.structuredContent : null;
  if (!sc || !Array.isArray(sc.observations)) return null;
  const items = sc.observations.filter(isRec).map((o) => ({
    kind: str(o.kind), title: str(o.title), detail: str(o.detail), rule: str(o.rule), source: str(o.source), asOf: typeof o.asOf === "string" ? o.asOf : null,
  })).filter((o) => o.title);
  const quiet = Array.isArray(sc.quiet) ? sc.quiet.filter((q): q is string => typeof q === "string") : [];
  return { items, quiet };
}

/** The four policy rates and the next decision of any of the four banks, from economy.json. */
export function ratesFrom(file: EconomyFile, now: number): { rates: PolicyRate[]; next: NextDecision | null } {
  const rates = RATES.flatMap(([id, bank]): PolicyRate[] => {
    const i = file.indicators.find((x) => x.id === id);
    if (!i) return [];
    // The last step in the series, not the change since yesterday: the fed funds rate is daily.
    let change: number | null = null;
    let movedOn: string | null = null;
    for (let k = i.series.length - 1; k > 0; k--) {
      if (i.series[k]!.v !== i.series[k - 1]!.v) {
        change = Math.round((i.series[k]!.v - i.series[k - 1]!.v) * 100) / 100;
        movedOn = i.series[k]!.t;
        break;
      }
    }
    return [{ bank, value: i.value, change, movedOn, note: i.note, asOf: i.period, sourceUrl: i.sourceUrl }];
  });
  const e = upcoming(file.calendar.events, now, 1)[0];
  const next = e ? { institution: e.institution, date: e.date, daysAway: Math.round((Date.parse(`${e.date}T12:00:00Z`) - now) / 86_400_000), sourceUrl: e.sourceUrl } : null;
  return { rates, next };
}

/** Both parts at once; each part that fails is null or empty, never made up. */
export async function loadTodayBrief(fetcher: Fetcher = fetch, now = Date.now()): Promise<TodayBrief> {
  const notableReq = MCP_URL
    ? fetcher(MCP_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "notable_today", arguments: {} } }),
        signal: AbortSignal.timeout(10_000),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    : Promise.resolve(null);
  const economyReq = fetcher(ECONOMY_DATA_URL, { signal: AbortSignal.timeout(10_000) }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  const [notableBody, economyBody] = await Promise.all([notableReq, economyReq]);
  const notable = readNotable(notableBody);
  const economy = economyBody == null ? null : readEconomyFile(economyBody);
  const { rates, next } = economy ? ratesFrom(economy, now) : { rates: [], next: null };
  return { notable: notable?.items ?? null, quiet: notable?.quiet ?? [], rates, next, economyAsOf: economy?.generatedAt ?? null };
}

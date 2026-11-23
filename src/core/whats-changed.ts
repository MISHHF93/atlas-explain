/**
 * What changed since a date (docs/V2_DESIGN.md, whats_changed): each published figure that moved, written from
 * one fixed template, the central banks' statements and speeches published since, and what's coming up. Every
 * claim carries its source and date. Pure: reads economy.json and docs.json, never the network.
 *
 * When a figure "changed": a daily series (policy rates, SOFR, fed funds, US debt) compares the value on the date
 * with the latest. A monthly figure's period isn't its publication day, so it counts only when ATLAS Explain first
 * saw that period after the date (EconomyFile.firstSeen, tracked since 23 Nov 2026). Describes the past only.
 */
import { BANK_NAME, type DocBank, type DocsFile } from "../data/docs";
import { upcoming, type CalendarEvent, type EconomyFile, type Indicator, type IndicatorId } from "../data/economy";

export type ChangeTopic = "all" | "rates" | "inflation" | "jobs" | "us" | "canada" | "uk" | "euro";
export const CHANGE_TOPICS: readonly ChangeTopic[] = ["all", "rates", "inflation", "jobs", "us", "canada", "uk", "euro"];

const IDS: Record<ChangeTopic, readonly IndicatorId[] | null> = {
  all: null,
  rates: ["us_fed_funds", "us_sofr", "euro_deposit_rate", "ca_policy_rate", "uk_bank_rate"],
  inflation: ["us_cpi", "euro_hicp", "ca_cpi", "uk_cpi"],
  jobs: ["us_unemployment", "euro_unemployment", "ca_unemployment", "uk_unemployment"],
  us: ["us_cpi", "us_unemployment", "us_fed_funds", "us_sofr", "us_debt"],
  canada: ["ca_cpi", "ca_unemployment", "ca_policy_rate"],
  uk: ["uk_cpi", "uk_unemployment", "uk_bank_rate"],
  euro: ["euro_hicp", "euro_unemployment", "euro_deposit_rate"],
};
const BANKS: Record<ChangeTopic, readonly DocBank[]> = {
  all: ["fed", "boc", "ecb", "boe"], rates: ["fed", "boc", "ecb", "boe"], inflation: [], jobs: [],
  us: ["fed"], canada: ["boc"], uk: ["boe"], euro: ["ecb"],
};
const INSTITUTION: Record<DocBank, CalendarEvent["institution"]> = { fed: "Federal Reserve", boc: "Bank of Canada", ecb: "European Central Bank", boe: "Bank of England" };

/** Rates set by a decision: they stay put between decisions, so a change has a single day. */
const STEP_RATES: readonly IndicatorId[] = ["euro_deposit_rate", "ca_policy_rate", "uk_bank_rate"];

/** Daily series whose small day-to-day moves aren't news: report only a move of at least this many points. */
const DAILY_MIN_PT: Partial<Record<IndicatorId, number>> = { us_fed_funds: 0.1, us_sofr: 0.1 };

export function changeTopic(v: unknown): ChangeTopic | null {
  const s = String(v ?? "all").trim().toLowerCase();
  const alias: Record<string, ChangeTopic> = { "": "all", everything: "all", rate: "rates", "interest rates": "rates", prices: "inflation", cpi: "inflation", unemployment: "jobs", employment: "jobs", usa: "us", "united states": "us", ca: "canada", britain: "uk", "united kingdom": "uk", eurozone: "euro", "euro area": "euro", europe: "euro", ecb: "euro" };
  return (CHANGE_TOPICS as readonly string[]).includes(s) ? (s as ChangeTopic) : alias[s] ?? null;
}

export interface Change {
  id: IndicatorId;
  claim: string;
  from: { value: number; period: string };
  to: { value: number; period: string };
  source: { name: string; url: string };
  /** When the newer value was first seen (monthly) or its date (daily). */
  asOf: string;
}
export interface ChangeDocument {
  kind: "statement" | "speech";
  bank: DocBank;
  institution: string;
  title: string;
  speaker: string | null;
  url: string;
  publishedAt: string;
}
export interface WhatsChanged {
  since: string;
  topic: ChangeTopic;
  changes: Change[];
  documents: ChangeDocument[];
  upcoming: { date: string; institution: string; title: string; sourceUrl: string }[];
  notes: string[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const periodLabel = (t: string) => (/^\d{4}-\d{2}$/.test(t) ? `${MONTHS[Number(t.slice(5)) - 1]} ${t.slice(0, 4)}` : t);
const fmt = (i: Indicator, v: number) => (i.unit === "USD" ? (v >= 1e12 ? `$${(v / 1e12).toFixed(2)} trillion` : `$${(v / 1e9).toFixed(1)} billion`) : `${v.toFixed(2)}%`);
const isDaily = (i: Indicator) => i.series.every((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.t));

function changeOf(i: Indicator, file: EconomyFile, sinceDay: string, sinceIso: string): Change | null {
  const s = i.series;
  const latest = s[s.length - 1];
  if (!latest) return null;
  let from: { t: string; v: number } | undefined;
  let asOf: string;
  if (isDaily(i)) {
    from = [...s].reverse().find((p) => p.t <= sinceDay);
    if (!from || from.t === latest.t) return null;
    const moved = latest.v - from.v;
    if (i.unit === "USD" ? Math.abs(moved / from.v) < 0.001 : Math.abs(moved) < (DAILY_MIN_PT[i.id] ?? 0.0001)) return null;
    asOf = latest.t;
  } else {
    const seen = file.firstSeen?.[i.id] ?? {};
    const fresh = s.filter((p) => typeof seen[p.t] === "string" && seen[p.t]! > sinceIso);
    if (!fresh.length) return null;
    const firstNew = s.indexOf(fresh[0]!);
    from = firstNew > 0 ? s[firstNew - 1] : undefined;
    if (!from) return null;
    asOf = seen[latest.t] ?? file.generatedAt;
  }
  const dir = latest.v > from.v ? "rose" : latest.v < from.v ? "fell" : "was unchanged";
  // A policy rate is a step: name the day it last moved, not the first day of the old level.
  const steps = STEP_RATES.includes(i.id) ? s.filter((p, k) => p.t > from!.t && k > 0 && p.v !== s[k - 1]!.v) : [];
  const claim = dir === "was unchanged"
    ? `${i.name} was unchanged at ${fmt(i, latest.v)} (${periodLabel(from.t)} and ${periodLabel(latest.t)}).`
    : steps.length
      ? `${i.name} ${dir} from ${fmt(i, from.v)} to ${fmt(i, latest.v)}, in effect from ${steps.at(-1)!.t}${steps.length > 1 ? ` (it moved ${steps.length} times in that time)` : ""}.`
      : `${i.name} ${dir} from ${fmt(i, from.v)} (${periodLabel(from.t)}) to ${fmt(i, latest.v)} (${periodLabel(latest.t)}).`;
  if (steps.length) asOf = steps.at(-1)!.t;
  return { id: i.id, claim, from: { value: from.v, period: from.t }, to: { value: latest.v, period: latest.t }, source: { name: i.source, url: i.sourceUrl }, asOf };
}

export function whatsChanged(input: { economy: EconomyFile | null; docs: DocsFile | null; topic: ChangeTopic; since: number; now: number }): WhatsChanged {
  const sinceIso = new Date(input.since).toISOString();
  const sinceDay = sinceIso.slice(0, 10);
  const today = new Date(input.now).toISOString().slice(0, 10);
  const ids = IDS[input.topic];
  const notes: string[] = [];
  const econ = input.economy;
  const changes = econ
    ? econ.indicators.filter((i) => !ids || ids.includes(i.id)).flatMap((i) => changeOf(i, econ, sinceDay, sinceIso) ?? [])
    : [];
  if (!econ) notes.push("The economic figures couldn't be loaded, so no figure is compared. Nothing is shown in their place.");
  else if (!econ.trackingSince) {
    notes.push("Monthly figures aren't compared yet: ATLAS Explain starts recording the day each one is published at its next refresh. Daily rates are compared.");
  } else if (econ.trackingSince > sinceIso) {
    notes.push(`Monthly figures are compared from ${econ.trackingSince.slice(0, 10)}, when ATLAS Explain began recording the day each one is published; daily rates are compared from ${sinceDay}.`);
  }
  const banks = BANKS[input.topic];
  const documents: ChangeDocument[] = [];
  if (input.docs) {
    for (const b of banks) {
      for (const st of input.docs.statements[b] ?? []) if (st.date > sinceDay) documents.push({ kind: "statement", bank: b, institution: BANK_NAME[b], title: st.title, speaker: null, url: st.url, publishedAt: st.date });
      for (const sp of input.docs.speeches[b] ?? []) if (sp.date > sinceDay && sp.date <= today) documents.push({ kind: "speech", bank: b, institution: BANK_NAME[b], title: sp.title, speaker: sp.speaker, url: sp.url, publishedAt: sp.date });
    }
    documents.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  } else if (banks.length) notes.push("The central banks' statements and speeches couldn't be loaded.");
  const wanted = new Set(banks.map((b) => INSTITUTION[b]));
  const next = econ ? upcoming(econ.calendar.events, input.now, 12).filter((e) => !banks.length || wanted.has(e.institution)).slice(0, 3) : [];
  return {
    since: sinceDay,
    topic: input.topic,
    changes,
    documents: documents.slice(0, 12),
    upcoming: next.map((e) => ({ date: e.date, institution: e.institution, title: e.title, sourceUrl: e.sourceUrl })),
    notes,
  };
}

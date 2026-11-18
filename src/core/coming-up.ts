/**
 * Scheduled events with exact times, soonest first: central-bank rate decisions (each bank's calendar) and
 * US data releases (the BLS calendar), each with the latest related figure as context and its "if this
 * happens" explainers. Shared by the connector (upcoming_events) and the web app's "Coming up".
 */
import { decisionTime, upcoming, type EconomyFile, type IndicatorId } from "../data/economy";
import { scenariosFor, type EventKind, type ScenarioSet } from "./scenarios";

export interface ComingUpEvent {
  id: string;
  kind: EventKind;
  /** The bank or agency. */
  who: string;
  title: string;
  /** UTC instant (ISO). */
  time: string;
  about: string;
  sourceUrl: string;
  /** The latest related figure, as a sentence; null when not captured. */
  context: string | null;
  scenarios: ScenarioSet;
}

const BANK_RATE: Record<string, IndicatorId> = {
  "Federal Reserve": "us_fed_funds",
  "European Central Bank": "euro_deposit_rate",
  "Bank of Canada": "ca_policy_rate",
  "Bank of England": "uk_bank_rate",
};
const RELEASE_FIGURE: Partial<Record<EventKind, IndicatorId>> = { cpi: "us_cpi", jobs: "us_unemployment" };

function figure(file: EconomyFile, id: IndicatorId): string | null {
  const i = file.indicators.find((x) => x.id === id);
  if (!i) return null;
  let move = "";
  if (i.changeWindow === "since the last change") {
    for (let k = i.series.length - 1; k > 0; k--) {
      const d = i.series[k]!.v - i.series[k - 1]!.v;
      if (d !== 0) {
        move = `, last moved ${d > 0 ? "+" : "−"}${Math.abs(d).toFixed(2)} pt on ${i.series[k]!.t}`;
        break;
      }
    }
  }
  return `Now: ${i.name} ${i.value.toFixed(2)}% for ${i.period}${move} (${i.source}).`;
}

export function comingUp(file: EconomyFile, now: number, limit = 8): ComingUpEvent[] {
  const decisions = upcoming(file.calendar.events, now, 12).map((e): ComingUpEvent => ({
    id: `${e.institution}-${e.date}`.replace(/\s+/g, "-").toLowerCase(),
    kind: "rate_decision",
    who: e.institution,
    title: `${e.institution} rate decision`,
    time: decisionTime(e),
    about: e.about,
    sourceUrl: e.sourceUrl,
    context: BANK_RATE[e.institution] ? figure(file, BANK_RATE[e.institution]!) : null,
    scenarios: scenariosFor("rate_decision"),
  }));
  const releases = (file.releases?.events ?? []).map((r): ComingUpEvent => ({
    id: `bls-${r.kind}-${r.date}`,
    kind: r.kind,
    who: r.agency,
    title: r.title,
    time: r.time,
    about: r.about,
    sourceUrl: r.sourceUrl,
    context: RELEASE_FIGURE[r.kind] ? figure(file, RELEASE_FIGURE[r.kind]!) : null,
    scenarios: scenariosFor(r.kind),
  }));
  return [...decisions, ...releases]
    .filter((e) => Date.parse(e.time) > now - 15 * 60_000)
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, limit);
}

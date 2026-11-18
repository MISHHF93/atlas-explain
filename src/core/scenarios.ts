/**
 * "If this happens" explainers for scheduled events: each possible outcome and what it would typically
 * mean, and what people look at before and after. Conditional and educational: they never say which
 * outcome will happen, never suggest an action, and name no price direction. Shared by the connector
 * (upcoming_events) and the web app's "Coming up".
 */

export type EventKind = "rate_decision" | "cpi" | "jobs" | "ppi";

export interface Scenario {
  outcome: string;
  meaning: string;
}
export interface ScenarioSet {
  kind: EventKind;
  /** What people usually look at going in. */
  watch: string[];
  outcomes: Scenario[];
  /** One plain caution about reading the result. */
  caution: string;
}

const RATE: ScenarioSet = {
  kind: "rate_decision",
  watch: [
    "The latest inflation figure next to the bank's target (2% for the Fed, ECB, Bank of Canada and Bank of England)",
    "The latest jobs and unemployment figures",
    "What the bank said at its last meeting about what would make it move",
  ],
  outcomes: [
    { outcome: "It holds the rate", meaning: "Borrowing and savings rates linked to it stay where they are for now. The statement and press conference then matter most: they explain what the bank is watching." },
    { outcome: "It raises the rate (usually by 0.25 points)", meaning: "Borrowing gets dearer across the economy, from variable-rate loans to new mortgages, and savings rates tend to rise. Banks raise rates to slow inflation." },
    { outcome: "It cuts the rate (usually by 0.25 points)", meaning: "Borrowing gets cheaper and savings rates tend to fall. Banks cut to support growth and jobs when inflation is under control." },
  ],
  caution: "How people react often depends less on the decision than on how it compares with what was widely expected, and on the bank's words about what comes next.",
};

const SETS: Record<EventKind, ScenarioSet> = {
  rate_decision: RATE,
  cpi: {
    kind: "cpi",
    watch: ["Last month's 12-month inflation rate", "Core inflation (without food and energy), which moves less from month to month", "Which prices drove the change: housing, energy, food or services"],
    outcomes: [
      { outcome: "Inflation comes in higher than last month", meaning: "Prices are rising faster. It can make a central bank less likely to cut, or more likely to keep rates high for longer." },
      { outcome: "About the same as last month", meaning: "Price pressure is steady. Attention moves to the details, such as core inflation and services prices." },
      { outcome: "Inflation comes in lower than last month", meaning: "Prices are rising more slowly. It can give a central bank room to cut, if the slowdown lasts." },
    ],
    caution: "One month can be noisy: energy prices swing, and figures are sometimes revised. Several months together say more than one.",
  },
  jobs: {
    kind: "jobs",
    watch: ["Jobs added last month and the revisions to earlier months", "The unemployment rate", "Average hourly earnings, a link between jobs and inflation"],
    outcomes: [
      { outcome: "Stronger than recent months", meaning: "More jobs or lower unemployment point to a firm economy. Fast wage growth can add to inflation pressure." },
      { outcome: "Mixed", meaning: "Jobs and unemployment can point different ways, for example when more people start looking for work. The details explain which." },
      { outcome: "Weaker than recent months", meaning: "Fewer jobs or rising unemployment point to a slowing economy, which central banks weigh when deciding rates." },
    ],
    caution: "Jobs figures are revised for two months after release, sometimes by a lot, so the first number is not the last word.",
  },
  ppi: {
    kind: "ppi",
    watch: ["Last month's producer price change", "Whether consumer prices (CPI) moved the same way"],
    outcomes: [
      { outcome: "Producer prices rise faster", meaning: "Businesses are charging more for their goods and services; some of it can reach shop prices later." },
      { outcome: "Producer prices rise more slowly or fall", meaning: "Price pressure early in the supply chain is easing, which can show up in consumer prices later." },
    ],
    caution: "Producer prices are only one early signal; many costs never reach consumer prices one for one.",
  },
};

export function scenariosFor(kind: EventKind): ScenarioSet {
  return SETS[kind];
}

/** "in 20 days, 3 hours", "in 4 hours, 12 minutes", "in 9 minutes", "now". */
export function countdown(targetIso: string, now: number): string {
  const ms = Date.parse(targetIso) - now;
  if (ms <= 0) return "now";
  const min = Math.floor(ms / 60_000);
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const unit = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (d > 0) return `in ${unit(d, "day")}${h ? `, ${unit(h, "hour")}` : ""}`;
  if (h > 0) return `in ${unit(h, "hour")}${m ? `, ${unit(m, "minute")}` : ""}`;
  return `in ${unit(Math.max(1, m), "minute")}`;
}

/** An iCalendar file for one event, for "Add to calendar". */
export function eventIcs(e: { title: string; time: string; about: string; sourceUrl: string; uid: string }, durationMin = 30): string {
  const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const end = new Date(Date.parse(e.time) + durationMin * 60_000).toISOString();
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/([,;])/g, "\\$1").replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//ATLAS Explain//Coming up//EN", "BEGIN:VEVENT",
    `UID:${e.uid}@atlas-explain`, `DTSTAMP:${stamp(new Date().toISOString())}`, `DTSTART:${stamp(e.time)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(e.title)}`, `DESCRIPTION:${esc(`${e.about} Source: ${e.sourceUrl}`)}`, `URL:${e.sourceUrl}`,
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}

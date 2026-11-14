/**
 * Privacy-respecting product analytics (PR 7): the web app only, only after consent, only when
 * the owner turns it on (Remote Config analytics_enabled), and only these events with these
 * fields. Nothing a person highlights, types or saves is ever sent; neither are prices or symbols.
 * The Chrome extension sends no analytics at all.
 */

export const CONSENT_KEY = "atlas-explain-analytics-consent";
export type Consent = "granted" | "denied" | "unset";

export function readConsent(raw: string | null): Consent {
  return raw === "granted" || raw === "denied" ? raw : "unset";
}

/** Allowed events and, for each, the only parameters that may go with it (short enums or counts). */
export const EVENTS = {
  tutorial_begin: [],
  try_sample: [],
  explanation_ready: ["source", "kind"],
  explanation_failed: ["reason"],
  login: ["method"],
  sign_up: ["method"],
  watchlist_add: ["asset_class"],
  asset_view: ["asset_class"],
  news_open: [],
  data_export: [],
  account_delete: [],
  app_error: ["code", "surface"],
} as const satisfies Record<string, readonly string[]>;

export type EventName = keyof typeof EVENTS;

const VALUE = /^[a-z0-9_]{1,40}$/;

/**
 * Keeps only allowlisted parameters whose values are short lowercase codes or small numbers.
 * Anything else (free text, emails, symbols, prices) is dropped, never sent.
 */
export function sanitizeEvent(name: string, params: Record<string, unknown> = {}): { name: EventName; params: Record<string, string | number> } | null {
  if (!(name in EVENTS)) return null;
  const allowed = EVENTS[name as EventName] as readonly string[];
  const out: Record<string, string | number> = {};
  for (const key of allowed) {
    const v = params[key];
    if (typeof v === "string" && VALUE.test(v)) out[key] = v;
    else if (typeof v === "number" && Number.isInteger(v) && v >= 0 && v < 10_000) out[key] = v;
  }
  return { name: name as EventName, params: out };
}

export interface AnalyticsSink {
  log(name: EventName, params: Record<string, string | number>): void;
}

/** The app-wide tracker. Calls are dropped until consent is granted and a sink is attached. */
export function createTracker(): {
  track(name: string, params?: Record<string, unknown>): void;
  attach(sink: AnalyticsSink | null): void;
  sent(): number;
} {
  let sink: AnalyticsSink | null = null;
  let count = 0;
  return {
    track(name, params) {
      if (!sink) return;
      const event = sanitizeEvent(name, params);
      if (!event) return;
      sink.log(event.name, event.params);
      count += 1;
    },
    attach(next) {
      sink = next;
    },
    sent: () => count,
  };
}

export const tracker = createTracker();

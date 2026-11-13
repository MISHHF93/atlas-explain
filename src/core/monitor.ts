/**
 * Monitoring hooks. Every surface reports the same small set of events so a real
 * sink (Firebase Analytics, Crashlytics for web, Sentry, a log endpoint) can be
 * plugged in at launch without touching call sites.
 *
 * Privacy: events carry a kind, a short code and a surface. Never the highlighted
 * text, questions, answers, emails or ids. Messages are scrubbed and truncated.
 */
export type MonitorKind =
  | "cloud_error"
  | "app_check_error"
  | "auth_error"
  | "timeout"
  | "rate_limited"
  | "price_feed_error"
  | "uncaught";

export interface MonitorEvent {
  kind: MonitorKind;
  surface: "web" | "extension" | "bridge";
  code: string;
  at: string;
}

export type MonitorSink = (event: MonitorEvent) => void;

const RING_MAX = 50;
const ring: MonitorEvent[] = [];
const sinks: MonitorSink[] = [];

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/g;
const LONG_TOKEN = /[A-Za-z0-9_-]{24,}/g;

export function scrub(text: string): string {
  return text.replace(EMAIL, "[email]").replace(LONG_TOKEN, "[token]").replace(/\s+/g, " ").trim().slice(0, 120);
}

export function addMonitorSink(sink: MonitorSink): () => void {
  sinks.push(sink);
  return () => {
    const i = sinks.indexOf(sink);
    if (i >= 0) sinks.splice(i, 1);
  };
}

export function report(kind: MonitorKind, surface: MonitorEvent["surface"], code: string): MonitorEvent {
  const event: MonitorEvent = { kind, surface, code: scrub(code) || "unknown", at: new Date().toISOString() };
  ring.push(event);
  if (ring.length > RING_MAX) ring.shift();
  for (const sink of sinks) {
    try {
      sink(event);
    } catch {
      // A broken sink must never break the app.
    }
  }
  return event;
}

/** Recent events, newest last. Shown in Settings → Diagnostics and attached to bug reports by the user. */
export function recentEvents(): readonly MonitorEvent[] {
  return ring.slice();
}

/** Classify an error message into a monitor kind without keeping the message itself. */
export function classifyCloudError(message: string): MonitorKind {
  if (/app.?check|recaptcha|attestation|throttl/i.test(message)) return "app_check_error";
  if (/deadline|timed? ?out|took too long/i.test(message)) return "timeout";
  return "cloud_error";
}

/** Default sink: one console line per event, with no user content. */
export const consoleSink: MonitorSink = (event) => {
  console.warn(`[atlas-explain] ${event.surface} ${event.kind}: ${event.code}`);
};

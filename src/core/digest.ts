/** Today's educational digest from ATLAS. Dates are America/Toronto. Never treats yesterday as today. */
import { ATLAS_ORIGIN } from "./assets";

export const DIGEST_PATH = "/api/explain/daily-brief";
export const DIGEST_SCHEMA = "atlas-explain-digest-v1";
export const TORONTO_ZONE = "America/Toronto";
export const NOT_READY = "Today's digest is not ready yet.";

export type DigestNote = {
  title: string;
  source: string;
  publishedAtToronto: string;
  publishedDate: string;
  url: string;
  kind: string;
};

export type DigestView =
  | { kind: "loading" }
  | { kind: "not_connected"; reason: string; today: string }
  | { kind: "not_ready"; reason: string; today: string; digest?: DigestBody }
  | { kind: "ready"; digest: DigestBody };

export interface DigestBody {
  reportingDate: string;
  timezone: string;
  generatedAtToronto: string;
  headline: string;
  officialNotes: DigestNote[];
  previousOfficialNotes: DigestNote[];
  reason: string | null;
  morningReport: { reportDate: string; generatedAtToronto: string | null; isToday: boolean } | null;
  disclaimer: string;
}

export function todayToronto(nowMs = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TORONTO_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(nowMs));
}

export function longTorontoDate(nowMs = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TORONTO_ZONE, dateStyle: "full" }).format(new Date(nowMs));
}

function str(v: unknown, max = 400): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function notes(raw: unknown): DigestNote[] {
  if (!Array.isArray(raw)) return [];
  const out: DigestNote[] = [];
  for (const n of raw) {
    if (!n || typeof n !== "object") continue;
    const r = n as Record<string, unknown>;
    const title = str(r.title, 240);
    const publishedDate = str(r.publishedDate, 10);
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(publishedDate)) continue;
    out.push({
      title,
      source: str(r.source, 40) || "official",
      publishedAtToronto: str(r.publishedAtToronto, 48),
      publishedDate,
      url: str(r.url, 500),
      kind: str(r.kind, 24) || "macro",
    });
  }
  return out;
}

export function readDigest(payload: unknown, nowMs = Date.now()): DigestBody | null {
  if (!payload || typeof payload !== "object") return null;
  const r = payload as Record<string, unknown>;
  if (r.schema !== DIGEST_SCHEMA) return null;
  const reportingDate = str(r.reportingDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(reportingDate)) return null;
  const morning = r.morningReport && typeof r.morningReport === "object" ? (r.morningReport as Record<string, unknown>) : null;
  return {
    reportingDate,
    timezone: str(r.timezone, 40) || TORONTO_ZONE,
    generatedAtToronto: str(r.generatedAtToronto, 48),
    headline: str(r.headline, 240) || `Educational market context for ${longTorontoDate(nowMs)} (${TORONTO_ZONE}).`,
    officialNotes: notes(r.officialNotes),
    previousOfficialNotes: notes(r.previousOfficialNotes),
    reason: str(r.reason, 300) || null,
    morningReport: morning && str(morning.reportDate, 10)
      ? { reportDate: str(morning.reportDate, 10), generatedAtToronto: str(morning.generatedAtToronto, 48) || null, isToday: morning.isToday === true }
      : null,
    disclaimer: str(r.disclaimer, 300) || "Education only. Not financial advice.",
  };
}

export function viewFor(payload: unknown, connected: boolean, nowMs = Date.now()): DigestView {
  const today = todayToronto(nowMs);
  if (!connected) {
    return { kind: "not_connected", today, reason: `${NOT_READY} Open ATLAS on this computer to load today's digest.` };
  }
  const digest = readDigest(payload, nowMs);
  if (!digest) {
    return { kind: "not_ready", today, reason: NOT_READY };
  }
  if (digest.reportingDate !== today) {
    return { kind: "not_ready", today, reason: `${NOT_READY} Today in America/Toronto is ${today}. The digest on file is ${digest.reportingDate}.`, digest };
  }
  return { kind: "ready", digest };
}

export async function loadDigest(fetcher: typeof fetch = fetch, nowMs = Date.now()): Promise<DigestView> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetcher(`${ATLAS_ORIGIN}${DIGEST_PATH}`, { signal: ctl.signal, cache: "no-store", credentials: "omit" });
    if (!res.ok) {
      return { kind: "not_connected", today: todayToronto(nowMs), reason: res.status === 403 ? `${NOT_READY} ATLAS only answers Explain on this computer.` : `${NOT_READY} ATLAS answered ${res.status}.` };
    }
    return viewFor(await res.json(), true, nowMs);
  } catch {
    return { kind: "not_connected", today: todayToronto(nowMs), reason: `${NOT_READY} Open ATLAS on this computer to load today's digest.` };
  } finally {
    clearTimeout(timer);
  }
}

/** One-line status for the "Today's digest" row on the Explain tab. */
export function digestRowStatus(view: DigestView, marketReady = false): { label: string; tone: "ready" | "loading" | "waiting" } {
  if (view.kind === "ready" || marketReady) return { label: "Today", tone: "ready" };
  if (view.kind === "loading") return { label: "Loading", tone: "loading" };
  return { label: "Not ready yet", tone: "waiting" };
}

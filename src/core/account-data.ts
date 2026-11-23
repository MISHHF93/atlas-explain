/**
 * "Download my data" and "Delete my account" (PR 5). Pure: no Firebase, no DOM.
 *
 * Deletion on the free Firebase plan (no server functions): the browser deletes everything the
 * security rules let an owner delete: saved explanations, settings, the watchlist and every
 * past day's usage counter. Today's counter (a date and a number) cannot be deleted by the
 * client, so nobody can reset today's free allowance; it stays behind with no way to link it
 * to a person once the sign-in account is gone. The privacy policy says so.
 */

export const EXPORT_SCHEMA = "atlas-explain-export-v1";

export interface ExportInput {
  exportedAt: Date;
  account: { uid: string; email: string | null; displayName: string | null; provider: string } | null;
  settings: { theme: string } | null;
  watchlist: string[];
  savedExplanations: Array<Record<string, unknown>>;
  browserHistory: unknown[];
  recentlyViewed: string[];
  /** Learn path progress in this browser: glossary term ids. */
  learnProgress?: string[];
  /** Learn review schedule in this browser: topic ids with their next review date. */
  reviewSchedule?: Record<string, unknown>;
}

/** Account-shaped keys never belong in an export (they are never stored, but this keeps it that way). */
const NEVER = /balance|account.?number|password|token|secret/i;

function scrub(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (!NEVER.test(k)) out[k] = scrub(v);
    return out;
  }
  return value;
}

export function buildExport(input: ExportInput): Record<string, unknown> {
  return scrub({
    schema: EXPORT_SCHEMA,
    exportedAt: input.exportedAt.toISOString(),
    about: "Everything ATLAS Explain keeps for you. Saved explanations, settings and the watchlist come from your account (when signed in); history, recently viewed and Learn progress come from this browser.",
    account: input.account,
    settings: input.settings,
    watchlist: input.watchlist,
    savedExplanations: input.savedExplanations,
    browserHistory: input.browserHistory,
    recentlyViewed: input.recentlyViewed,
    learnProgress: input.learnProgress ?? [],
    reviewSchedule: input.reviewSchedule ?? {},
  }) as Record<string, unknown>;
}

export function exportFileName(at: Date): string {
  return `atlas-explain-data-${at.toISOString().slice(0, 10)}.json`;
}

/** The UTC day id used for usage counters, e.g. "2026-11-14". */
export function utcDayId(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/**
 * Mirrors the firestore.rules delete clause for users/{uid}/usage/{dayId}: only days that
 * started more than 24 hours ago, so today's counter can never be reset by its owner.
 */
export function usageDeleteAllowed(dayId: string, nowMs: number): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayId)) return false;
  const start = Date.UTC(Number(dayId.slice(0, 4)), Number(dayId.slice(5, 7)) - 1, Number(dayId.slice(8, 10)));
  return start < nowMs - 86_400_000;
}

/** Keys this app keeps in the browser; "Clear data on this browser" and account deletion remove them. */
export const LOCAL_DATA_KEYS = [
  "atlas-explain-text-history",
  "atlas-explain-watchlist",
  "atlas-explain-recent-assets",
  "atlas-explain-learned",
  "atlas-explain-review",
] as const;

/** Learn path progress in the web app: a list of glossary term ids, nothing personal. */
export const WEB_LEARN_KEY = "atlas-explain-learned";
/** Learn review schedule in the web app: topic ids with their next review date (src/core/review.ts). */
export const WEB_REVIEW_KEY = "atlas-explain-review";

import type { TwoSided } from "./two-sided";

/**
 * Saved explanations of pasted or typed text in the web app. Kept in this browser only
 * (localStorage), newest first, at most MAX_TEXT_HISTORY. Nothing private is stored:
 * the text is already redacted by the prompt builder's rules before it is saved.
 */
export interface TextHistoryEntry {
  id: string;
  text: string;
  answer: TwoSided | null;
  plain: string;
  source: "on_device" | "in_cloud" | "unknown";
  at: number;
}

export const TEXT_HISTORY_KEY = "atlas-explain-text-history";
export const MAX_TEXT_HISTORY = 20;

export function readTextHistory(raw: string | null): TextHistoryEntry[] {
  if (!raw) return [];
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) return [];
  return value.filter(isEntry).slice(0, MAX_TEXT_HISTORY);
}

export function addTextHistory(list: readonly TextHistoryEntry[], entry: TextHistoryEntry): TextHistoryEntry[] {
  const same = (e: TextHistoryEntry) => e.text.trim().toLowerCase() === entry.text.trim().toLowerCase();
  return [entry, ...list.filter((e) => !same(e))].slice(0, MAX_TEXT_HISTORY);
}

export function removeTextHistory(list: readonly TextHistoryEntry[], id: string): TextHistoryEntry[] {
  return list.filter((e) => e.id !== id);
}

/** "just now", "5 min ago", "3 h ago", or a short date. */
export function ageLabel(at: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86_400) return `${Math.round(s / 3600)} h ago`;
  return new Date(at).toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function isEntry(value: unknown): value is TextHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === "string" && typeof v.text === "string" && typeof v.plain === "string" && typeof v.at === "number" &&
    (v.source === "on_device" || v.source === "in_cloud" || v.source === "unknown");
}

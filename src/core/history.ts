import { redactSensitive } from "./extension-prompt";

/**
 * Recent explanations, kept on this device only (chrome.storage.local in the
 * extension). Never written to Firestore and never sent anywhere.
 */
export interface HistoryEntry {
  id: string;
  /** Epoch milliseconds. */
  at: number;
  /** The highlight or typed text, redacted and clipped. */
  selection: string;
  text: string;
  source: "on_device" | "in_cloud";
  contextLine?: string;
}

export const HISTORY_KEY = "history";
export const HISTORY_MAX = 20;
const SELECTION_MAX = 240;
const TEXT_MAX = 4_000;

export function makeEntry(input: Omit<HistoryEntry, "id" | "at" | "selection"> & { selection: string; at?: number }): HistoryEntry {
  const at = input.at ?? Date.now();
  const selection = redactSensitive(input.selection.replace(/\s+/g, " ").trim()).text.slice(0, SELECTION_MAX);
  const entry: HistoryEntry = {
    id: `${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    at,
    selection,
    text: input.text.slice(0, TEXT_MAX),
    source: input.source,
  };
  if (input.contextLine) entry.contextLine = input.contextLine.slice(0, 120);
  return entry;
}

/** Newest first, one entry per highlight, capped. */
export function addToHistory(list: readonly HistoryEntry[], entry: HistoryEntry, max = HISTORY_MAX): HistoryEntry[] {
  const key = entry.selection.toLowerCase();
  return [entry, ...list.filter((item) => item.selection.toLowerCase() !== key)].slice(0, max);
}

/** Accept only well-formed entries from storage; anything else is dropped. */
export function parseHistory(value: unknown): HistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const out: HistoryEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const e = item as Record<string, unknown>;
    if (typeof e.id !== "string" || typeof e.at !== "number" || typeof e.selection !== "string" || typeof e.text !== "string") continue;
    if (e.source !== "on_device" && e.source !== "in_cloud") continue;
    const entry: HistoryEntry = { id: e.id, at: e.at, selection: e.selection, text: e.text, source: e.source };
    if (typeof e.contextLine === "string") entry.contextLine = e.contextLine;
    out.push(entry);
  }
  return out.sort((a, b) => b.at - a.at).slice(0, HISTORY_MAX);
}

export function relativeTime(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

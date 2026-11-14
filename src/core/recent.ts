/** Recently viewed assets, on this device only. Tiny on purpose: the Account tab imports it without the catalog. */

export const RECENT_KEY = "atlas-explain-recent-assets";
export const RECENT_MAX = 10;
const ID_SHAPE = /^[a-z]+:[A-Z0-9:._/-]{1,40}$/;

export function readRecent(raw: string | null): string[] {
  try {
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && ID_SHAPE.test(v)).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function addRecent(list: readonly string[], id: string): string[] {
  return [id, ...list.filter((x) => x !== id)].slice(0, RECENT_MAX);
}

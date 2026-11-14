/**
 * The watchlist (docs/ux/MULTI_ASSET_CATALOG.md §5.6): asset ids a person wants to keep an eye on.
 * Signed out, it lives on this device. Signed in, it is one Firestore document,
 * users/{uid}/prefs/watchlist { ids, updatedAt }, so the rules can cap its size.
 * When someone signs in, the list from this device is merged into the account once.
 */

export const WATCHLIST_KEY = "atlas-explain-watchlist";
/** Hard cap, also enforced by firestore.rules. Plan limits (free 10, Pro 50) apply once billing is on. */
export const WATCHLIST_MAX = 50;
const ID_SHAPE = /^[a-z]+:[A-Z0-9:._/-]{1,40}$/;

/** Clean ids: well-formed, unique, at most WATCHLIST_MAX, order kept. */
export function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) {
    if (typeof v === "string" && ID_SHAPE.test(v) && !out.includes(v)) out.push(v);
    if (out.length >= WATCHLIST_MAX) break;
  }
  return out;
}

export function readLocal(raw: string | null): string[] {
  try {
    return cleanIds(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

/** Adds (to the front) or removes an id. Adding to a full list is refused, not silently trimmed. */
export function toggleId(list: readonly string[], id: string): { ids: string[]; added: boolean; full: boolean } {
  if (list.includes(id)) return { ids: list.filter((x) => x !== id), added: false, full: false };
  if (list.length >= WATCHLIST_MAX) return { ids: [...list], added: false, full: true };
  return { ids: [id, ...list], added: true, full: false };
}

/** Account list first, then anything new from this device, capped. */
export function mergeIds(account: readonly string[], device: readonly string[]): string[] {
  return cleanIds([...account, ...device]);
}

/** Mirrors the firestore.rules clause for users/{uid}/prefs/watchlist. */
export function watchlistWriteAllowed(data: Record<string, unknown>): boolean {
  const keys = Object.keys(data);
  return (
    keys.every((k) => k === "ids" || k === "updatedAt") &&
    Array.isArray(data.ids) &&
    data.ids.length <= WATCHLIST_MAX &&
    data.ids.every((x) => typeof x === "string" && x.length <= 48)
  );
}

/* ---------- the store used by the app and the extension ---------- */

export interface WatchlistRemote {
  /** The account's list, or null when nobody is signed in (anonymous counts as signed out). */
  load(): Promise<string[] | null>;
  save(ids: string[]): Promise<void>;
}

export interface KeyValue {
  get(): string | null;
  set(value: string): void;
}

export interface Watchlist {
  ids(): string[];
  has(id: string): boolean;
  /** Resolves to the outcome; "full" when the cap was reached. */
  toggle(id: string): Promise<"added" | "removed" | "full">;
  /** True when the list is kept in an account (synced), false when only on this device. */
  synced(): boolean;
  /** Re-reads the account (call after sign-in or sign-out). Merges this device's list in once. */
  sync(): Promise<void>;
  onChange(listener: () => void): () => void;
}

export function createWatchlist(local: KeyValue, remote: WatchlistRemote | null): Watchlist {
  let ids = readLocal(local.get());
  let inAccount = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const writeLocal = (next: string[]) => {
    try {
      local.set(JSON.stringify(next));
    } catch {
      // Private mode: the list lasts for this visit.
    }
  };

  async function sync(): Promise<void> {
    if (!remote) return;
    let account: string[] | null;
    try {
      account = await remote.load();
    } catch {
      return; // Offline or not ready: keep what we have.
    }
    if (account === null) {
      if (inAccount) {
        // Signed out: start from this device's own list again.
        inAccount = false;
        ids = readLocal(local.get());
        emit();
      }
      return;
    }
    const device = readLocal(local.get());
    const merged = mergeIds(cleanIds(account), device);
    inAccount = true;
    ids = merged;
    if (device.length) {
      await remote.save(merged).catch(() => undefined);
      writeLocal([]);
    }
    emit();
  }

  return {
    ids: () => [...ids],
    has: (id) => ids.includes(id),
    synced: () => inAccount,
    sync,
    async toggle(id) {
      const r = toggleId(ids, id);
      if (r.full) return "full";
      ids = r.ids;
      emit();
      if (inAccount && remote) await remote.save(ids).catch(() => undefined);
      else writeLocal(ids);
      return r.added ? "added" : "removed";
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** localStorage, guarded for private mode and the extension's no-DOM tests. */
export function localKeyValue(key: string = WATCHLIST_KEY): KeyValue {
  return {
    get: () => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (value) => localStorage.setItem(key, value),
  };
}

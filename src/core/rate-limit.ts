/**
 * Browser-side abuse guard for cloud explanations. It is a speed bump, not the
 * real limit: App Check enforcement on Firebase AI Logic and the per-user rate
 * limit set in the Firebase console are the server-side protections.
 *
 * While billing is off the app is free, so these numbers are generous and only
 * stop runaway loops or scripted abuse from one browser.
 */
export const CLOUD_PER_MINUTE = 8;
export const CLOUD_PER_DAY = 300;
export const RATE_KEY = "atlas-explain-cloud-calls";

export interface RateStore {
  get(): string | null;
  set(value: string): void;
}

export type RateDecision = { ok: true } | { ok: false; reason: string; retryAfterMs: number };

export function readStamps(raw: string | null, now: number): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((t): t is number => typeof t === "number" && Number.isFinite(t) && t <= now && now - t < 86_400_000).slice(-CLOUD_PER_DAY);
  } catch {
    return [];
  }
}

export function checkCloudRate(stamps: readonly number[], now: number, perMinute = CLOUD_PER_MINUTE, perDay = CLOUD_PER_DAY): RateDecision {
  const lastMinute = stamps.filter((t) => now - t < 60_000);
  if (lastMinute.length >= perMinute) {
    const retry = 60_000 - (now - Math.min(...lastMinute));
    return { ok: false, reason: `That is a lot of cloud explanations in a minute. Try again in ${Math.ceil(retry / 1000)} seconds. On-device answers are not limited.`, retryAfterMs: retry };
  }
  if (stamps.length >= perDay) {
    return { ok: false, reason: "This browser reached today's cloud explanation safety limit. It resets within 24 hours. On-device answers are not limited.", retryAfterMs: 86_400_000 - (now - Math.min(...stamps)) };
  }
  return { ok: true };
}

function safeGet(store: RateStore): string | null {
  try {
    return store.get();
  } catch {
    return null;
  }
}

/** Check and, when allowed, record one cloud call. Storage failures never block an answer. */
export function takeCloudSlot(store: RateStore, now: number = Date.now()): RateDecision {
  const stamps = readStamps(safeGet(store), now);
  const decision = checkCloudRate(stamps, now);
  if (decision.ok) {
    try {
      store.set(JSON.stringify([...stamps, now]));
    } catch {
      // Private mode: the server-side limits still apply.
    }
  }
  return decision;
}

/** Look without recording: used before a run that may or may not reach the cloud. */
export function peekCloudSlot(store: RateStore, now: number = Date.now()): RateDecision {
  try {
    return checkCloudRate(readStamps(store.get(), now), now);
  } catch {
    return { ok: true };
  }
}

/** Record a cloud call that actually happened. */
export function recordCloudCall(store: RateStore, now: number = Date.now()): void {
  try {
    store.set(JSON.stringify([...readStamps(store.get(), now), now]));
  } catch {
    // Private mode: the server-side limits still apply.
  }
}

export function localRateStore(key = RATE_KEY): RateStore {
  return {
    get: () => (typeof localStorage === "undefined" ? null : localStorage.getItem(key)),
    set: (value) => {
      if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
    },
  };
}

export class CloudRateLimited extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudRateLimited";
  }
}

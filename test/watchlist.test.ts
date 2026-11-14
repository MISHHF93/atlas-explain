import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  WATCHLIST_MAX,
  cleanIds,
  createWatchlist,
  mergeIds,
  readLocal,
  toggleId,
  watchlistWriteAllowed,
  type KeyValue,
  type WatchlistRemote,
} from "../src/core/watchlist";

const memory = (initial: string | null = null): KeyValue & { value: string | null } => {
  const kv = { value: initial, get: () => kv.value, set: (v: string) => { kv.value = v; } };
  return kv;
};

describe("watchlist lists", () => {
  it("keeps only well-formed, unique ids, capped", () => {
    expect(cleanIds(["crypto:BTC", "crypto:BTC", "<b>", 3, "fx:EURUSD"])).toEqual(["crypto:BTC", "fx:EURUSD"]);
    expect(cleanIds(Array.from({ length: 80 }, (_, i) => `stock:US:S${i}`))).toHaveLength(WATCHLIST_MAX);
    expect(readLocal("not json")).toEqual([]);
  });

  it("adds to the front, removes, and refuses to grow past the cap", () => {
    expect(toggleId(["a:A"], "b:B")).toEqual({ ids: ["b:B", "a:A"], added: true, full: false });
    expect(toggleId(["a:A", "b:B"], "a:A")).toEqual({ ids: ["b:B"], added: false, full: false });
    const full = Array.from({ length: WATCHLIST_MAX }, (_, i) => `stock:US:S${i}`);
    expect(toggleId(full, "crypto:BTC").full).toBe(true);
  });

  it("merges the account list first, then this device's new items", () => {
    expect(mergeIds(["crypto:BTC", "fx:EURUSD"], ["fx:EURUSD", "rate:US:10Y"])).toEqual(["crypto:BTC", "fx:EURUSD", "rate:US:10Y"]);
  });
});

describe("watchlist store", () => {
  it("stays on the device while signed out", async () => {
    const kv = memory();
    const w = createWatchlist(kv, null);
    expect(await w.toggle("crypto:BTC")).toBe("added");
    expect(JSON.parse(kv.value!)).toEqual(["crypto:BTC"]);
    expect(w.synced()).toBe(false);
  });

  it("merges this device's list into the account once on sign-in, then saves to the account", async () => {
    const kv = memory(JSON.stringify(["rate:US:10Y"]));
    let account: string[] | null = ["crypto:BTC"];
    const saved: string[][] = [];
    const remote: WatchlistRemote = { load: async () => account, save: async (ids) => { saved.push(ids); account = ids; } };
    const w = createWatchlist(kv, remote);
    let changes = 0;
    w.onChange(() => (changes += 1));
    await w.sync();
    expect(w.ids()).toEqual(["crypto:BTC", "rate:US:10Y"]);
    expect(w.synced()).toBe(true);
    expect(saved).toEqual([["crypto:BTC", "rate:US:10Y"]]);
    expect(JSON.parse(kv.value!)).toEqual([]);
    await w.toggle("fx:EURUSD");
    expect(saved.at(-1)).toEqual(["fx:EURUSD", "crypto:BTC", "rate:US:10Y"]);
    expect(changes).toBeGreaterThanOrEqual(2);
  });

  it("goes back to the device list on sign-out, and keeps working when the account can't be read", async () => {
    let account: string[] | null = ["crypto:BTC"];
    const kv = memory();
    const w = createWatchlist(kv, { load: async () => account, save: async () => undefined });
    await w.sync();
    expect(w.has("crypto:BTC")).toBe(true);
    account = null;
    await w.sync();
    expect(w.ids()).toEqual([]);
    const offline = createWatchlist(memory(JSON.stringify(["fx:EURUSD"])), { load: async () => { throw new Error("offline"); }, save: async () => undefined });
    await offline.sync();
    expect(offline.ids()).toEqual(["fx:EURUSD"]);
  });
});

describe("firestore.rules for the watchlist", () => {
  const rules = readFileSync("firestore.rules", "utf8");

  it("lets only the owner write one capped document", () => {
    expect(rules).toContain("match /users/{userId}/prefs/watchlist");
    expect(rules).toContain('request.resource.data.keys().hasOnly(["ids", "updatedAt"])');
    expect(rules).toContain(`request.resource.data.ids.size() <= ${WATCHLIST_MAX}`);
    expect(rules).toMatch(/match \/users\/\{userId\}\/prefs\/watchlist \{\s*allow create, update: if signedIn\(userId\)/);
  });

  it("mirrors the rule in code", () => {
    expect(watchlistWriteAllowed({ ids: ["crypto:BTC"], updatedAt: 1 })).toBe(true);
    expect(watchlistWriteAllowed({ ids: Array.from({ length: WATCHLIST_MAX + 1 }, () => "x"), updatedAt: 1 })).toBe(false);
    expect(watchlistWriteAllowed({ ids: [], updatedAt: 1, balance: 5 })).toBe(false);
    expect(watchlistWriteAllowed({ ids: "crypto:BTC" })).toBe(false);
  });
});

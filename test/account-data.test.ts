import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EXPORT_SCHEMA, LOCAL_DATA_KEYS, WEB_LEARN_KEY, buildExport, exportFileName, usageDeleteAllowed, utcDayId } from "../src/core/account-data";
import { RECENT_KEY } from "../src/core/catalog";
import { TEXT_HISTORY_KEY } from "../src/core/text-history";
import { WATCHLIST_KEY, createWatchlist } from "../src/core/watchlist";

const NOW = Date.parse("2026-11-14T10:00:00Z");

describe("download my data", () => {
  it("builds one readable file with everything we keep, and nothing account-shaped", () => {
    const file = buildExport({
      exportedAt: new Date(NOW),
      account: { uid: "u1", email: "a@example.com", displayName: "A", provider: "google" },
      settings: { theme: "dark" },
      watchlist: ["crypto:BTC"],
      savedExplanations: [{ id: "e1", symbol: "NVDA", summary: "…", accountNumber: "123", nested: { password: "x", ok: 1 } }],
      browserHistory: [{ text: "stop-limit order" }],
      recentlyViewed: ["fx:EURUSD"],
    });
    expect(file).toMatchObject({ schema: EXPORT_SCHEMA, exportedAt: "2026-11-14T10:00:00.000Z", watchlist: ["crypto:BTC"], settings: { theme: "dark" } });
    const text = JSON.stringify(file);
    expect(text).not.toMatch(/accountNumber|password/);
    expect(text).toContain('"ok":1');
    expect(exportFileName(new Date(NOW))).toBe("atlas-explain-data-2026-11-14.json");
  });
});

describe("delete my account", () => {
  it("lets past days' usage counters go, never today's", () => {
    expect(usageDeleteAllowed(utcDayId(NOW), NOW)).toBe(false);
    expect(usageDeleteAllowed("2026-11-13", NOW)).toBe(true);
    expect(usageDeleteAllowed("2026-11-13", Date.parse("2026-11-13T23:59:00Z"))).toBe(false);
    expect(usageDeleteAllowed("2025-01-01", NOW)).toBe(true);
    expect(usageDeleteAllowed("../x", NOW)).toBe(false);
  });

  it("is enforced by the Firestore rules, with the same 24-hour boundary", () => {
    const rules = readFileSync("firestore.rules", "utf8");
    const usage = rules.slice(rules.indexOf("match /users/{userId}/usage/{dayId}"), rules.indexOf("allow create: if signedIn(userId)\n        && isUsageDay(dayId)"));
    expect(usage).toMatch(/allow delete: if signedIn\(userId\)/);
    expect(usage).toContain("timestamp.date(int(dayId[0:4]), int(dayId[5:7]), int(dayId[8:10])) < request.time - duration.value(1, 'd')");
    // Explanations and prefs (settings, watchlist) are already owner-deletable.
    expect(rules).toMatch(/match \/users\/\{userId\}\/explanations\/\{explanationId\} \{\s*allow read, delete: if request\.auth != null && request\.auth\.uid == userId;/);
    expect(rules).toMatch(/match \/users\/\{userId\}\/prefs\/\{prefId\} \{\s*allow read: if signedIn\(userId\);\s*allow delete: if signedIn\(userId\);/);
  });

  it("clears exactly the keys the app keeps in the browser", () => {
    expect([...LOCAL_DATA_KEYS].sort()).toEqual([TEXT_HISTORY_KEY, WATCHLIST_KEY, RECENT_KEY, WEB_LEARN_KEY].sort());
  });

  it("drops the in-memory watchlist after this browser's copy is cleared", () => {
    let stored: string | null = JSON.stringify(["crypto:BTC"]);
    const w = createWatchlist({ get: () => stored, set: (v) => { stored = v; } }, null);
    expect(w.ids()).toEqual(["crypto:BTC"]);
    stored = null;
    w.reloadLocal();
    expect(w.ids()).toEqual([]);
  });
});

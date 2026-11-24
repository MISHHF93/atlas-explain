import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  changeWindowText,
  formatChange,
  formatPrice,
  mapLean,
  mapQuote,
  nextPollMs,
  sparkPath,
  POLL_CRYPTO_MS,
  POLL_STOCK_MS,
} from "../src/core/assets";


const box = JSON.parse(readFileSync("test/fixtures/atlas-catalog.json", "utf8")) as { capturedAt: string; list: unknown; details: Record<string, unknown> };
const NOW = Date.parse(box.capturedAt) + 60_000;
const TRADE = /\b(buy|sell)\b/i;

const lean = (over: Record<string, unknown> = {}) => ({
  horizon: "1h", horizonLabel: "Next hour", lean: "up", colour: "green", label: "Leans up",
  reason: "Model leans up on the paper shadow log over the next hour. Every gate passed.", sampleSize: 240, hitRate: 0.6, ...over,
});

describe("lean mapping", () => {
  it("keeps a fully evidenced lean", () => {
    expect(mapLean(lean())).toMatchObject({ colour: "green", lean: "up", label: "Leans up" });
    expect(mapLean(lean({ lean: "down", colour: "red", reason: "Model leans down. Every gate passed." }))).toMatchObject({ colour: "red", label: "Leans down" });
  });

  it("is grey by default and whenever evidence is thin or the payload disagrees", () => {
    expect(mapLean(null)).toMatchObject({ colour: "grey", lean: "none", label: "Not enough evidence" });
    expect(mapLean(lean({ sampleSize: 199 })).colour).toBe("grey");
    expect(mapLean(lean({ hitRate: 0.54 })).colour).toBe("grey");
    expect(mapLean(lean({ hitRate: 1.4 })).colour).toBe("grey");
    expect(mapLean(lean({ colour: "red" })).colour).toBe("grey");
    expect(mapLean(lean({ lean: "sideways" })).colour).toBe("grey");
    expect(mapLean(lean({ reason: "Time to buy now" })).colour).toBe("grey");
    expect(mapLean(lean({ sampleSize: 12 })).reason).toMatch(/12 of 200/);
  });

  it("never shows trade wording in a reason", () => {
    expect(mapLean(lean({ colour: "grey", lean: "none", reason: "sell everything" })).reason).not.toMatch(TRADE);
  });
});

describe("quotes and freshness", () => {
  const t = (msAgo: number) => new Date(NOW - msAgo).toISOString();

  it("labels crypto live and stocks daily", () => {
    expect(mapQuote({ status: "ok", price: 68563.2, changePct: -1.2, asOf: t(60_000), freshnessLabel: "Live from Kraken (24/7)" }, "crypto", NOW)).toMatchObject({ freshness: "live", freshnessLabel: "Live from Kraken (24/7)" });
    const s = mapQuote({ status: "ok", price: 348.49, changePct: 1.78, asOf: t(2 * 86_400_000), freshnessLabel: "Daily close (2026-11-10), updated next morning" }, "stock", NOW);
    expect(s.freshness).toBe("daily");
    expect(s.freshnessLabel).toMatch(/updated next morning/);
  });

  it("re-checks staleness on this side and rewrites a stale 'Live' label", () => {
    const q = mapQuote({ status: "ok", price: 100, changePct: 1, asOf: t(40 * 60_000), freshnessLabel: "Live from Kraken (24/7)" }, "crypto", NOW);
    expect(q.freshness).toBe("stale");
    expect(q.freshnessLabel).toMatch(/Stale/);
    expect(mapQuote({ status: "ok", price: 1, asOf: t(9 * 86_400_000) }, "stock", NOW).freshness).toBe("stale");
  });

  it("keeps missing numbers missing instead of zero-filling", () => {
    for (const raw of [null, {}, { status: "missing", price: null }, { status: "ok", price: 0, changePct: 0, asOf: t(0) }, { status: "ok", price: -3, asOf: t(0) }]) {
      const q = mapQuote(raw, "crypto", NOW);
      expect(q.freshness).toBe("missing");
      expect(q.price).toBeNull();
      expect(q.changePct).toBeNull();
    }
    expect(formatPrice(null)).toBe("—");
    expect(changeWindowText({ changeWindow: "24h" })).toBe("over 24h");
    expect(changeWindowText({ changeWindow: "since the 2026-11-06 close" })).toBe("since the 2026-11-06 close");
    expect(formatChange(null).text).toBe("—");
  });
});

describe("sparklines and polling", () => {
  it("draws a sparkline path, and nothing for no points", () => {
    expect(sparkPath([{ t: "2026-11-23T00:00:00Z", c: 1 }, { t: "2026-11-23T01:00:00Z", c: 2 }], 312, 64)).toMatch(/^M[\d.]+ [\d.]+ L/);
    expect(sparkPath([], 10, 10)).toBe("");
  });

  it("polls crypto about every 15 s, stocks every 15 min, and pauses when hidden", () => {
    expect(nextPollMs([{ klass: "crypto" }, { klass: "stock" }], true)).toBe(POLL_CRYPTO_MS);
    expect(nextPollMs([{ klass: "stock" }], true)).toBe(POLL_STOCK_MS);
    expect(nextPollMs([{ klass: "crypto" }], false)).toBeNull();
    expect(POLL_CRYPTO_MS).toBeGreaterThanOrEqual(10_000);
    expect(POLL_CRYPTO_MS).toBeLessThanOrEqual(15_000);
  });
});


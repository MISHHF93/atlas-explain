import { describe, expect, it } from "vitest";
import { liveSnapshot, snapshotBreadth, snapshotTime } from "../src/core/live-snapshot";
import type { AssetView, CatalogView } from "../src/core/assets";

function asset(symbol: string, changePct: number | null, freshness: "live" | "stale" = "live"): AssetView {
  return {
    symbol, name: symbol, klass: "crypto", sourceLabel: "Kraken", badge: freshness === "live" ? "Live" : "Stale",
    quote: { price: 10, changePct, changeWindow: "24h", asOf: "2026-11-13T23:00:00Z", freshness, freshnessLabel: "", reason: null },
    light: { colour: "grey", label: "", reason: "" } as unknown as AssetView["light"], leans: [],
  };
}
const catalog = (assets: AssetView[], source: CatalogView["source"] = "kraken"): CatalogView => ({ asOf: null, assets, missing: [], gateReason: "", stockCitation: null, source });

describe("live snapshot", () => {
  it("counts only live quotes and ranks moves by size either way", () => {
    const s = liveSnapshot(catalog([asset("A", -5), asset("B", 2), asset("C", 0), asset("D", 9, "stale"), asset("E", null), asset("F", -1)]))!;
    expect(s.counted).toBe(4);
    expect(s.total).toBe(6);
    expect([s.down, s.up, s.flat]).toEqual([2, 1, 1]);
    expect(s.movers.map((m) => m.symbol)).toEqual(["A", "B", "F"]);
    expect(s.source.text).toBe("Prices: Kraken");
    expect(snapshotBreadth(s)).toBe("2 down, 1 up, 1 flat of 4 live coins, over 24h");
  });
  it("says all when every coin moved the same way", () => {
    expect(snapshotBreadth({ counted: 10, up: 0, down: 10, flat: 0, window: "since 00:00 UTC" })).toBe("All 10 live coins down, since 00:00 UTC");
  });
  it("stays empty without a public live source or live quotes", () => {
    expect(liveSnapshot(null)).toBeNull();
    expect(liveSnapshot(catalog([asset("A", 1)], "atlas"))).toBeNull();
    expect(liveSnapshot(catalog([asset("A", 1, "stale")]))).toBeNull();
  });
  it("says when the time is unknown", () => {
    expect(snapshotTime(null)).toBe("time not reported");
    expect(snapshotTime("2026-11-13T23:00:00Z", "en-US")).toMatch(/\d/);
  });
});

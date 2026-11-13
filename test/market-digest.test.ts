import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ASSETS_SCHEMA, readCatalog, readGate } from "../src/core/assets";
import {
  MARKET_EMPTY,
  MARKET_NOT_CONNECTED,
  NOT_CONNECTED_YET,
  asOfLine,
  breadthLine,
  buildMarketDigest,
  pct,
  plainGateCheck,
  stillNeeded,
  trackRecord,
} from "../src/core/market-digest";
import { digestRowStatus } from "../src/core/digest";

const NOW = Date.parse("2026-11-13T21:34:00Z");
const GATE = { passed: false, failed: ["n_oos", "brier_beats_base_rate", "logloss_beats_base_rate", "shadow_weeks"], reason: "below the evidence gate", loaded: true, shadowWeeks: 2, requiredWeeks: 4 };

function crypto(symbol: string, changePct: number | null, n: number | null, hit: number | null, asOf = "2026-11-13T21:33:00Z") {
  const light = { horizon: "15m", horizonLabel: "Next 15 minutes", lean: "none", colour: "grey", label: "Not enough evidence", reason: "thin data", sampleSize: n, hitRate: hit };
  return { symbol, name: `${symbol} coin`, class: "crypto", source: { label: "Kraken spot" }, quote: { status: "ok", price: 10, changePct, changeWindow: "24h", asOf, freshness: "live" }, light, leans: [light] };
}
function stock(symbol: string, changePct: number) {
  const light = { horizon: "1d", horizonLabel: "Next session", lean: "none", colour: "grey", label: "Not enough evidence", reason: "thin data", sampleSize: 0, hitRate: null };
  return { symbol, name: `${symbol} Inc.`, class: "stock", source: { label: "IEX HIST (one venue, T+1)" }, quote: { status: "ok", price: 100, changePct, changeWindow: "since the 2026-11-11 close", asOf: "2026-11-12T00:00:00Z", freshness: "daily" }, light, leans: [light] };
}
const CITATION = "Data provided for free by IEX. By accessing or using IEX Historical Data, you agree to the IEX Historical Data Terms of Use. https://www.iex.io/legal/hist-data-terms";
function catalog(assets: unknown[], gate: unknown = GATE) {
  return readCatalog({ schema: ASSETS_SCHEMA, paperOnly: true, asOf: "2026-11-13T21:33:47Z", assets, gate, sources: { stock: { citation: CITATION } } }, NOW);
}

describe("readGate", () => {
  it("keeps only well-formed codes and never passes with failures listed", () => {
    expect(readGate({ passed: true, failed: ["pbo"] })?.passed).toBe(false);
    expect(readGate({ passed: false, failed: ["n_oos", "<img>", 3] })?.failed).toEqual(["n_oos"]);
    expect(readGate({ failed: [] })).toBeNull();
    expect(readGate(null)).toBeNull();
  });
});

describe("plain gate words", () => {
  it("translates codes and counts paper weeks", () => {
    expect(plainGateCheck("n_oos")).toBe("more out-of-sample results");
    expect(plainGateCheck("mystery")).toBe("another ATLAS check");
    const needed = stillNeeded(readGate(GATE));
    expect(needed).toContain("2 of 4 paper weeks so far");
    expect(needed.filter((n) => n.includes("base rate"))).toHaveLength(1);
    expect(stillNeeded(null)).toEqual([]);
  });
});

describe("buildMarketDigest", () => {
  it("is honestly not connected without a live catalog", () => {
    expect(buildMarketDigest(null)).toEqual({ kind: "not_connected", reason: MARKET_NOT_CONNECTED });
  });

  it("is empty, not filled in, when no quote is fresh", () => {
    const c = catalog([crypto("BTC-USD", null, 81, 0.9)]);
    expect(buildMarketDigest(c)).toEqual({ kind: "empty", reason: MARKET_EMPTY });
  });

  it("summarises breadth per class with source and time", () => {
    const c = catalog([crypto("BTC-USD", -4.5, 81, 0.963), crypto("TIA-USD", -8.73, 129, 0.6589), crypto("INJ-USD", 7.4, 140, 0.4857), stock("SMCI", -11.31), stock("AMD", 5.95)]);
    const d = buildMarketDigest(c);
    if (d.kind !== "ready") throw new Error(d.kind);
    const cr = d.classes.find((x) => x.klass === "crypto");
    expect(cr).toMatchObject({ total: 3, counted: 3, up: 1, down: 2, medianPct: -4.5, window: "24h", sourceLabel: "Kraken spot" });
    expect(breadthLine(cr!)).toBe("2 of 3 down over 24h · median −4.5%");
    expect(cr!.asOfLine).toMatch(/4:33\s?PM EST/);
    const st = d.classes.find((x) => x.klass === "stock");
    expect(st!.asOfLine).toBe("12 Nov close");
    expect(d.stockCitation).toBe(CITATION);
  });

  it("ranks movers by size either way and shows each track record", () => {
    const c = catalog([crypto("BTC-USD", -4.5, 81, 0.963), crypto("TIA-USD", -8.73, 129, 0.6589), crypto("INJ-USD", 7.4, 140, 0.4857)]);
    const d = buildMarketDigest(c, { moversPerClass: 2 });
    if (d.kind !== "ready") throw new Error(d.kind);
    expect(d.movers.map((m) => m.symbol)).toEqual(["TIA-USD", "INJ-USD"]);
    expect(d.movers[0]!.record.line).toBe("129 of 200 resolved paper calls, 66% right so far. Too few to count yet.");
    expect(d.movers[0]!.howWeKnow).toMatch(/^Kraken spot · .* · paper light: not enough evidence$/);
    expect(d.evidence.line).toBe("0 of 3 markets have cleared the evidence gate, so every light is grey. Closest: INJ-USD with 140 of 200 resolved calls.");
    expect(d.stockCitation).toBeNull();
    expect(d.notConnected).toEqual(NOT_CONNECTED_YET);
  });

  it("leaves stale quotes out and says how many", () => {
    const c = catalog([crypto("BTC-USD", -4.5, 81, 0.9), crypto("OLD-USD", 3, 10, 0.5, "2026-11-12T01:00:00Z")]);
    const d = buildMarketDigest(c);
    if (d.kind !== "ready") throw new Error(d.kind);
    expect(d.classes[0]).toMatchObject({ total: 2, counted: 1 });
    expect(d.movers.map((m) => m.symbol)).toEqual(["BTC-USD"]);
  });
});

describe("track record copy", () => {
  it("never shows a hit rate without its sample count", () => {
    const c = catalog([crypto("A-USD", 1, 0, null), crypto("B-USD", 1, null, null), crypto("C-USD", 1, 250, 0.6)]);
    const lines = c!.assets.map((a) => trackRecord(a).line);
    expect(lines[0]).toBe("No resolved paper calls yet (needs 200).");
    expect(lines[1]).toBe("Track record not reported by ATLAS.");
    expect(lines[2]).toBe("250 resolved paper calls, 60% right so far (gate: 200 calls and 55%).");
  });

  it("formats signed percents and never invents a time", () => {
    expect(pct(-2.595)).toBe("−2.6%");
    expect(pct(7.4)).toBe("+7.4%");
    expect(pct(0)).toBe("0.0%");
    expect(asOfLine("crypto", null)).toBe("time not reported");
  });

  it("uses no trade wording anywhere in the digest copy", () => {
    const src = readFileSync("src/core/market-digest.ts", "utf8") + readFileSync("src/wallet/market-digest.ts", "utf8");
    expect(src).not.toMatch(/\b(buy|sell|go long|go short|entry|exit|stop loss|take profit|target price)\b/i);
  });
});

describe("digest row with markets", () => {
  it("reads Today once the live catalog is in", () => {
    expect(digestRowStatus({ kind: "not_connected", reason: "x", today: "2026-11-13" }, true)).toEqual({ label: "Today", tone: "ready" });
  });

  it("feeds the digest only from the live catalog, never the preview file", () => {
    for (const path of ["extension/src/popup.ts", "src/web/app.ts"]) {
      const src = readFileSync(path, "utf8");
      expect(src).toMatch(/marketCatalog = state\.kind === "ready" && !(previewData|data)( && state\.catalog\.source !== "kraken")? \? state\.catalog : null/);
      expect(src).toContain("marketDigestCard(buildMarketDigest(marketCatalog))");
      expect(src).toContain("marketCard.replaceWith(next)");
    }
  });
});

import { describe, expect, it } from "vitest";
import { SOURCES, validateAsset, type Asset } from "../src/core/asset-schema";
import {
  CLASS_INFO,
  CLASS_ORDER,
  RECENT_MAX,
  addRecent,
  assetsFromLiveCatalog,
  explainAssetPrompt,
  findAsset,
  formatChange,
  formatValue,
  groupByClass,
  presentClasses,
  readRecent,
  searchAssets,
} from "../src/core/catalog";
import { readCoinGeckoMarkets } from "../src/core/coingecko";
import { ALL_TERMS } from "../src/core/terms";

const NOW = Date.parse("2026-11-13T21:00:00Z");
const btc = assetsFromLiveCatalog(readCoinGeckoMarkets([
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 68169.7, price_change_percentage_24h: -0.1, last_updated: "2026-11-13T20:59:00.000Z" },
  { id: "ethereum", symbol: "eth", name: "Ethereum", current_price: 2000, price_change_percentage_24h: 1.5, last_updated: "2026-11-13T20:59:00.000Z" },
], NOW)!);

const eurusd: Asset = {
  id: "fx:EURUSD", symbol: "EUR/USD", name: "Euro / US dollar", class: "forex", venue: "ECB", currency: "USD", country: null,
  session: { state: "closed", hours: null, nextChange: null },
  quote: { value: 1.0842, change: 0.0013, changePct: 0.12, changeWindow: "vs previous business day", asOf: "2026-11-13T15:00:00Z", mode: "reference", source: SOURCES.ecb },
  noQuoteReason: null, facts: [], status: { state: "none" }, relatedTerms: ["spread"],
  classData: { class: "forex", base: "EUR", quote: "USD", derived: false },
};
const us10y: Asset = {
  ...eurusd, id: "rate:US:10Y", symbol: "US10Y", name: "US 10-year Treasury yield", class: "rate", venue: "US Treasury", currency: "%", country: "US",
  quote: { value: 4.21, change: -0.03, changePct: null, changeWindow: "vs previous business day", asOf: "2026-11-13T22:00:00Z", mode: "reference", source: SOURCES.us_treasury },
  classData: { class: "rate", tenor: "10Y", curve: "US Treasury par" },
};
const all = [...btc, eurusd, us10y];

describe("public catalog", () => {
  it("turns the live crypto feed into valid assets", () => {
    expect(btc.map((a) => a.id)).toEqual(["crypto:BTC", "crypto:ETH"]);
    for (const a of btc) expect(validateAsset(a, NOW).errors).toEqual([]);
  });

  it("searches names, symbols (with or without the slash) and class names", () => {
    expect(searchAssets(all, "bitcoin", { klass: "all" }).map((a) => a.symbol)).toEqual(["BTC"]);
    expect(searchAssets(all, "eurusd", { klass: "all" }).map((a) => a.symbol)).toEqual(["EUR/USD"]);
    expect(searchAssets(all, "10-year", { klass: "all" }).map((a) => a.symbol)).toEqual(["US10Y"]);
    expect(searchAssets(all, "forex", { klass: "all" })).toHaveLength(1);
    expect(searchAssets(all, "", { klass: "crypto" })).toHaveLength(2);
    expect(searchAssets(all, "", { klass: "all", onlyIds: new Set(["rate:US:10Y"]) })).toEqual([us10y]);
  });

  it("groups by class in a fixed, calm order and offers only classes it has", () => {
    expect(groupByClass(all).map((g) => g.klass)).toEqual(["crypto", "forex", "rate"]);
    expect(presentClasses(all)).toEqual(["crypto", "forex", "rate"]);
  });

  it("finds an asset by symbol, slashless symbol or id", () => {
    expect(findAsset(all, "btc")?.id).toBe("crypto:BTC");
    expect(findAsset(all, "EURUSD")?.id).toBe("fx:EURUSD");
    expect(findAsset(all, "EUR/USD")?.id).toBe("fx:EURUSD");
    expect(findAsset(all, "rate:US:10Y")?.symbol).toBe("US10Y");
    expect(findAsset(all, "AAPL")).toBeUndefined();
  });

  it("formats each class its own way and never shows a missing value as zero", () => {
    expect(formatValue(btc[0]!)).toBe("$68,169.70");
    expect(formatValue(eurusd)).toBe("1.0842");
    expect(formatValue(us10y)).toBe("4.21%");
    expect(formatChange(us10y)).toEqual({ text: "−0.03 pt", tone: "down" });
    expect(formatChange(btc[0]!)).toEqual({ text: "−0.10%", tone: "down" });
    expect(formatValue({ ...eurusd, quote: null, noQuoteReason: "x" })).toBeNull();
  });

  it("keeps recently viewed short, unique and well-formed", () => {
    let list: string[] = [];
    for (let i = 0; i < 15; i += 1) list = addRecent(list, `crypto:C${i}`);
    expect(list).toHaveLength(RECENT_MAX);
    expect(addRecent(list, "crypto:C5")[0]).toBe("crypto:C5");
    expect(new Set(addRecent(list, "crypto:C5")).size).toBe(RECENT_MAX);
    expect(readRecent('["crypto:BTC","<script>",42]')).toEqual(["crypto:BTC"]);
    expect(readRecent("not json")).toEqual([]);
  });

  it("writes an education-only Explain prompt from public fields", () => {
    const q = explainAssetPrompt(eurusd);
    expect(q).toContain("Euro / US dollar");
    expect(q).toContain("reference data from ECB reference rate");
    expect(q).toMatch(/Do not recommend a trade\.$/);
    expect(q.replace("Do not recommend a trade.", "")).not.toMatch(/\b(buy|sell)\b/i);
    expect(explainAssetPrompt({ ...eurusd, quote: null, noQuoteReason: "x" })).toContain("no price shown");
  });

  it("has calm, trade-free copy for every class and links only to real glossary terms", () => {
    const ids = new Set(ALL_TERMS.map((t) => t.id));
    for (const k of CLASS_ORDER) {
      expect(CLASS_INFO[k].intro.length).toBeGreaterThan(40);
      expect(CLASS_INFO[k].intro).not.toMatch(/\b(buy|sell|you should)\b/i);
      for (const id of CLASS_INFO[k].learn) expect(ids.has(id), `${k}: ${id}`).toBe(true);
    }
  });
});

describe("asset addresses", () => {
  it("round-trips every public symbol through the app router", async () => {
    const { parseRoute, pathFor } = await import("../src/app/routes");
    for (const a of all) {
      const segment = a.symbol.replace("/", "");
      const route = parseRoute(pathFor({ kind: "asset", symbol: segment }));
      expect(route.kind, a.symbol).toBe("asset");
      expect(findAsset(all, (route as { symbol: string }).symbol)?.id).toBe(a.id);
    }
  });
});

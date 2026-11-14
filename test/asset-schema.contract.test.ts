import { describe, expect, it } from "vitest";
import {
  ASSET_CLASSES,
  NO_QUOTE_REASON,
  SOURCES,
  assetFromLiveRow,
  publicStatus,
  route,
  validateAsset,
  type Asset,
  type ModelInsight,
  type ProviderAdapter,
} from "../src/core/asset-schema";
import { readCoinGeckoMarkets } from "../src/core/coingecko";
import { readKrakenTicker } from "../src/core/kraken";

const NOW = Date.parse("2026-11-13T21:00:00Z");

const base = (over: Partial<Asset> = {}): Asset => ({
  id: "fx:EURUSD",
  symbol: "EUR/USD",
  name: "Euro / US dollar",
  class: "forex",
  venue: "ECB",
  currency: "USD",
  country: null,
  session: { state: "closed", hours: "Reference rate, published once a business day", nextChange: null },
  quote: { value: 1.0842, change: 0.0013, changePct: 0.12, changeWindow: "vs previous business day", asOf: "2026-11-13T15:00:00Z", mode: "reference", source: SOURCES.ecb },
  noQuoteReason: null,
  facts: [],
  status: { state: "none" },
  relatedTerms: ["pip", "reference_rate"],
  classData: { class: "forex", base: "EUR", quote: "USD", derived: false },
  ...over,
});

describe("Asset schema contract", () => {
  it("accepts a well-formed asset with an attributed, displayable source", () => {
    expect(validateAsset(base(), NOW)).toEqual({ ok: true, errors: [] });
  });

  it("requires a plain reason whenever no figure is shown, and never a zero-filled price", () => {
    expect(validateAsset(base({ quote: null, noQuoteReason: null }), NOW).ok).toBe(false);
    expect(validateAsset(base({ quote: null, noQuoteReason: NO_QUOTE_REASON.forex }), NOW).ok).toBe(true);
    const zero = base();
    zero.quote = { ...zero.quote!, value: 0 };
    expect(validateAsset(zero, NOW).errors.join(" ")).toMatch(/must be null, not zero/);
  });

  it("refuses figures without attribution, with a non-display licence, or dated in the future", () => {
    const noLink = base();
    noLink.quote = { ...noLink.quote!, source: { ...SOURCES.ecb, attribution: { text: "", href: "" } } };
    expect(validateAsset(noLink, NOW).ok).toBe(false);
    const locked = base();
    locked.quote = { ...locked.quote!, source: { ...SOURCES.ecb, licence: { ...SOURCES.ecb.licence, displayAllowed: false } } };
    expect(validateAsset(locked, NOW).errors.join(" ")).toMatch(/does not allow display/);
    const future = base();
    future.quote = { ...future.quote!, asOf: "2026-11-14T21:00:00Z" };
    expect(validateAsset(future, NOW).ok).toBe(false);
  });

  it("rejects account-shaped fields and trade wording anywhere in the record", () => {
    const leaky = { ...base(), accountBalance: 10 } as unknown as Asset;
    expect(validateAsset(leaky, NOW).errors.join(" ")).toMatch(/account-shaped/);
    expect(validateAsset(base({ name: "You should buy euros" }), NOW).errors.join(" ")).toMatch(/trade wording/);
  });

  it("only shows model insights that are cleared for public use", () => {
    const insight = (cleared: boolean): ModelInsight => ({
      modelId: "atlas.signal15", assetId: "crypto:BTC", horizon: "1h", output: { kind: "direction", lean: "up" },
      trackRecord: { resolved: 81, hitRate: 0.6, since: "2026-10-01", brierVsBase: null }, confidence: null,
      clearedForPublic: cleared, reason: "Needs 200 resolved calls; has 81", asOf: "2026-11-13T20:00:00Z",
    });
    expect(publicStatus([insight(false)], "Not cleared")).toEqual({ state: "withheld", reason: "Not cleared" });
    expect(publicStatus([insight(true), insight(false)], "x")).toMatchObject({ state: "shown", insights: [{ clearedForPublic: true }] });
    expect(publicStatus([], "x")).toEqual({ state: "none" });
    expect(validateAsset(base({ status: { state: "shown", insights: [insight(false)] } }), NOW).ok).toBe(false);
  });

  it("has a plain no-price reason for every class", () => {
    for (const klass of ASSET_CLASSES) expect(NO_QUOTE_REASON[klass].length).toBeGreaterThan(20);
  });

  it("gives every free source an https attribution and a licence that allows display", () => {
    for (const source of Object.values(SOURCES)) {
      expect(source.attribution.href).toMatch(/^https:\/\//);
      expect(source.licence.displayAllowed).toBe(true);
      expect(source.licence.mlAllowed).toBe(false);
    }
  });
});

describe("routing", () => {
  const adapters: ProviderAdapter[] = [
    { id: "kraken", classes: ["crypto"], mode: "live", costTier: "free", flag: "provider_kraken", limits: { perMinute: 60, batchSize: 50 }, cacheTtlMs: 60_000 },
    { id: "coingecko", classes: ["crypto"], mode: "live", costTier: "free", flag: "provider_coingecko", limits: { perMinute: 30, batchSize: 250 }, cacheTtlMs: 60_000 },
    { id: "ecb", classes: ["forex"], mode: "reference", costTier: "free", flag: "provider_ecb", limits: { perMinute: 10, batchSize: 50 }, cacheTtlMs: 3_600_000 },
    { id: "boc", classes: ["forex", "rate"], mode: "reference", costTier: "free", flag: "provider_boc", limits: { perMinute: 10, batchSize: 50 }, cacheTtlMs: 3_600_000 },
  ];
  const on = { provider_kraken: true, provider_coingecko: true, provider_ecb: true, provider_boc: false };

  it("picks only enabled adapters for the class", () => {
    expect(route("forex", adapters, { flags: on, billingEnabled: false }).map((a) => a.id)).toEqual(["ecb"]);
    expect(route("stock", adapters, { flags: on, billingEnabled: false })).toEqual([]);
  });

  it("drops demo-only sources once the product charges money", () => {
    expect(route("crypto", adapters, { flags: on, billingEnabled: false }).map((a) => a.id)).toEqual(["kraken", "coingecko"]);
    expect(route("crypto", adapters, { flags: on, billingEnabled: true }).map((a) => a.id)).toEqual(["coingecko"]);
  });
});

describe("today's live crypto feeds meet the contract", () => {
  it("maps CoinGecko rows to valid assets with attribution", () => {
    const catalog = readCoinGeckoMarkets([
      { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 90000, price_change_percentage_24h: 2.27, last_updated: "2026-11-13T20:59:00.000Z" },
    ], NOW)!;
    const asset = assetFromLiveRow(catalog.assets[0]!, catalog.source)!;
    expect(asset.id).toBe("crypto:BTC");
    expect(asset.quote?.source.attribution.text).toBe("Prices by CoinGecko");
    expect(asset.status.state).toBe("withheld");
    expect(validateAsset(asset, NOW)).toEqual({ ok: true, errors: [] });
  });

  it("maps Kraken rows to valid assets", () => {
    const catalog = readKrakenTicker({ error: [], result: { XXBTZUSD: { c: ["90000.0", "0.1"], o: "88000.0" }, XETHZUSD: { c: ["2000.0", "1"], o: "2100.0" } } }, NOW)!;
    expect(catalog.assets).toHaveLength(2);
    for (const view of catalog.assets) {
      const asset = assetFromLiveRow(view, catalog.source)!;
      expect(asset.quote?.source.providerId).toBe("kraken");
      expect(validateAsset(asset, NOW).errors).toEqual([]);
    }
  });

  it("keeps ATLAS rows out of the public catalog", () => {
    const catalog = readCoinGeckoMarkets([
      { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 90000, price_change_percentage_24h: 1, last_updated: "2026-11-13T20:59:00.000Z" },
    ], NOW)!;
    expect(assetFromLiveRow(catalog.assets[0]!, "atlas")).toBeNull();
  });
});

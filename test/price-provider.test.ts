import { describe, expect, it } from "vitest";
import type { Fetcher } from "../src/core/assets";
import {
  DEFAULT_PRICE_PROVIDER,
  PRICE_CACHE_MS,
  createPriceCache,
  isLivePriceSource,
  loadLiveCatalog,
  parsePriceProvider,
  priceAttribution,
  priceFeedFromRemoteValues,
  readCoinGeckoDemoKey,
} from "../src/core/price-provider";

const NOW = Date.parse("2026-11-13T21:00:00Z");
const krakenTicker = {
  error: [],
  result: { XXBTZUSD: { c: ["90000.0", "0.1"], o: "88000.0" } },
};
const markets = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 91000, price_change_percentage_24h: 1, last_updated: "2026-11-13T21:00:00.000Z" },
];
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

describe("price provider selection", () => {
  it("defaults to CoinGecko and only accepts known ids", () => {
    expect(parsePriceProvider(undefined)).toBe(DEFAULT_PRICE_PROVIDER);
    expect(DEFAULT_PRICE_PROVIDER).toBe("coingecko");
    expect(parsePriceProvider("")).toBe("coingecko");
    expect(parsePriceProvider("kraken")).toBe("kraken");
    expect(parsePriceProvider("CoinGecko")).toBe("coingecko");
    expect(parsePriceProvider("not-a-feed")).toBe("coingecko");
    expect(isLivePriceSource("kraken")).toBe(true);
    expect(isLivePriceSource("coingecko")).toBe(true);
    expect(isLivePriceSource("atlas")).toBe(false);
    expect(isLivePriceSource(undefined)).toBe(false);
  });

  it("reads Remote Config values and drops a junk demo key", () => {
    expect(priceFeedFromRemoteValues({})).toEqual({ provider: "coingecko", coinGeckoDemoKey: undefined, logoDevToken: undefined });
    expect(priceFeedFromRemoteValues({ price_provider: "kraken", coingecko_demo_api_key: "CG-ABCDEFGH", logo_dev_token: "pk_abcdefgh123" })).toEqual({
      provider: "kraken",
      coinGeckoDemoKey: "CG-ABCDEFGH",
      logoDevToken: "pk_abcdefgh123",
    });
    // Only publishable keys: a secret key (sk_) must never be accepted for use in the browser.
    expect(priceFeedFromRemoteValues({ logo_dev_token: "sk_secretsecret" }).logoDevToken).toBeUndefined();
    expect(readCoinGeckoDemoKey("")).toBeUndefined();
    expect(readCoinGeckoDemoKey("short")).toBeUndefined();
    expect(readCoinGeckoDemoKey("spaces are wrong")).toBeUndefined();
  });

  it("shows the required visible attribution with a source link", () => {
    expect(priceAttribution("coingecko")).toEqual({ text: "Prices by CoinGecko", href: "https://www.coingecko.com" });
    expect(priceAttribution("kraken")).toEqual({ text: "Prices: Kraken", href: "https://www.kraken.com" });
    expect(priceAttribution("atlas")).toBeNull();
  });

  it("dispatches to the selected provider", async () => {
    const seen: string[] = [];
    const fetcher: Fetcher = async (url) => {
      seen.push(String(url));
      return json(String(url).includes("coingecko") ? markets : krakenTicker);
    };
    const kraken = await loadLiveCatalog({ provider: "kraken" }, fetcher, NOW, 8000, createPriceCache());
    expect(kraken.kind).toBe("ready");
    if (kraken.kind === "ready") expect(kraken.catalog.source).toBe("kraken");
    const gecko = await loadLiveCatalog({ provider: "coingecko" }, fetcher, NOW, 8000, createPriceCache());
    expect(gecko.kind).toBe("ready");
    if (gecko.kind === "ready") {
      expect(gecko.catalog.source).toBe("coingecko");
      expect(gecko.catalog.assets[0]?.quote.price).toBe(91000);
    }
    expect(seen.some((url) => url.includes("api.kraken.com"))).toBe(true);
    expect(seen.some((url) => url.includes("api.coingecko.com"))).toBe(true);
  });

  it("caches a ready catalog for 60 seconds and still retries after an error", async () => {
    let calls = 0;
    const fetcher: Fetcher = async () => {
      calls += 1;
      if (calls === 1) return json({}, 503);
      return json(krakenTicker);
    };
    const cache = createPriceCache();
    const first = await loadLiveCatalog({ provider: "kraken" }, fetcher, NOW, 8000, cache);
    expect(first.kind).toBe("error");
    expect(calls).toBe(1);
    const second = await loadLiveCatalog({ provider: "kraken" }, fetcher, NOW + 1000, 8000, cache);
    expect(second.kind).toBe("ready");
    expect(calls).toBe(2);
    const third = await loadLiveCatalog({ provider: "kraken" }, fetcher, NOW + 1000 + PRICE_CACHE_MS - 1, 8000, cache);
    expect(third.kind).toBe("ready");
    expect(calls).toBe(2);
    await loadLiveCatalog({ provider: "kraken" }, fetcher, NOW + 1000 + PRICE_CACHE_MS, 8000, cache);
    expect(calls).toBe(3);
  });
});

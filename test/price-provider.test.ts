import { beforeEach, describe, expect, it } from "vitest";
import type { Fetcher } from "../src/core/assets";
import { resetCapturedCache } from "../src/core/captured-prices";
import { CRYPTO_DATA_URL } from "../src/core/links";
import {
  isLivePriceSource,
  loadLiveCatalog,
  loadLiveChart,
  loadLiveDetail,
  PRICES_UNAVAILABLE,
  priceAttribution,
  priceFeedFromRemoteValues,
} from "../src/core/price-provider";

// Prices in the web app come from one place: the file ATLAS Explain's data job captures (the same one
// the connector reads). The browser never asks Kraken's or CoinGecko's REST APIs itself.
const AT = "2026-11-13T20:55:00.000Z";
const NOW = Date.parse("2026-11-13T21:00:00Z");
const sec = (iso: string) => Date.parse(iso) / 1000;
const file = (asOf = AT, source: "kraken" | "coingecko" = "coingecko") => ({
  schema: "atlas-explain-crypto-v1",
  generatedAt: asOf,
  prices: { source, asOf, coins: [{ symbol: "BTC", name: "Bitcoin", priceUsd: 91000, changePct: 1, changeWindow: "over 24 hours" }] },
  history: { source, asOf, interval: "1h", series: { BTC: [[sec("2026-11-13T19:00:00Z"), 90500], [sec("2026-11-13T20:00:00Z"), 90800]] } },
});
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });
const serving = (body: unknown, seen: string[] = []): Fetcher => async (url) => {
  seen.push(String(url));
  return String(url) === CRYPTO_DATA_URL ? json(body) : json({ error: "not this" }, 500);
};
beforeEach(() => resetCapturedCache());

describe("one price source", () => {
  it("reads the captured file and asks nothing else", async () => {
    const seen: string[] = [];
    const state = await loadLiveCatalog({}, serving(file(), seen), NOW);
    expect(state.kind).toBe("ready");
    expect(state.kind === "ready" && state.catalog.assets[0]?.quote.price).toBe(91000);
    expect(seen).toEqual([CRYPTO_DATA_URL]);
  });

  it("says plainly when the file is missing or too old, instead of fetching from somewhere else", async () => {
    expect(await loadLiveCatalog({}, async () => json({}, 404), NOW)).toEqual({ kind: "error", reason: PRICES_UNAVAILABLE });
    resetCapturedCache();
    expect(await loadLiveCatalog({}, serving(file("2026-11-13T19:00:00.000Z")), NOW)).toMatchObject({ kind: "error" });
  });

  it("draws charts and the detail sparkline from the captured hourly closes", async () => {
    expect(await loadLiveChart("BTC", 1, {}, serving(file()), NOW)).toHaveLength(2);
    resetCapturedCache();
    const d = await loadLiveDetail("BTC", {}, serving(file()), NOW);
    expect(d?.spark.points).toHaveLength(2);
    expect(d?.citation).toContain("Collected by ATLAS Explain");
    resetCapturedCache();
    expect(await loadLiveDetail("NOPE", {}, serving(file()), NOW)).toBeNull();
  });

  it("names where captured prices came from, with the visible attribution CoinGecko requires", () => {
    expect(isLivePriceSource("kraken")).toBe(true);
    expect(isLivePriceSource("coingecko")).toBe(true);
    expect(isLivePriceSource("atlas")).toBe(false);
    expect(priceAttribution("coingecko")).toEqual({ text: "Prices by CoinGecko", href: "https://www.coingecko.com" });
    expect(priceAttribution("kraken")?.text).toBe("Prices: Kraken");
  });

  it("reads only the Logo.dev key from Remote Config, and refuses a secret key", () => {
    expect(priceFeedFromRemoteValues({})).toEqual({ logoDevToken: undefined });
    expect(priceFeedFromRemoteValues({ logo_dev_token: "pk_abcdefgh123" }).logoDevToken).toBe("pk_abcdefgh123");
    expect(priceFeedFromRemoteValues({ logo_dev_token: "sk_secretsecret" }).logoDevToken).toBeUndefined();
  });
});

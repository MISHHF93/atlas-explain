import { describe, expect, it } from "vitest";
import { COINGECKO_COINS } from "../src/core/coingecko";
import { KRAKEN_PAIRS } from "../src/core/kraken";
import { CRYPTO_COINS, parseCoinGeckoChart, parseCoinGeckoMarkets, parseKrakenOhlc, parseKrakenTicker, readCryptoFile } from "../src/data/crypto";

describe("crypto data on ATLAS Explain's own data site", () => {
  it("keeps one list of coins, which the app's CoinGecko and Kraken lists come from", () => {
    expect(CRYPTO_COINS).toHaveLength(10);
    expect(COINGECKO_COINS.map((c) => c.id)).toEqual(CRYPTO_COINS.map((c) => c.coingeckoId));
    expect(KRAKEN_PAIRS.map((p) => p.pair)).toEqual(CRYPTO_COINS.map((c) => c.krakenPair));
  });

  it("reads Kraken and CoinGecko as they answer, and drops anything malformed", () => {
    const ticker = parseKrakenTicker({ error: [], result: { XXBTZUSD: { c: ["64000.0", "0.1"], o: "62000.0" }, SOLUSD: { c: ["oops"] } } });
    expect(ticker).toEqual([{ symbol: "BTC", name: "Bitcoin", priceUsd: 64000, changePct: 3.23, changeWindow: "since 00:00 UTC" }]);
    expect(parseKrakenTicker({ error: ["EGeneral:Too many requests"], result: {} })).toEqual([]);
    expect(parseKrakenOhlc({ error: [], result: { XXBTZUSD: [[1700000000, "1", "1", "1", "61000.5"], [1700003600, "1", "1", "1", "x"]], last: 1 } })).toEqual([[1700000000, 61000.5]]);
    expect(parseCoinGeckoMarkets([{ id: "ethereum", current_price: 1800, price_change_percentage_24h: 4.567 }])).toEqual([{ symbol: "ETH", name: "Ethereum", priceUsd: 1800, changePct: 4.57, changeWindow: "in the last 24 hours" }]);
    expect(parseCoinGeckoChart({ prices: [[1700000000000, 2400], [1700003600000, -1]] })).toEqual([[1700000000, 2400]]);
  });

  it("accepts only a well-formed published file", () => {
    const asOf = "2026-11-15T11:30:00Z";
    const good = { schema: "atlas-explain-crypto-v1", generatedAt: asOf, prices: { source: "kraken", asOf, coins: [{ symbol: "BTC", name: "Bitcoin", priceUsd: 65000, changePct: null, changeWindow: "since 00:00 UTC" }, { symbol: "FAKE", name: "Fake", priceUsd: 1, changePct: 0, changeWindow: "x" }] }, history: { source: "kraken", asOf, interval: "1h", series: { BTC: [[1, 2], [3, 4]], ETH: [[1, 2]] } } };
    const file = readCryptoFile(good)!;
    expect(file.prices.coins.map((c) => c.symbol)).toEqual(["BTC"]);
    expect(Object.keys(file.history.series)).toEqual(["BTC"]);
    expect(readCryptoFile({ ...good, schema: "other" })).toBeNull();
    expect(readCryptoFile({ ...good, prices: { ...good.prices, source: "somewhere" } })).toBeNull();
  });
});

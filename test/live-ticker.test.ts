import { describe, expect, it } from "vitest";
import { capturedCatalog } from "../src/core/captured-prices";
import { STREAM_SYMBOLS, TICK_FRESH_MS, readStreamMessage, withTicks, type Tick } from "../src/core/live-ticker";
import { CRYPTO_COINS, CRYPTO_SCHEMA } from "../src/data/crypto";
import { readFileSync } from "node:fs";

const NOW = Date.parse("2026-11-16T13:00:00Z");
const captured = capturedCatalog(
  {
    schema: CRYPTO_SCHEMA,
    generatedAt: "2026-11-16T12:58:00Z",
    prices: {
      source: "kraken",
      asOf: "2026-11-16T12:58:00Z",
      coins: [
        // Up 2% since 00:00 UTC: the day opened at 100.
        { symbol: "BTC", name: "Bitcoin", priceUsd: 102, changePct: 2, changeWindow: "since 00:00 UTC" },
        { symbol: "ETH", name: "Ethereum", priceUsd: 2000, changePct: null, changeWindow: "since 00:00 UTC" },
      ],
    },
    history: { source: "kraken", asOf: "2026-11-16T12:58:00Z", interval: "1h", series: {} },
  },
  NOW,
)!;

describe("real-time prices from Kraken's public stream", () => {
  it("knows all ten coins by their stream names", () => {
    expect(Object.values(STREAM_SYMBOLS).sort()).toEqual(CRYPTO_COINS.map((c) => c.symbol).sort());
    expect(STREAM_SYMBOLS["DOGE/USD"]).toBe("DOGE");
  });

  it("reads ticker updates and ignores everything else", () => {
    const into = new Map<string, Tick>();
    const msg = JSON.stringify({ channel: "ticker", type: "update", data: [{ symbol: "BTC/USD", last: 104.5 }, { symbol: "FOO/USD", last: 1 }, { symbol: "ETH/USD", last: -1 }] });
    expect(readStreamMessage(msg, NOW, into)).toBe(1);
    expect(into.get("BTC")).toEqual({ price: 104.5, at: NOW });
    expect(readStreamMessage('{"channel":"heartbeat"}', NOW, into)).toBe(0);
    expect(readStreamMessage("not json", NOW, into)).toBe(0);
  });

  it("moves the price live but keeps the captured change window, from the same baseline", () => {
    const ticks = new Map<string, Tick>([["BTC", { price: 103, at: NOW - 1_000 }], ["ETH", { price: 2010, at: NOW - 1_000 }]]);
    const live = withTicks(captured, NOW, ticks);
    const btc = live.assets.find((a) => a.symbol === "BTC")!;
    expect(btc.quote.price).toBe(103);
    expect(btc.quote.changePct).toBe(3); // (103 - 100) / 100, still "since 00:00 UTC"
    expect(btc.quote.changeWindow).toBe("since 00:00 UTC");
    expect(btc.quote.freshnessLabel).toMatch(/Live from Kraken/);
    // Without a captured change there is no baseline, so no change is invented.
    expect(live.assets.find((a) => a.symbol === "ETH")!.quote.changePct).toBeNull();
    expect(live.asOf).toBe(new Date(NOW - 1_000).toISOString());
  });

  it("drops a stalled stream back to the captured prices", () => {
    const old = new Map<string, Tick>([["BTC", { price: 999, at: NOW - TICK_FRESH_MS - 1 }]]);
    expect(withTicks(captured, NOW, old)).toBe(captured);
  });

  it("is allowed by the site's security policy, and only Kraken's stream is", () => {
    const csp = JSON.stringify(JSON.parse(readFileSync("firebase.json", "utf8")).hosting.headers);
    expect(csp).toContain("wss://ws.kraken.com");
    expect(csp.match(/wss:\/\//g)).toHaveLength(1);
  });
});

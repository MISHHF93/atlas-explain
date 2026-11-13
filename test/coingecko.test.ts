import { describe, expect, it } from "vitest";
import type { Fetcher } from "../src/core/assets";
import {
  COINGECKO_GREY_REASON,
  coinGeckoHeaders,
  loadCoinGeckoCatalog,
  loadCoinGeckoDetail,
  readCoinGeckoChart,
  readCoinGeckoMarkets,
} from "../src/core/coingecko";

const NOW = Date.parse("2026-11-13T21:00:00Z");
const markets = [
  { id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 90000, price_change_percentage_24h: 2.27, last_updated: "2026-11-13T21:00:00.000Z" },
  { id: "ethereum", symbol: "eth", name: "Ethereum", current_price: 2000, price_change_percentage_24h: -4.76, last_updated: "2026-11-13T21:00:00.000Z" },
  { id: "solana", symbol: "sol", name: "Solana", current_price: 0, price_change_percentage_24h: 1, last_updated: "2026-11-13T21:00:00.000Z" },
];
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

describe("CoinGecko public prices", () => {
  it("maps real market rows and drops coins without a price", () => {
    const catalog = readCoinGeckoMarkets(markets, NOW)!;
    expect(catalog.source).toBe("coingecko");
    expect(catalog.assets.map((a) => a.symbol)).toEqual(["BTC", "ETH"]);
    const btc = catalog.assets[0]!;
    expect(btc.quote.price).toBe(90000);
    expect(btc.quote.changePct).toBeCloseTo(2.27, 2);
    expect(btc.quote.freshness).toBe("live");
    expect(btc.badge).toBe("Live");
    expect(btc.sourceLabel).toBe("CoinGecko");
    expect(btc.light.colour).toBe("grey");
    expect(btc.light.reason).toBe(COINGECKO_GREY_REASON);
    expect(catalog.missing[0]?.klass).toBe("stock");
  });

  it("refuses unusable payloads instead of inventing numbers", () => {
    expect(readCoinGeckoMarkets([])).toBeNull();
    expect(readCoinGeckoMarkets({ bitcoin: { usd: 1 } })).toBeNull();
    expect(readCoinGeckoMarkets("nope")).toBeNull();
  });

  it("turns network failure and rate limits into an honest error state, never throws", async () => {
    const down: Fetcher = async () => { throw new TypeError("offline"); };
    const s = await loadCoinGeckoCatalog(down, NOW);
    expect(s.kind).toBe("error");
    if (s.kind === "error") {
      expect(s.title).toMatch(/Live prices could not be loaded/);
      expect(s.reason).toMatch(/not answering/);
    }
    const limited: Fetcher = async () => json({}, 429);
    const rate = await loadCoinGeckoCatalog(limited, NOW);
    expect(rate.kind).toBe("error");
    if (rate.kind === "error") expect(rate.reason).toMatch(/rate-limited/);
    const bad: Fetcher = async () => json({}, 503);
    expect((await loadCoinGeckoCatalog(bad, NOW)).kind).toBe("error");
    const ok: Fetcher = async () => json(markets);
    const ready = await loadCoinGeckoCatalog(ok, NOW);
    expect(ready.kind).toBe("ready");
  });

  it("reads the sparkline and the detail sheet, and ignores unknown symbols", async () => {
    const chart = { prices: [[1763067600000, 89000.5], [1763071200000, 90000]] };
    expect(readCoinGeckoChart(chart)).toHaveLength(2);
    const f: Fetcher = async (url) => json(String(url).includes("market_chart") ? chart : markets);
    const detail = await loadCoinGeckoDetail("BTC", f, NOW);
    expect(detail?.spark.points).toHaveLength(2);
    expect(detail?.citation).toMatch(/CoinGecko/);
    expect(await loadCoinGeckoDetail("NVDA", f, NOW)).toBeNull();
  });

  it("sends an optional demo key as a header and never puts it in the URL", () => {
    expect(coinGeckoHeaders()).toEqual({ Accept: "application/json" });
    expect(coinGeckoHeaders("CG-DEMOKEY1")).toEqual({
      Accept: "application/json",
      "x-cg-demo-api-key": "CG-DEMOKEY1",
    });
  });
});

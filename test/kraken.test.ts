import { describe, expect, it } from "vitest";
import type { Fetcher } from "../src/core/assets";
import { KRAKEN_GREY_REASON, loadKrakenCatalog, loadKrakenDetail, readKrakenOhlc, readKrakenTicker } from "../src/core/kraken";
import { connectionCopy } from "../src/core/popup-copy";

const NOW = Date.parse("2026-11-13T21:00:00Z");
const ticker = {
  error: [],
  result: {
    XXBTZUSD: { c: ["90000.0", "0.1"], o: "88000.0" },
    XETHZUSD: { c: ["2000.0", "1"], o: "2100.0" },
    SOLUSD: { c: ["0", "1"], o: "80" },
  },
};
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status });

describe("Kraken public prices", () => {
  it("maps real ticker rows and drops pairs without a price", () => {
    const c = readKrakenTicker(ticker, NOW)!;
    expect(c.source).toBe("kraken");
    expect(c.assets.map((a) => a.symbol)).toEqual(["BTC", "ETH"]);
    const btc = c.assets[0]!;
    expect(btc.quote.price).toBe(90000);
    expect(btc.quote.changePct).toBeCloseTo(2.27, 2);
    expect(btc.quote.freshness).toBe("live");
    expect(btc.badge).toBe("Live");
    expect(btc.light.colour).toBe("grey");
    expect(btc.light.reason).toBe(KRAKEN_GREY_REASON);
    expect(c.missing[0]?.klass).toBe("stock");
  });

  it("refuses error payloads instead of inventing numbers", () => {
    expect(readKrakenTicker({ error: ["EGeneral:Too many requests"], result: {} })).toBeNull();
    expect(readKrakenTicker({ error: [], result: {} })).toBeNull();
    expect(readKrakenTicker("nope")).toBeNull();
  });

  it("turns network failure into an honest error state, never throws", async () => {
    const down: Fetcher = async () => { throw new TypeError("offline"); };
    const s = await loadKrakenCatalog(down, NOW);
    expect(s.kind).toBe("error");
    const bad: Fetcher = async () => json({}, 503);
    expect((await loadKrakenCatalog(bad, NOW)).kind).toBe("error");
    const ok: Fetcher = async () => json(ticker);
    const r = await loadKrakenCatalog(ok, NOW);
    expect(r.kind).toBe("ready");
  });

  it("reads hourly closes for the sparkline and the detail sheet", async () => {
    const ohlc = { error: [], result: { XXBTZUSD: [[1794600000, "1", "1", "1", "89000.5", "1", "1", 3], [1794603600, "1", "1", "1", "90000", "1", "1", 3]], last: 1794603600 } };
    expect(readKrakenOhlc(ohlc)).toHaveLength(2);
    const f: Fetcher = async (url) => json(url.includes("OHLC") ? ohlc : ticker);
    const d = await loadKrakenDetail("BTC", f, NOW);
    expect(d?.spark.points).toHaveLength(2);
    expect(d?.citation).toMatch(/Kraken/);
    expect(await loadKrakenDetail("NVDA", f, NOW)).toBeNull();
  });

  it("labels the header honestly", () => {
    expect(connectionCopy("live").label).toBe("Live prices");
  });
});

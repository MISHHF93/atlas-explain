import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureEconomy, type CaptureEnv } from "../src/data/capture";
import { CRYPTO_SCHEMA, parseKrakenDepth, parseKrakenTicker, readCryptoFile, type CryptoFile } from "../src/data/crypto";
import {
  ECONOMY_SCHEMA,
  ECONOMY_SOURCES,
  parseBlsCpi,
  parseBlsUnemployment,
  parseBocEvents,
  parseBocPolicy,
  parseEcbCalendar,
  parseEcbHicp,
  parseEffr,
  parseFomcCalendar,
  parseSofr,
  parseTreasuryDebt,
  readEconomyFile,
  upcoming,
  type EconomyFile,
} from "../src/data/economy";
import { EDUCATION_LINE, economicCalendar, economySnapshot, evidenceBrief, handle, marketDepth, type Fetcher } from "../src/mcp/server";

// Real responses saved from each official source on 16 Nov 2026 (test/fixtures/economy).
const fx = (name: string) => readFileSync(`test/fixtures/economy/${name}`, "utf8");
const json = (name: string) => JSON.parse(fx(name)) as unknown;
const AT = "2026-11-16T21:00:00.000Z";
const NOW = Date.parse(AT);

function economyFile(): EconomyFile {
  const indicators = [
    parseBlsCpi(json("bls-cpi.json"), AT), parseBlsUnemployment(json("bls-unemployment.json"), AT), parseEffr(json("nyfed-effr.json"), AT),
    parseSofr(json("nyfed-sofr.json"), AT), parseEcbHicp(json("ecb-hicp.json"), AT), parseBocPolicy(json("boc-policy.json"), AT), parseTreasuryDebt(json("treasury-debt.json"), AT),
  ].filter((i) => i != null);
  const events = [...parseFomcCalendar(fx("fomc.html")), ...parseEcbCalendar(fx("ecb-calendar.html")), ...parseBocEvents(fx("boc-events.html"))];
  return { schema: ECONOMY_SCHEMA, generatedAt: AT, indicators, calendar: { capturedAt: AT, events } };
}
const serve = (body: unknown): Fetcher => async () => new Response(JSON.stringify(body), { status: 200 });
const text = (r: { content: { text: string }[] }) => r.content[0]!.text;

describe("economy data from official sources", () => {
  it("reads every indicator from the real responses, with period, change and source", () => {
    const byId = Object.fromEntries(economyFile().indicators.map((i) => [i.id, i]));
    expect(Object.keys(byId).sort()).toEqual(["ca_policy_rate", "euro_hicp", "us_cpi", "us_debt", "us_fed_funds", "us_sofr", "us_unemployment"]);
    // BLS published no October 2025 CPI (the 2025 shutdown), so the latest 12-month change is September 2026's.
    expect(byId.us_cpi).toMatchObject({ value: 3.74, period: "2026-09", unit: "%", source: "U.S. Bureau of Labor Statistics" });
    expect(byId.us_unemployment).toMatchObject({ value: 4.1, period: "2026-10", change: -0.1 });
    expect(byId.us_fed_funds).toMatchObject({ value: 3.88, period: "2026-11-13", note: "The Federal Reserve's target range is 3.75% to 4.00%." });
    expect(byId.euro_hicp).toMatchObject({ value: 4, period: "2026-10" });
    expect(byId.ca_policy_rate).toMatchObject({ value: 2.5, change: 0.25, note: "Last changed on 2026-10-29, from 2.25%." });
    expect(byId.us_debt!.unit).toBe("USD");
    for (const i of Object.values(byId)) {
      expect(i.series.length, i.id).toBeGreaterThan(1);
      expect(i.sourceUrl, i.id).toMatch(/^https:\/\//);
    }
  });

  it("uses the ECB's new HICP dataset (the old ICP series stopped at December 2025)", () => {
    expect(ECONOMY_SOURCES.hicp).toContain("/data/HICP/M.U2.N.000000.4D0.ANR");
  });

  it("reads the rate-decision calendars and lists upcoming decisions soonest first", () => {
    const next = upcoming(economyFile().calendar.events, NOW, 3);
    expect(next.map((e) => [e.date, e.institution])).toEqual([
      ["2026-12-09", "Bank of Canada"],
      ["2026-12-09", "Federal Reserve"],
      ["2026-12-17", "European Central Bank"],
    ]);
    const fed = next.find((e) => e.institution === "Federal Reserve")!;
    expect(fed).toMatchObject({ startDate: "2026-12-08", withProjections: true });
    expect(next.find((e) => e.institution === "European Central Bank")!.startDate).toBe("2026-12-16");
  });

  it("drops anything malformed when reading the published file", () => {
    const file = economyFile();
    const bad = { ...file, indicators: [...file.indicators, { id: "made_up", value: 1 }], calendar: { ...file.calendar, events: [...file.calendar.events, { date: "soon" }] } };
    const read = readEconomyFile(JSON.parse(JSON.stringify(bad)))!;
    expect(read.indicators).toHaveLength(file.indicators.length);
    expect(read.calendar.events).toHaveLength(file.calendar.events.length);
    expect(readEconomyFile({ schema: "other" })).toBeNull();
  });

  it("keeps each indicator's last good value when its source fails, and never fills one in", async () => {
    const prev = economyFile();
    const env: CaptureEnv = { get: async () => { throw new Error("offline"); }, sleep: async () => undefined, now: NOW + 3_600_000, log: () => undefined };
    const out = (await captureEconomy(env, prev))!;
    expect(out.indicators.map((i) => [i.id, i.capturedAt])).toEqual(prev.indicators.map((i) => [i.id, AT]));
    expect(await captureEconomy(env, null)).toBeNull();
  });
});

describe("economy and calendar tools", () => {
  it("economy_snapshot answers with sourced figures, the next decisions, and the education line", async () => {
    const r = await economySnapshot(undefined, serve(economyFile()), NOW);
    expect(text(r)).toContain("US unemployment rate: 4.10% for 2026-10");
    expect(text(r)).toContain("Source: U.S. Bureau of Labor Statistics");
    expect(text(r)).toContain("Next rate decisions:");
    expect(text(r).endsWith(EDUCATION_LINE)).toBe(true);
    expect((r.structuredContent!.nextEvents as unknown[]).length).toBe(3);
    const rates = await economySnapshot("rates", serve(economyFile()), NOW);
    expect((rates.structuredContent!.indicators as { id: string }[]).map((i) => i.id)).toEqual(["us_fed_funds", "us_sofr", "ca_policy_rate"]);
    expect((await economySnapshot("astrology", serve(economyFile()), NOW)).isError).toBe(true);
  });

  it("economic_calendar lists dates only, filtered by bank, and never guesses a decision", async () => {
    const r = await economicCalendar("ECB", serve(economyFile()), NOW);
    const events = r.structuredContent!.events as { institution: string; daysAway: number }[];
    expect(events.every((e) => e.institution === "European Central Bank")).toBe(true);
    expect(events[0]!.daysAway).toBe(31);
    expect(text(r)).toContain("never guesses a decision");
    expect((await economicCalendar("Bank of Mars", serve(economyFile()), NOW)).isError).toBe(true);
  });
});

describe("market depth", () => {
  const ticker = { error: [], result: { XXBTZUSD: { a: ["65010.0", "1", "1.000"], b: ["65000.0", "2", "2.000"], c: ["65005.0", "0.1"], o: "64000.0" } } };
  const depth = {
    error: [],
    result: {
      XXBTZUSD: {
        asks: [["65010.0", "0.1", 1], ["65020.0", "0.2", 1], ["65100.0", "1.0", 1]],
        bids: [["65000.0", "0.1", 1], ["64990.0", "0.3", 1], ["64900.0", "1.0", 1]],
      },
    },
  };

  it("reads the best bid and ask from Kraken's ticker, and the book's best levels from its depth", () => {
    expect(parseKrakenTicker(ticker)[0]).toMatchObject({ symbol: "BTC", bidUsd: 65000, askUsd: 65010 });
    const book = parseKrakenDepth(depth)!;
    expect(book.asks[0]).toEqual([65010, 0.1]);
    expect(book.bids[0]).toEqual([65000, 0.1]);
    expect(parseKrakenDepth({ error: ["EGeneral:Too many requests"] })).toBeNull();
  });

  const cryptoFile = (): CryptoFile => ({
    schema: CRYPTO_SCHEMA,
    generatedAt: AT,
    prices: { source: "kraken", asOf: AT, coins: parseKrakenTicker(ticker) },
    history: { source: "kraken", asOf: AT, interval: "1h", series: { BTC: [[NOW / 1000 - 3600, 64900], [NOW / 1000, 65005]] } },
    books: { source: "kraken", asOf: AT, books: { BTC: parseKrakenDepth(depth)! } },
  });

  it("measures depth around the book's own middle price when the ticker is newer (seen live on ETH)", async () => {
    // The ticker moved up after the book was captured: its middle price is above every bid in the book.
    const moved = cryptoFile();
    moved.prices.coins = moved.prices.coins.map((c) => (c.symbol === "BTC" ? { ...c, bidUsd: 65200, askUsd: 65210 } : c));
    const r = (await marketDepth("BTC", serve(moved))).structuredContent as { midUsd: number; bookMidUsd: number; depth: { bandPct: number; bidsUsd: number }[] };
    expect(r.midUsd).toBe(65205);
    expect(r.bookMidUsd).toBe(65005);
    // Measured around the ticker it would be 0; around the book it isn't.
    expect(r.depth.find((d) => d.bandPct === 0.1)!.bidsUsd).toBeGreaterThan(0);
  });

  it("keeps bid, ask and books through the published file", () => {
    const read = readCryptoFile(JSON.parse(JSON.stringify(cryptoFile())))!;
    expect(read.prices.coins[0]).toMatchObject({ bidUsd: 65000, askUsd: 65010 });
    expect(read.books!.books.BTC!.asks).toHaveLength(3);
  });

  it("works out the spread, depth near the middle price and slippage by order size", async () => {
    const r = await marketDepth("bitcoin", serve(cryptoFile()));
    const d = r.structuredContent as { spreadUsd: number; spreadBps: number; midUsd: number; depth: { bandPct: number; asksUsd: number; complete: boolean }[]; impact: { sizeUsd: number; side: string; filled: boolean; avgPriceUsd: number | null; slippagePct: number | null }[] };
    expect(d.spreadUsd).toBe(10);
    expect(d.midUsd).toBe(65005);
    expect(d.spreadBps).toBeCloseTo(1.54, 2);
    // Within 0.1% of 65,005: asks up to 65,070 are 65,010 × 0.1 + 65,020 × 0.2.
    expect(d.depth[0]).toMatchObject({ bandPct: 0.1, asksUsd: Math.round(6501 + 13004) });
    // $10,000 against the asks takes 0.1 at 65,010 and the rest at 65,020.
    const tenK = d.impact.find((i) => i.sizeUsd === 10_000 && i.side === "asks")!;
    expect(tenK.filled).toBe(true);
    expect(tenK.avgPriceUsd!).toBeGreaterThan(65010);
    expect(tenK.avgPriceUsd!).toBeLessThan(65020);
    // $100,000 is more than the three ask levels hold.
    expect(d.impact.find((i) => i.sizeUsd === 100_000 && i.side === "asks")!.filled).toBe(false);
    expect(text(r)).toContain("that gap is called slippage");
    expect(text(r)).not.toMatch(/\b(buy|sell)\b/i);
    expect(text(r).endsWith(EDUCATION_LINE)).toBe(true);
  });

  it("says once how far the stored levels reach when a busy book goes beyond them, instead of repeating each band", async () => {
    const tight = cryptoFile();
    tight.books!.books.BTC = { bids: [[65000, 5], [64999, 5]], asks: [[65010, 5], [65011, 5]] };
    const t = text(await marketDepth("BTC", serve(tight)));
    expect(t).not.toContain("Within 0.5%");
    expect(t).toContain("The 2 best levels a side reach");
    expect(t).toContain("the book goes further");
    expect(t).toContain("In the order book captured 2026-11-16 21:00 UTC:");
  });

  it("evidence_brief puts the facts on one page, each with its source, and says what it doesn't tell you", async () => {
    const news = { schema: "atlas-explain-news-v1", generatedAt: AT, items: { "market:official": [{ title: "Federal Reserve issues FOMC statement on policy", url: "https://www.federalreserve.gov/x", domain: "federalreserve.gov", seenAt: "2026-11-16T19:00:00.000Z" }] } };
    const route: Fetcher = async (url) => new Response(JSON.stringify(url.includes("crypto") ? cryptoFile() : url.includes("economy") ? economyFile() : url.includes("news") ? news : {}), { status: 200 });
    const r = await evidenceBrief("Bitcoin", route, NOW);
    const t = text(r);
    expect(t).toContain("Evidence brief: Bitcoin (BTC). Facts with their sources; never a recommendation.");
    expect(t).toContain("How easily it trades: spread 1.54 basis points");
    expect(t).toContain("Effective federal funds rate: 3.88%");
    // A coin is priced in dollars, so the Fed's decision is the one named, not just the soonest of any.
    expect(t).toContain("Next rate decision: Federal Reserve, 2026-12-09.");
    expect(t).toContain("What this brief doesn't tell you:");
    expect(t).toContain("It never says whether to trade.");
    expect(t).not.toMatch(/\b(buy|sell)\b/i);
    expect(t.endsWith(EDUCATION_LINE)).toBe(true);
    const s = r.structuredContent as { asset: { symbol: string }; liquidity: { spreadBps: number }; limits: string[]; terms: { title: string }[] };
    expect(s.asset.symbol).toBe("BTC");
    expect(s.liquidity.spreadBps).toBeCloseTo(1.54, 2);
    expect(s.limits.length).toBeGreaterThanOrEqual(4);
    expect(s.terms.map((x) => x.title)).toContain("Bid-ask spread");
    expect((await evidenceBrief("Unobtainium", route, NOW)).isError).toBe(true);
  });

  it("is reachable through the JSON-RPC handler, and refuses an unknown coin", async () => {
    const reply = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "market_depth", arguments: { coin: "Shiba" } } }, serve(cryptoFile()));
    expect((reply?.result as { isError?: boolean }).isError).toBe(true);
  });
});

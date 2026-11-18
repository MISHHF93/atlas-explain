import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ECONOMY_SCHEMA, parseBlsCpi, parseBlsUnemployment, parseBocEvents, parseBocPolicy, parseEcbCalendar, parseEcbHicp, parseEffr, parseFomcCalendar, parseSofr, type EconomyFile } from "../src/data/economy";
import { dailyMoveStats, handle, notableToday, UNUSUAL_MOVE_MULTIPLE, type Fetcher } from "../src/mcp/server";

// Economic figures and calendars: real responses saved from each official source on 16 Nov 2026 (test/fixtures/economy).
const fx = (name: string) => readFileSync(`test/fixtures/economy/${name}`, "utf8");
const json = (name: string) => JSON.parse(fx(name)) as unknown;
const AT = "2026-11-16T21:00:00.000Z";
const NOW = Date.parse(AT);
const economy: EconomyFile = {
  schema: ECONOMY_SCHEMA,
  generatedAt: AT,
  indicators: [
    parseBlsCpi(json("bls-cpi.json"), AT), parseBlsUnemployment(json("bls-unemployment.json"), AT), parseEffr(json("nyfed-effr.json"), AT),
    parseSofr(json("nyfed-sofr.json"), AT), parseEcbHicp(json("ecb-hicp.json"), AT), parseBocPolicy(json("boc-policy.json"), AT),
  ].filter((i) => i != null),
  calendar: { capturedAt: AT, events: [...parseFomcCalendar(fx("fomc.html")), ...parseEcbCalendar(fx("ecb-calendar.html")), ...parseBocEvents(fx("boc-events.html"))] },
};

// Prices: 30 days of hourly closes built to a known shape, so each rule's outcome is certain.
const END = NOW / 1000 - 3600;
const hourly = (dailyPct: (day: number) => number, lastDayPct: number): [number, number][] => {
  const out: [number, number][] = [];
  let p = 100;
  for (let h = 30 * 24; h >= 0; h--) {
    // Each day's move happens in its first hour, so it falls inside that day's 24-hour window.
    const day = Math.floor(h / 24);
    if (h % 24 === 23 && h < 30 * 24 - 1) p *= 1 + (h === 23 ? lastDayPct : dailyPct(day)) / 100;
    out.push([END - h * 3600, Number(p.toFixed(6))]);
  }
  return out;
};
// Bitcoin: about ±1% a day, then +6% in the last day. Ethereum: about ±1% a day, then +1.2%.
const btc = hourly((d) => (d % 2 ? 1 : -1), 6);
const eth = hourly((d) => (d % 2 ? 1 : -1), 1.2);
const crypto = {
  schema: "atlas-explain-crypto-v1",
  generatedAt: AT,
  prices: { source: "kraken", asOf: AT, coins: [
    { symbol: "BTC", name: "Bitcoin", priceUsd: btc.at(-1)![1], changePct: 6, changeWindow: "over 24 hours" },
    { symbol: "ETH", name: "Ethereum", priceUsd: eth.at(-1)![1], changePct: 1.2, changeWindow: "over 24 hours" },
  ] },
  history: { source: "kraken", asOf: AT, interval: "1h", series: { BTC: btc, ETH: eth } },
};
const treasury = { providerId: "us_treasury", label: "US Treasury", attribution: { text: "Source: U.S. Department of the Treasury", href: "https://home.treasury.gov/x" }, licence: { status: "public_domain", displayAllowed: true, mlAllowed: false, note: "" } };
const yieldAsset = (tenor: string, value: number) => ({
  id: `rate:US:${tenor}`, symbol: `US${tenor}`, name: `US ${tenor} Treasury yield`, class: "rate", venue: "US Treasury", currency: "%", country: "US",
  session: { state: "unknown", hours: "Published each US business day", nextChange: null },
  quote: { value, change: 0, changePct: null, changeWindow: "vs previous business day", asOf: "2026-11-13T12:00:00Z", mode: "reference", source: treasury },
  noQuoteReason: null, facts: [], status: { state: "none" }, relatedTerms: ["yield_curve"], classData: { class: "rate", tenor, curve: "US Treasury par yield" },
});
const market = (tenYear: number) => ({ schema: "atlas-explain-market-v1", generatedAt: AT, assets: [yieldAsset("3M", 4.4), yieldAsset("2Y", 4.2), yieldAsset("10Y", tenYear)] });

const net = (tenYear: number): Fetcher => async (url) => {
  if (url.includes("news")) return new Response("gone", { status: 404 });
  const body = url.includes("crypto") ? crypto : url.includes("economy") ? economy : market(tenYear);
  return new Response(JSON.stringify(body), { status: 200 });
};
type Obs = { kind: string; title: string; rule: string; source: string; terms: { id: string }[] };
const run = async (tenYear: number) => (await notableToday(net(tenYear), NOW)).structuredContent as { observations: Obs[]; quiet: string[]; unavailable: string[]; limits: string[] };

describe("what's notable today: descriptive, picked by stated rules, never a forecast", () => {
  it("measures a coin's last day against its own typical daily move", () => {
    const st = dailyMoveStats(btc)!;
    expect(st.lastPct).toBeCloseTo(6, 5);
    expect(st.typicalPct).toBeCloseTo(1, 5);
    expect(st.days).toBe(29);
    // Too little history to judge what's usual: no verdict at all.
    expect(dailyMoveStats(btc.slice(-24 * 10))).toBeNull();
  });

  it("flags only the coin whose move is well outside its usual range, with the rule and its source", async () => {
    const { observations } = await run(4.0);
    const moves = observations.filter((o) => o.kind === "crypto_move");
    expect(moves.map((o) => o.title)).toEqual([expect.stringMatching(/^Bitcoin moved \+6\.00% in 24 hours, about 6\.0× its typical daily move$/)]);
    expect(moves[0]!.rule).toContain(`${UNUSUAL_MOVE_MULTIPLE}×`);
    expect(moves[0]!.source).toMatch(/Kraken/);
  });

  it("calls an inverted yield curve inverted, and an ordinary one ordinary", async () => {
    const inverted = await run(4.0);
    const curve = inverted.observations.find((o) => o.kind === "yield_curve")!;
    expect(curve.title).toContain("inverted: the 10-year yields 40 basis points less than the 3-month");
    expect(curve.terms.map((t) => t.id)).toContain("yield_curve");
    const normal = await run(5.4);
    expect(normal.observations.some((o) => o.kind === "yield_curve")).toBe(false);
    expect(normal.quiet.join(" ")).toContain("slopes upward as usual");
  });

  it("says plainly what it couldn't check instead of leaving it out silently", async () => {
    const { unavailable } = await run(4.0);
    expect(unavailable).toEqual(["Headlines couldn't be loaded, so official releases weren't checked."]);
  });

  it("only ever describes: no forecast, no suggestion, no trade words", async () => {
    const r = await notableToday(net(4.0), NOW);
    const all = r.content[0]!.text;
    expect(all).toContain("None of it says what happens next.");
    expect(all).not.toMatch(/\b(buy|sell|should|will (rise|fall)|expect(ed)? to)\b/i);
  });

  it("is reachable as a tool and as a one-click prompt", async () => {
    const call = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "notable_today", arguments: {} } }, net(4.0));
    expect((call?.result as { isError?: boolean }).isError).toBeFalsy();
    const prompt = await handle({ jsonrpc: "2.0", id: 2, method: "prompts/get", params: { name: "whats_notable" } }, net(4.0));
    expect(JSON.stringify(prompt?.result)).toContain("notable_today");
  });
});

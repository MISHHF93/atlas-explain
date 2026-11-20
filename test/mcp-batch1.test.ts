import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { moneyMaths } from "../src/core/money-maths";
import { matchRedFlags, RED_FLAGS } from "../src/core/red-flags";
import { boeBankRateUrl, ECONOMY_SCHEMA, parseBoeBankRate, parseBoeMpcDates, parseEcbDepositRate, parseTreasuryAuctions, readEconomyFile, upcoming, type EconomyFile } from "../src/data/economy";
import { economicCalendar, handle, moneyMathsTool, scamRedFlags, treasuryAuctions, type Fetcher } from "../src/mcp/server";

// Real responses saved on 18 Nov 2026 (test/fixtures/economy): Bank of England, ECB, TreasuryDirect.
const fx = (name: string) => readFileSync(`test/fixtures/economy/${name}`, "utf8");
const AT = "2026-11-18T12:00:00.000Z";
const NOW = Date.parse(AT);
const text = (r: { content: { text: string }[] }) => r.content[0]!.text;
const serve = (body: unknown): Fetcher => async () => new Response(JSON.stringify(body), { status: 200 });

describe("more central banks: Bank of England and the ECB deposit rate", () => {
  it("reads Bank Rate from the Bank of England database, with its last change", () => {
    const r = parseBoeBankRate(fx("boe-bank-rate.csv"), AT)!;
    expect(r.id).toBe("uk_bank_rate");
    expect(r.value).toBe(4);
    expect(r.change).toBe(0.25);
    expect(r.note).toBe("Last changed on 2026-11-05, from 3.75%.");
    expect(boeBankRateUrl(NOW)).toMatch(/Datefrom=\d{2}\/[A-Z][a-z]{2}\/2025&Dateto=now&SeriesCodes=IUDBEDR/);
    expect(parseBoeBankRate("<html>blocked</html>", AT)).toBeNull();
  });

  it("reads the ECB deposit facility rate from the data portal", () => {
    const r = parseEcbDepositRate(fx("ecb-deposit-rate.csv"), AT)!;
    expect(r.id).toBe("euro_deposit_rate");
    expect(r.value).toBe(2.5);
    expect(r.note).toBe("Last changed on 2026-09-16, from 2.25%.");
  });

  it("reads the MPC dates by year, and the next one is listed as a Bank of England decision", () => {
    const events = parseBoeMpcDates(fx("boe-mpc-dates.html"));
    expect(events.map((e) => e.date)).toEqual(expect.arrayContaining(["2026-11-05", "2027-03-18", "2027-12-16"]));
    expect(events.every((e) => e.institution === "Bank of England")).toBe(true);
    expect(upcoming(events, NOW, 1)[0]!.date).toBe("2026-12-17");
  });

  it("lets economic_calendar filter for the Bank of England", async () => {
    const file: EconomyFile = { schema: ECONOMY_SCHEMA, generatedAt: AT, indicators: [], calendar: { capturedAt: AT, events: parseBoeMpcDates(fx("boe-mpc-dates.html")) } };
    const r = await economicCalendar("Bank of England", serve(file), NOW);
    expect(text(r)).toContain("2026-12-17");
    expect(text(r)).toContain("Monetary Policy Committee");
  });
});

describe("US Treasury auctions (TreasuryDirect)", () => {
  const announced = parseTreasuryAuctions(JSON.parse(fx("treasurydirect-announced.json")));
  const results = parseTreasuryAuctions(JSON.parse(fx("treasurydirect-auctioned.json")));

  it("reads auctions with the yield each set, bid-to-cover and the share to indirect bidders", () => {
    const tenYear = results.find((a) => a.term === "10-Year")!;
    expect(tenYear).toMatchObject({ type: "Note", auctionDate: "2026-11-10", issueDate: "2026-11-16", offeringUsd: 42e9, yieldPct: 5.02, couponPct: 5, bidToCover: 2.46 });
    expect(tenYear.indirectPct).toBeGreaterThan(0);
    const bill = results.find((a) => a.term === "6-Week")!;
    // Bills: the investment rate (bond-equivalent yield), not the discount rate.
    expect(bill.yieldPct).toBe(4.131);
    expect(bill.couponPct).toBeNull();
    // Announced but not yet held: no results.
    expect(announced.filter((a) => a.bidToCover == null && a.auctionDate >= "2026-11-18").map((a) => a.term)).toEqual(expect.arrayContaining(["4-Week", "20-Year"]));
  });

  it("answers with upcoming auctions and recent results, filtered by kind, never predicting a result", async () => {
    const file = readEconomyFile({
      schema: ECONOMY_SCHEMA, generatedAt: AT, indicators: [], calendar: { capturedAt: AT, events: [] },
      auctions: { capturedAt: AT, upcoming: announced.filter((a) => a.bidToCover == null), recent: results },
    })!;
    expect(file.auctions!.recent.length).toBe(results.length);
    const all = text(await treasuryAuctions(undefined, serve(file), NOW));
    expect(all).toContain("Announced, not yet auctioned:");
    expect(all).toContain("bid-to-cover 2.46");
    expect(all).toContain("10-Year note, $42 billion");
    expect(all).toContain("never predicts a result");
    const notes = (await treasuryAuctions("notes", serve(file), NOW)).structuredContent as { upcoming: { type: string }[]; recent: { type: string }[] };
    expect([...notes.upcoming, ...notes.recent].every((a) => a.type === "Note")).toBe(true);
    expect((await treasuryAuctions("stocks", serve(file), NOW)).isError).toBe(true);
    // A file from before auctions were captured says so plainly.
    const old = { schema: ECONOMY_SCHEMA, generatedAt: AT, indicators: [], calendar: { capturedAt: AT, events: [] } };
    expect(text(await treasuryAuctions(undefined, serve(old), NOW))).toContain("haven't been captured yet");
  });
});

describe("money maths (arithmetic on the person's own numbers)", () => {
  it("compounds monthly with additions, and says the rate is an assumption", () => {
    const r = moneyMaths({ calculation: "compound_growth", amount: 1000, ratePct: 12, years: 1 });
    if ("error" in r) throw new Error(r.error);
    // 1% a month for 12 months.
    expect(r.series[0]!.points.at(-1)!.y).toBeCloseTo(1000 * 1.01 ** 12, 1);
    expect(r.lines.at(-1)).toMatch(/never guaranteed/);
    const withMonthly = moneyMaths({ calculation: "compound_growth", amount: 0, ratePct: 0, years: 2, monthly: 100 });
    if ("error" in withMonthly) throw new Error(withMonthly.error);
    expect(withMonthly.series[0]!.points.at(-1)!.y).toBe(2400);
  });

  it("shows what a fee costs, what inflation does, and how diversification levels off", () => {
    const fees = moneyMaths({ calculation: "fees", amount: 10000, ratePct: 6, feePct: 1, years: 30 });
    // Every amount reads as money: "$5,000", never a bare "5,000".
    if (!("error" in fees)) for (const l of fees.lines.slice(0, 2)) expect(l).toMatch(/\$\d/);
    if ("error" in fees) throw new Error(fees.error);
    expect(fees.series[1]!.points.at(-1)!.y).toBeLessThan(fees.series[0]!.points.at(-1)!.y);
    const infl = moneyMaths({ calculation: "inflation", amount: 1000, inflationPct: 3, years: 10 });
    if ("error" in infl) throw new Error(infl.error);
    expect(infl.series[0]!.points.at(-1)!.y).toBeCloseTo(1000 / 1.03 ** 10, 1);
    const div = moneyMaths({ calculation: "diversification", volatilityPct: 30, correlation: 0.25, holdings: 50 });
    if ("error" in div) throw new Error(div.error);
    const last = div.series[0]!.points.at(-1)!.y;
    expect(last).toBeGreaterThan(30 * Math.sqrt(0.25));
    expect(div.series[0]!.points[0]!.y).toBe(30);
  });

  it("asks for what's missing instead of guessing, and keeps inputs in sensible limits", () => {
    expect("error" in moneyMaths({ calculation: "compound_growth", amount: 1000 })).toBe(true);
    expect(moneyMathsTool({ calculation: "fees", amount: 1000, rate_pct: 5, years: 10 }).isError).toBe(true);
    expect("error" in moneyMaths({ calculation: "compound_growth", amount: 100, ratePct: 500, years: 5 })).toBe(true);
    const capped = moneyMaths({ calculation: "compound_growth", amount: 100, ratePct: 30, years: 500 });
    if ("error" in capped) throw new Error(capped.error);
    expect(capped.inputs.ratePct).toBe(30);
    expect(capped.inputs.years).toBe(60);
    const r = moneyMathsTool({ calculation: "inflation", amount: "500", inflation_pct: 2, years: 5 });
    expect(text(r)).toContain("never a forecast");
  });

  it("is a tool with its own interactive view that recalculates with the same function", async () => {
    const res = (await handle({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "ui://atlas-explain/money-maths.html" } }, serve({})))!.result as { contents: { text: string }[] };
    expect(res.contents[0]!.text).toContain("const compute = function moneyMaths(");
  });
});

describe("investment scam warning signs", () => {
  it("points out the warning signs a pitch shows, each with an official source", () => {
    const pitch = "Hi, wrong number! But since we're chatting: my uncle's AI trading bot is guaranteed 3% a day. Act now, only 5 spots. Send USDT to my personal account. Keep it between us.";
    const ids = matchRedFlags(pitch).map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(["guaranteed_returns", "pressure", "unsolicited", "unusual_payment", "secrecy", "impersonation"]));
    expect(matchRedFlags("What is a bond?")).toEqual([]);
    for (const f of RED_FLAGS) expect(f.source.url).toMatch(/^https:\/\/www\.(investor\.gov|finra\.org)\//);
  });

  it("never says something is or isn't a scam, and lists where to check and report", async () => {
    const news = { schema: "atlas-explain-news-v1", generatedAt: AT, items: { "market:official": [
      { title: "SEC Charges Promoters in Crypto Ponzi Scheme", url: "https://www.sec.gov/x", domain: "sec.gov", seenAt: "2026-11-17T15:00:00Z", source: "official" },
      { title: "Fed announces rate decision", url: "https://www.federalreserve.gov/x", domain: "federalreserve.gov", seenAt: "2026-11-17T15:00:00Z", source: "official" },
    ] } };
    const clean = await scamRedFlags("Monthly statement from my bank", serve(news), NOW);
    expect(text(clean)).toContain("That doesn't make it safe");
    const listed = await scamRedFlags(undefined, serve(news), NOW);
    expect(text(listed)).toContain("brokercheck.finra.org");
    expect(text(listed)).toContain("Canadian Anti-Fraud Centre");
    expect(text(listed)).toContain("can't say whether something is a scam");
    const actions = (listed.structuredContent as { recentActions: { title: string }[] }).recentActions;
    expect(actions.map((a) => a.title)).toEqual(["SEC Charges Promoters in Crypto Ponzi Scheme"]);
  });
});

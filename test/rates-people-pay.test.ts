import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureEconomy, type CaptureEnv } from "../src/data/capture";
import {
  boeQuotedUrl,
  ecbMirUrl,
  fdicIndicators,
  fdicRatesUrl,
  INDICATOR_IDS,
  monthBefore,
  parseBoeQuoted,
  parseEcbMir,
  parseFdicRates,
  type EconomyFile,
} from "../src/data/economy";
import { economySnapshot, rateChangeImpactTool, type Fetcher } from "../src/mcp/server";

// Real responses saved on 23 Nov 2026 (test/fixtures/economy); the FDIC pages trimmed to their title and table.
const fx = (n: string) => readFileSync(`test/fixtures/economy/${n}`, "utf8");
const AT = "2026-11-23T12:00:00.000Z";
const NOW = Date.parse(AT);

describe("US: the FDIC's national average savings and CD rates", () => {
  it("reads the month and each product's national rate from the FDIC's page", () => {
    expect(parseFdicRates(fx("fdic-rates-2026-11.html"))).toEqual({ month: "2026-11", rates: { us_savings_rate: 0.39, us_cd_12m: 1.81, us_cd_5y: 1.44 } });
    expect(parseFdicRates(fx("fdic-rates-2026-10.html"))?.month).toBe("2026-10");
    expect(parseFdicRates("<html>a different page</html>")).toBeNull();
  });

  it("finds each month's page by its address, and the month before", () => {
    expect(fdicRatesUrl()).toBe("https://www.fdic.gov/national-rates-and-rate-caps");
    expect(fdicRatesUrl("2026-10")).toBe("https://www.fdic.gov/national-rates-and-rate-caps/national-rates-and-rate-caps-october-2026");
    expect(monthBefore("2026-11")).toBe("2026-10");
    expect(monthBefore("2027-01")).toBe("2026-12");
  });

  it("builds a history a month at a time, and says what the average is", () => {
    const [savings] = fdicIndicators([parseFdicRates(fx("fdic-rates-2026-10.html")), parseFdicRates(fx("fdic-rates-2026-11.html"))], null, AT);
    expect(savings).toMatchObject({ id: "us_savings_rate", value: 0.39, period: "2026-11", change: 0.01, source: "Federal Deposit Insurance Corporation (FDIC)" });
    expect(savings!.note).toContain("the best accounts pay much more");
    // Next month adds to what's kept.
    const prev = { indicators: [savings!] } as unknown as EconomyFile;
    const next = fdicIndicators([{ month: "2026-12", rates: { us_savings_rate: 0.41 } }], prev, AT);
    expect(next.find((i) => i.id === "us_savings_rate")!.series.map((p) => p.t)).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  it("is read once a month, and last month's page only while there's less than two months kept", async () => {
    const gets: string[] = [];
    const env: CaptureEnv = {
      get: async (u) => {
        gets.push(u);
        if (u === fdicRatesUrl()) return fx("fdic-rates-2026-11.html");
        if (u === fdicRatesUrl("2026-10")) return fx("fdic-rates-2026-10.html");
        throw new Error("not in this test");
      },
      sleep: async () => undefined, now: NOW, log: () => undefined,
    };
    const first = (await captureEconomy(env, null))!;
    expect(gets.filter((u) => u.includes("fdic.gov"))).toHaveLength(2);
    expect(first.indicators.map((i) => i.id)).toEqual(["us_savings_rate", "us_cd_12m", "us_cd_5y"]);
    gets.length = 0;
    await captureEconomy(env, first);
    expect(gets.filter((u) => u.includes("fdic.gov"))).toEqual([fdicRatesUrl()]);
  });
});

describe("UK: the Bank of England's quoted fixed mortgage rates", () => {
  it("reads the 2- and 5-year fixed rates at 75% loan-to-value, monthly", () => {
    expect(parseBoeQuoted("uk_mortgage_2y")(fx("boe-quoted.csv"), AT)).toMatchObject({ id: "uk_mortgage_2y", value: 5.39, period: "2026-10", source: "Bank of England" });
    expect(parseBoeQuoted("uk_mortgage_5y")(fx("boe-quoted.csv"), AT)).toMatchObject({ value: 5.19, period: "2026-10" });
    expect(parseBoeQuoted("uk_mortgage_2y")(fx("boe-quoted.csv"), AT)!.note).toContain("deals vary by lender and borrower");
    expect(boeQuotedUrl(NOW)).toContain("SeriesCodes=IUMBV34,IUMBV42");
  });
});

describe("Euro area: the ECB's bank interest rates for households", () => {
  it("reads the cost of borrowing for a home and the household deposit rate", () => {
    expect(parseEcbMir("euro_mortgage_rate")(fx("ecb-mir-mortgage.csv"), AT)).toMatchObject({ id: "euro_mortgage_rate", value: 3.62, period: "2026-09", source: "European Central Bank" });
    expect(parseEcbMir("euro_deposits_1y")(fx("ecb-mir-deposits.csv"), AT)).toMatchObject({ value: 2.33, period: "2026-09" });
    expect(ecbMirUrl("euro_mortgage_rate")).toContain("MIR/M.U2.B.A2C.AM.R.A.2250.EUR.N");
  });
});

describe("in the connector", () => {
  const file = (): EconomyFile => ({
    schema: "atlas-explain-economy-v1", generatedAt: AT, calendar: { capturedAt: AT, events: [] },
    indicators: [
      ...fdicIndicators([parseFdicRates(fx("fdic-rates-2026-10.html")), parseFdicRates(fx("fdic-rates-2026-11.html"))], null, AT),
      parseBoeQuoted("uk_mortgage_2y")(fx("boe-quoted.csv"), AT)!, parseBoeQuoted("uk_mortgage_5y")(fx("boe-quoted.csv"), AT)!,
      parseEcbMir("euro_mortgage_rate")(fx("ecb-mir-mortgage.csv"), AT)!, parseEcbMir("euro_deposits_1y")(fx("ecb-mir-deposits.csv"), AT)!,
    ].sort((a, b) => INDICATOR_IDS.indexOf(a.id) - INDICATOR_IDS.indexOf(b.id)),
  });
  const serve: Fetcher = async (url) => (url.endsWith("/economy.json") ? new Response(JSON.stringify(file())) : new Response("no", { status: 404 }));
  const ids = async (t: string) => ((await economySnapshot(t, serve, NOW)).structuredContent as { indicators: { id: string }[] }).indicators.map((i) => i.id);

  it("answers mortgage and savings questions with every region's figures", async () => {
    expect(await ids("mortgage rates")).toEqual(["euro_mortgage_rate", "uk_mortgage_2y", "uk_mortgage_5y"]);
    expect(await ids("savings")).toEqual(["us_savings_rate", "us_cd_12m", "us_cd_5y", "euro_deposits_1y"]);
    expect(await ids("cd rates")).toEqual(["us_cd_12m", "us_cd_5y"]);
    expect(await ids("uk")).toEqual(["uk_mortgage_2y", "uk_mortgage_5y"]);
  });

  it("shows the US national average beside a US savings or CD answer, for reference only", async () => {
    const r = await rateChangeImpactTool({ product: "savings", balance: 20000, rate_pct: 4, change_pts: -0.25, country: "US" }, serve);
    const t = r.content[0]!.text;
    expect(t).toContain("For reference: US savings account rate (national average) is 0.39% (for 2026-11, Federal Deposit Insurance Corporation (FDIC)");
    expect(t).toContain("the best accounts pay much more");
    expect((r.structuredContent as { inputs: { ratePct: number } }).inputs.ratePct).toBe(4);
    const cd = await rateChangeImpactTool({ product: "gic_cd", balance: 10000, rate_pct: 4.2, change_pts: -0.25, country: "US" }, serve);
    expect(cd.content[0]!.text).toContain("US 12-month CD rate (national average) is 1.81%");
  });
});

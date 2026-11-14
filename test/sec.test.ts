import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateAsset } from "../src/core/asset-schema";
import {
  SEC_ETFS,
  annualValue,
  etfFromSec,
  figuresFromFacts,
  filingUrl,
  latestInstant,
  money,
  readTickerMap,
  recentFilings,
  stockFromSec,
} from "../src/data/sec";

// Real EDGAR responses for Apple, captured 2026-11-13 and trimmed.
const submissions = readFileSync("test/fixtures/market/sec-submissions-aapl.json", "utf8");
const facts = readFileSync("test/fixtures/market/sec-facts-aapl.json", "utf8");
const NOW = Date.parse("2026-11-13T23:00:00Z");
const pt = (over: Record<string, unknown>) => ({ form: "10-K", fp: "FY", accn: "0000000000-26-000001", filed: "2026-02-10", ...over });

describe("SEC company figures", () => {
  it("builds Apple's page from its latest annual report, each figure linked to the filing", () => {
    const asset = stockFromSec({ ticker: "AAPL", name: "Apple", cik: 320193, submissions, facts, now: NOW })!;
    expect(asset).toMatchObject({ id: "stock:US:AAPL", class: "stock", venue: "Nasdaq", quote: null });
    expect(asset.noQuoteReason).toMatch(/aren't licensed for public display/);
    const byLabel = Object.fromEntries(asset.facts.filter((f) => f.kind === "figure").map((f) => [f.label, f]));
    expect(byLabel.Revenue?.value).toBe("$478.8 billion");
    expect(byLabel.Revenue?.period).toBe("year to 26 Sept 2026");
    expect(byLabel.Revenue?.source.attribution.href).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019326000026/");
    expect(byLabel["Shares outstanding"]?.value).toBe("14.53 billion");
    expect(validateAsset(asset, NOW).errors).toEqual([]);
  });

  it("lists the latest 10-K, 10-Q and 8-K with links to the documents", () => {
    const filings = recentFilings(320193, JSON.parse(submissions), 3, NOW);
    // The fixture keeps Apple's 30 most recent filings; the last 10-Q is older than those.
    expect(filings.map((f) => f.label)).toEqual(["Current report on a major event (8-K)", "Annual report (10-K)"]);
    expect(filings[0]!.value).toBe("Filed 9 Nov 2026");
    expect(filings[1]!.source.attribution.href).toMatch(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/320193\/\d+\/aapl-20260926\.htm$/);
  });

  it("never takes a quarter for an annual figure", () => {
    const q = annualValue([pt({ start: "2026-04-01", end: "2026-06-30", val: 5, form: "10-Q", fp: "Q2" }), pt({ start: "2025-01-01", end: "2025-12-31", val: 20 })]);
    expect(q?.val).toBe(20);
  });

  it("follows companies that renamed their accounting concepts, and keeps figures on one fiscal year", () => {
    // Mastercard-like: NetIncomeLoss stopped in 2013; ProfitLoss carries on. NVIDIA-like: revenue moved concepts in 2022.
    const body = { facts: { "us-gaap": {
      NetIncomeLoss: { units: { USD: [pt({ start: "2013-01-01", end: "2013-12-31", val: 3.1e9, filed: "2014-02-14" })] } },
      ProfitLoss: { units: { USD: [pt({ start: "2025-01-01", end: "2025-12-31", val: 15e9 })] } },
      RevenueFromContractWithCustomerExcludingAssessedTax: { units: { USD: [pt({ start: "2021-01-01", end: "2021-12-31", val: 26.9e9, filed: "2022-02-11" })] } },
      Revenues: { units: { USD: [pt({ start: "2025-01-01", end: "2025-12-31", val: 32.8e9 })] } },
    } } };
    const figures = figuresFromFacts(1, body, NOW);
    expect(figures.map((f) => `${f.label}=${f.value}`)).toEqual(["Revenue=$32.8 billion", "Net income=$15.0 billion"]);
  });

  it("shows nothing for a company whose only annual figures are old", () => {
    const body = { facts: { "us-gaap": { NetIncomeLoss: { units: { USD: [pt({ start: "2010-01-01", end: "2010-12-31", val: 2.7e9, filed: "2011-02-22" })] } } } } };
    expect(figuresFromFacts(1, body, NOW)).toEqual([]);
  });

  it("skips shares outstanding when a company reports several share classes", () => {
    const one = [pt({ end: "2026-10-01", val: 1e9, accn: "a" })];
    const two = [pt({ end: "2026-10-01", val: 941_481, accn: "a" }), pt({ end: "2026-10-01", val: 1.3e9, accn: "a" })];
    expect(latestInstant(one)?.val).toBe(1e9);
    expect(latestInstant(two)).toBeNull();
  });

  it("drops filings older than about 18 months", () => {
    const old = { filings: { recent: { form: ["N-CSR"], filingDate: ["2004-12-03"], accessionNumber: ["0000000000-04-000001"], primaryDocument: ["x.txt"], reportDate: [""] } } };
    expect(recentFilings(1, old, 3, NOW)).toEqual([]);
  });

  it("builds an ETF page from filings only, with its category, and no invented price", () => {
    const spy = SEC_ETFS.find((e) => e.ticker === "SPY")!;
    const sub = JSON.stringify({ tickers: ["SPY"], exchanges: ["NYSE"], filings: { recent: { form: ["485BPOS"], filingDate: ["2026-01-26"], accessionNumber: ["0000000000-26-000002"], primaryDocument: ["d.htm"], reportDate: [""] } } });
    const asset = etfFromSec({ etf: spy, cik: 884394, submissions: sub, facts: null, now: NOW })!;
    expect(asset).toMatchObject({ id: "etf:US:SPY", class: "etf", quote: null, classData: { etfCategory: "index" } });
    expect(asset.noQuoteReason).toContain("S&P 500");
    expect(validateAsset(asset, NOW).errors).toEqual([]);
  });

  it("reads the SEC ticker list, formats money and builds filing links", () => {
    const map = readTickerMap(JSON.stringify({ 0: { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." }, 1: { ticker: 5 } }));
    expect(map.get("AAPL")).toEqual({ cik: 320193, title: "Apple Inc." });
    expect(map.size).toBe(1);
    expect(money(478_834_000_000)).toBe("$478.8 billion");
    expect(money(-267_000_000)).toBe("−$267.0 million");
    expect(filingUrl(320193, "0000320193-26-000026")).toBe("https://www.sec.gov/Archives/edgar/data/320193/000032019326000026/");
  });
});

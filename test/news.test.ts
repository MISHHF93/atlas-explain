import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { recentFilingLines } from "../src/core/catalog";
import {
  NEWS_GROUPS,
  NEWS_MAX_PER_ASSET,
  NEWS_SCHEMA,
  NEWS_TARGETS,
  assignNews,
  cleanTitle,
  gdeltUrl,
  isRateLimitNotice,
  newsQuestion,
  parseGdelt,
  readNewsFile,
  type NewsItem,
} from "../src/core/news";
import type { Asset } from "../src/core/asset-schema";

// A real GDELT artlist response captured 2026-11-13 (trimmed to 12 articles).
const body = readFileSync("test/fixtures/market/gdelt.json", "utf8");
const NOW = Date.parse("2026-11-13T23:00:00Z");
const item = (title: string, seenAt = "2026-11-13T18:00:00Z"): NewsItem => ({ title, url: "https://example.com/a", domain: "example.com", seenAt });

describe("GDELT headlines", () => {
  it("parses real responses into clean, linkable, recent headlines", () => {
    const items = parseGdelt(body, NOW);
    expect(items.length).toBeGreaterThan(5);
    for (const n of items) {
      expect(n.url).toMatch(/^https?:\/\//);
      expect(n.title).not.toMatch(/ [.?,] |\s{2,}/);
      expect(Date.parse(n.seenAt)).toBeLessThanOrEqual(NOW);
    }
  });

  it("undoes GDELT's tokenizer spacing", () => {
    expect(cleanTitle("Bitcoin Faces $14 . 2B Liquidity Drain . Is Crypto Running Dry ? ")).toBe("Bitcoin Faces $14.2B Liquidity Drain. Is Crypto Running Dry?");
    expect(cleanTitle("Revenue rose 3 , 400 jobs\u0007 ( approx )")).toBe("Revenue rose 3,400 jobs (approx)");
  });

  it("drops old, duplicate, unlinkable and trade-instruction headlines", () => {
    const raw = JSON.stringify({ articles: [
      { title: "Nvidia shares slide after results", url: "https://a.example/1", seendate: "20261113T200000Z", domain: "a.example" },
      { title: "Nvidia Shares Slide After Results!", url: "https://b.example/2", seendate: "20261113T190000Z", domain: "b.example" },
      { title: "Strong buy: three chip stocks to own now", url: "https://c.example/3", seendate: "20261113T190000Z", domain: "c.example" },
      { title: "Nvidia story from last week, long ago", url: "https://d.example/4", seendate: "20261101T190000Z", domain: "d.example" },
      { title: "A headline with no link at all here", url: "javascript:alert(1)", seendate: "20261113T190000Z", domain: "e.example" },
    ] });
    expect(parseGdelt(raw, NOW).map((n) => n.title)).toEqual(["Nvidia shares slide after results"]);
    expect(parseGdelt("not json", NOW)).toEqual([]);
  });

  it("recognises GDELT's rate-limit notice", () => {
    expect(isRateLimitNotice("Please limit requests to one every 5 seconds")).toBe(true);
    expect(isRateLimitNotice('{"articles":[]}')).toBe(false);
  });

  it("assigns headlines to companies by name, newest first, capped per asset", () => {
    const list = [item("Microsoft 365 outage enters second day", "2026-11-13T17:00:00Z"), item("Nvidia stock falls", "2026-11-13T18:00:00Z"), item("Apple pie recipes")]
      .concat(Array.from({ length: 8 }, (_, i) => item(`Bitcoin update number ${i}`, `2026-11-13T1${i}:00:00Z`)));
    const out = assignNews(list);
    expect(out["stock:US:MSFT"]?.[0]?.title).toMatch(/Microsoft/);
    expect(out["stock:US:NVDA"]).toHaveLength(1);
    expect(out["crypto:BTC"]).toHaveLength(NEWS_MAX_PER_ASSET);
    expect(out["crypto:BTC"]![0]!.title).toBe("Bitcoin update number 7");
    expect(out["stock:US:AAPL"]?.[0]?.title).toBe("Apple pie recipes"); // name matching is simple; the market words in the query keep this rare
  });

  it("uses a few grouped queries that stay well inside GDELT's pacing", () => {
    expect(NEWS_GROUPS.length).toBeLessThanOrEqual(5);
    for (const q of NEWS_GROUPS) expect(gdeltUrl(q)).toMatch(/^https:\/\/api\.gdeltproject\.org\/api\/v2\/doc\/doc\?query=.+sourcelang%3Aenglish/);
    expect(NEWS_TARGETS).toHaveLength(35);
  });
});

describe("the published news file and the Explain question", () => {
  it("keeps only known assets, linkable and recent items", () => {
    const file = readNewsFile({ schema: NEWS_SCHEMA, generatedAt: "2026-11-13T22:00:00Z", items: {
      "crypto:BTC": [item("Bitcoin falls below $69,000"), item("Old bitcoin news", "2026-11-01T00:00:00Z"), { ...item("Bad link bitcoin"), url: "ftp://x" }],
      "stock:US:FAKE": [item("Not a target")],
    } }, NOW)!;
    expect(file.items["crypto:BTC"]!.map((n) => n.title)).toEqual(["Bitcoin falls below $69,000"]);
    expect(file.items["stock:US:FAKE"]).toBeUndefined();
    expect(readNewsFile({ schema: "other" }, NOW)).toBeNull();
  });

  it("asks for a summary of only the numbered items, with no trade advice", () => {
    const q = newsQuestion("Bitcoin", "BTC", [item("Bitcoin falls below $69,000")], ["Current report on a major event (8-K), filed 9 nov 2026"]);
    expect(q).toContain('1. "Bitcoin falls below $69,000" (example.com, 2026-11-13 18:00 UTC)');
    expect(q).toContain("2. SEC filing: Current report");
    expect(q).toMatch(/Use only the items listed below/);
    expect(q).toMatch(/Do not recommend a trade\./);
  });

  it("finds SEC filings from the last two days on an asset page", () => {
    const facts = [
      { kind: "filing", label: "Current report on a major event (8-K)", value: "Filed 13 Nov 2026", period: null, asOf: "2026-11-13T12:00:00Z", source: {} },
      { kind: "filing", label: "Annual report (10-K)", value: "Filed 3 Nov 2026", period: null, asOf: "2026-11-03T12:00:00Z", source: {} },
    ];
    expect(recentFilingLines({ facts } as unknown as Asset, NOW)).toEqual(["Current report on a major event (8-K), filed 13 nov 2026"]);
  });
});

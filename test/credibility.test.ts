import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { rolling24h } from "../src/data/capture";
import { parseBoeQuoted, type EconomyFile } from "../src/data/economy";
import { BRIEF_APP_HTML } from "../src/mcp/brief-app";
import { explainTerm, NEW_FIGURE_DAYS, notableToday, type Fetcher } from "../src/mcp/server";

// Fixes from the 23 Nov 2026 product review: every number on screen agrees with the others and says how old it is.
const AT = "2026-11-23T12:00:00.000Z";
const NOW = Date.parse(AT);

describe("crypto changes are over the last 24 hours, everywhere", () => {
  const prices = { source: "kraken" as const, asOf: AT, coins: [{ symbol: "BTC", name: "Bitcoin", priceUsd: 110, changePct: 0.4, changeWindow: "since 00:00 UTC" }] };

  it("measures from the hourly close nearest 24 hours ago", () => {
    const t = NOW / 1000;
    const series = { BTC: [[t - 86_400 - 1_800, 100], [t - 3_600, 108]] as [number, number][] };
    expect(rolling24h(prices, series, NOW).coins[0]).toMatchObject({ changePct: 10, changeWindow: "over 24 hours" });
  });

  it("keeps the change it came with, and its window, when there's no close near 24 hours ago", () => {
    const t = NOW / 1000;
    expect(rolling24h(prices, { BTC: [[t - 3_600, 108]] }, NOW).coins[0]).toMatchObject({ changePct: 0.4, changeWindow: "since 00:00 UTC" });
  });
});

describe("what's notable today is about what's new", () => {
  const fx = (n: string) => readFileSync(`test/fixtures/economy/${n}`, "utf8");
  const mortgage = parseBoeQuoted("uk_mortgage_2y")(fx("boe-quoted.csv"), AT)!; // +0.26 pt for 2026-10
  const serve = (firstSeen: string | null): Fetcher => async (url) =>
    url.endsWith("/economy.json")
      ? new Response(JSON.stringify({ schema: "atlas-explain-economy-v1", generatedAt: AT, calendar: { capturedAt: AT, events: [] }, indicators: [mortgage], firstSeen: { uk_mortgage_2y: { [mortgage.period]: firstSeen } }, trackingSince: "2026-11-01T00:00:00.000Z" } satisfies EconomyFile))
      : new Response("no", { status: 404 });
  const notable = async (seen: string | null) => (await notableToday(serve(seen), NOW)).structuredContent as { observations: { kind: string; title: string; rule: string; terms: { id: string }[] }[]; quiet: string[] };

  it("shows a monthly figure that changed a lot while it's newly published, with terms that fit it", async () => {
    const n = await notable(new Date(NOW - 2 * 86_400_000).toISOString());
    const item = n.observations.find((o) => o.kind === "economic_change")!;
    expect(item.title).toContain("UK 2-year fixed mortgage rate");
    expect(item.rule).toContain(`first published in the last ${NEW_FIGURE_DAYS} days`);
    expect(item.terms.map((t) => t.id)).toEqual(["apr_apy", "basis_point"]);
  });

  it("leaves out an older figure, and says it did so", async () => {
    for (const seen of [null, new Date(NOW - 20 * 86_400_000).toISOString()]) {
      const n = await notable(seen);
      expect(n.observations.filter((o) => o.kind === "economic_change")).toEqual([]);
      expect(n.quiet.join(" ")).toContain("1 older figure did, and is in economy_snapshot");
    }
  });

  it("no longer offers implied volatility (an options term) for a crypto move", () => {
    const src = readFileSync("src/mcp/server.ts", "utf8");
    expect(src).toContain('termRefs("volume", "liquidity")');
    expect(src).not.toContain('termRefs("volume", "implied_volatility")');
  });
});

describe("term lookups that miss still help", () => {
  it("answers a comparison with both terms", () => {
    const r = explainTerm("ETF vs mutual fund").structuredContent as { found: boolean; terms: { id: string }[] };
    expect(r.found).toBe(true);
    expect(r.terms.map((t) => t.id).sort()).toEqual(["etf", "mutual_fund"]);
  });

  it("says plainly when a term isn't in the glossary, suggests the closest, and lets the assistant explain it", () => {
    const r = explainTerm("dividend reinvestment plan");
    const sc = r.structuredContent as { found: boolean; closest: string[] };
    expect(sc.found).toBe(false);
    expect(sc.closest).toContain("Dividend");
    expect(r.content[0]!.text).toContain("say it isn't from the glossary");
  });
});

describe("labels that say what things are", () => {
  it("an evidence brief says when no headline names the asset", () => {
    expect(readFileSync("src/mcp/server.ts", "utf8")).toContain("newsNamesIt: about.length > 0,");
    expect(BRIEF_APP_HTML).toContain('d.newsNamesIt === false ? "Latest official releases (none name it)" : "In the news"');
  });

  it("the home page's chart says it's an example and when it was captured", () => {
    expect(readFileSync("index.html", "utf8")).toContain("<figcaption>An example answer, captured 15 November 2026. Ask your assistant for today's prices.</figcaption>");
  });
});

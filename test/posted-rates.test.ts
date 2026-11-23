import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { whatsChanged } from "../src/core/whats-changed";
import { captureEconomy, type CaptureEnv } from "../src/data/capture";
import { ECONOMY_SCHEMA, ECONOMY_SOURCES, INDICATOR_IDS, parsePostedRate, type EconomyFile } from "../src/data/economy";
import { dataSeries, economySnapshot, rateChangeImpactTool, setFeatures, type Fetcher } from "../src/mcp/server";

// The Bank of Canada's weekly posted rates, saved on 23 Nov 2026 (test/fixtures/economy/boc-posted.json).
const body = JSON.parse(readFileSync("test/fixtures/economy/boc-posted.json", "utf8")) as unknown;
const AT = "2026-11-23T12:00:00.000Z";
const NOW = Date.parse(AT);

describe("Canada's posted rates from the Bank of Canada", () => {
  it("reads the chartered banks' prime, 5-year mortgage and 5-year GIC rates", () => {
    const prime = parsePostedRate("ca_prime_rate")(body, AT)!;
    expect(prime).toMatchObject({ id: "ca_prime_rate", value: 4.7, period: "2026-11-18", source: "Bank of Canada" });
    expect(parsePostedRate("ca_mortgage_5y")(body, AT)).toMatchObject({ value: 6.19 });
    expect(parsePostedRate("ca_gic_5y")(body, AT)).toMatchObject({ value: 2.75 });
    expect(prime.sourceUrl).toBe("https://www.bankofcanada.ca/rates/banking-and-financial-statistics/posted-interest-rates-offered-by-chartered-banks/");
  });

  it("says a change appears in the weekly figures, and what each rate is and isn't", () => {
    const prime = parsePostedRate("ca_prime_rate")(body, AT)!;
    expect(prime.note).toContain("First at this level in the weekly figures for 2026-11-04, up from 4.45%.");
    expect(prime.note).toContain("prime minus a discount");
    expect(parsePostedRate("ca_gic_5y")(body, AT)!.note).toContain("down from 3.00%");
    const mortgage = parsePostedRate("ca_mortgage_5y")(body, AT)!.note!;
    expect(mortgage).toContain("most borrowers negotiate a lower one");
    // The posted rate stopped being the stress-test benchmark in 2021: never claimed.
    expect(mortgage).not.toMatch(/stress test/i);
  });

  it("is captured once for all three, and placed with Canada's figures", async () => {
    const gets: string[] = [];
    const env: CaptureEnv = { get: async (u) => { gets.push(u); if (u === ECONOMY_SOURCES.bocPosted) return JSON.stringify(body); throw new Error("x"); }, sleep: async () => undefined, now: NOW, log: () => undefined };
    const out = (await captureEconomy(env, null))!;
    expect(gets.filter((u) => u === ECONOMY_SOURCES.bocPosted)).toHaveLength(1);
    expect(out.indicators.map((i) => i.id)).toEqual(["ca_prime_rate", "ca_mortgage_5y", "ca_gic_5y"]);
    expect(INDICATOR_IDS.indexOf("ca_prime_rate")).toBe(INDICATOR_IDS.indexOf("ca_policy_rate") + 1);
  });
});

describe("in the connector", () => {
  afterEach(() => setFeatures(undefined));
  const file = (): EconomyFile => ({
    schema: ECONOMY_SCHEMA, generatedAt: AT,
    indicators: (["ca_prime_rate", "ca_mortgage_5y", "ca_gic_5y"] as const).map((id) => parsePostedRate(id)(body, AT)!),
    calendar: { capturedAt: AT, events: [] },
  });
  const serve: Fetcher = async (url) => (url.endsWith("/economy.json") ? new Response(JSON.stringify(file())) : new Response("no", { status: 404 }));

  it("answers mortgage, prime and GIC questions with the posted rates", async () => {
    const ids = async (t: string) => ((await economySnapshot(t, serve, NOW)).structuredContent as { indicators: { id: string }[] }).indicators.map((i) => i.id);
    expect(await ids("mortgage")).toEqual(["ca_prime_rate", "ca_mortgage_5y"]);
    expect(await ids("prime rate")).toEqual(["ca_prime_rate"]);
    expect(await ids("gic")).toEqual(["ca_gic_5y"]);
    const s = (await dataSeries("prime rate", undefined, serve)).structuredContent as { series: { id: string; licence: string }[] };
    expect(s.series[0]).toMatchObject({ id: "ca_prime_rate" });
    expect(s.series[0]!.licence).toContain("Bank of Canada");
  });

  it("shows today's prime beside a Canadian variable-mortgage or HELOC answer, for reference only", async () => {
    const r = await rateChangeImpactTool({ product: "heloc", balance: 50000, rate_pct: 7.2, change_pts: -0.25, country: "CA" }, serve);
    const t = r.content[0]!.text;
    expect(t).toContain("For reference: Canada prime rate (chartered banks) is 4.70% (weekly figures for 2026-11-18, Bank of Canada");
    expect(t).toContain("your own rate is the one worked out above");
    expect((r.structuredContent as { reference: { valuePct: number } }).reference.valuePct).toBe(4.7);
    // The person's own numbers are what's worked out: the reference never replaces them.
    expect((r.structuredContent as { inputs: { ratePct: number } }).inputs.ratePct).toBe(7.2);
  });

  it("adds the GIC rate for a GIC, and nothing for the US or when the data can't be read", async () => {
    expect((await rateChangeImpactTool({ product: "gic_cd", balance: 10000, rate_pct: 3, change_pts: -0.25, country: "CA" }, serve)).content[0]!.text).toContain("Canada 5-year GIC rate (posted) is 2.75%");
    expect((await rateChangeImpactTool({ product: "heloc", balance: 50000, rate_pct: 8, change_pts: -0.25, country: "US" }, serve)).content[0]!.text).not.toContain("For reference");
    const down: Fetcher = async () => new Response("down", { status: 503 });
    const r = await rateChangeImpactTool({ product: "heloc", balance: 50000, rate_pct: 7, change_pts: 0.25, country: "CA" }, down);
    expect(r.isError).toBeFalsy();
    expect(r.content[0]!.text).not.toContain("For reference");
  });

  it("reports a posted-rate change as first seen in the weekly figures", () => {
    const r = whatsChanged({ economy: file(), docs: null, topic: "canada", since: Date.parse("2026-10-20"), now: NOW });
    expect(r.changes.find((c) => c.id === "ca_prime_rate")?.claim).toBe("Canada prime rate (chartered banks) rose from 4.45% to 4.70%, first shown in the weekly figures for 2026-11-04.");
  });
});

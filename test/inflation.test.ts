import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import levels from "../src/data/price-levels.json";
import { coverage, inflationCalculator, priceCountry, type InflationResult } from "../src/core/inflation";
import { handle, inflationCalculatorTool, setFeatures, type Fetcher } from "../src/mcp/server";

const ok = (r: ReturnType<typeof inflationCalculator>): InflationResult => {
  if ("error" in r) throw new Error(r.error);
  return r;
};

describe("the official yearly price indexes", () => {
  it("has every year from the first to the latest full year for each country, all positive, each with its source and licence", () => {
    const want = { US: 1913, CA: 1914, UK: 1988, EA: 1997 } as const;
    for (const [c, s] of Object.entries(levels.series)) {
      const years = Object.keys(s.values).map(Number).sort((a, b) => a - b);
      expect(years[0], c).toBe(want[c as keyof typeof want]);
      for (let i = 1; i < years.length; i++) expect(years[i]! - years[i - 1]!, `${c} ${years[i]}`).toBe(1);
      expect(Object.values(s.values).every((v) => typeof v === "number" && v > 0), c).toBe(true);
      expect(s.source && s.sourceUrl.startsWith("https://") && s.licence, c).toBeTruthy();
    }
  });

  it("matches the BLS's published 2024 average for the US CPI-U", () => {
    expect(levels.series.US.values["2024"]).toBe(313.689);
  });
});

describe("what money from one year buys in another", () => {
  it("uses amount × (index in the later year ÷ index in the earlier year)", () => {
    const v = levels.series.US.values;
    const r = ok(inflationCalculator({ country: "US", amount: 1000, fromYear: 1990, toYear: 2025 }));
    expect(r.value).toBe(Math.round(1000 * (v["2025"] / v["1990"]) * 100) / 100);
    expect(r.lines[0]).toBe(`In the US, $1,000 in 1990 buys about what $${Math.round(r.value).toLocaleString("en-US")} buys in 2025.`);
    expect(r.lines[1]).toMatch(/^Prices rose [\d.]+% between 1990 and 2025, about [\d.]+% a year on average\.$/);
    expect(r.points[0]).toEqual({ year: 1990, value: 1000 });
    expect(r.points.at(-1)?.year).toBe(2025);
    expect(r.points).toHaveLength(36);
  });

  it("defaults to the latest full year, and reads well going back in time", () => {
    expect(ok(inflationCalculator({ country: "CA", amount: 100, fromYear: 2000 })).toYear).toBe(coverage("CA").to);
    const back = ok(inflationCalculator({ country: "UK", amount: 50, fromYear: 2025, toYear: 2000 }));
    expect(back.lines[0]).toContain("£50.00 in 2025 buys about what");
    expect(back.lines[0]).toContain("bought in 2000");
    expect(back.lines[1]).toMatch(/^Prices rose [\d.]+% between 2000 and 2025/);
    expect(back.value).toBeLessThan(50);
  });

  it("says plainly when a year is outside a country's index, and never guesses", () => {
    const uk = inflationCalculator({ country: "UK", amount: 10, fromYear: 1970 });
    expect("error" in uk && uk.error).toContain("starts in 1988");
    const future = inflationCalculator({ country: "US", amount: 10, fromYear: 2000, toYear: coverage("US").to + 1 });
    expect("error" in future && future.error).toContain("the latest full year");
    expect("error" in inflationCalculator({ country: "US", amount: 0, fromYear: 2000 })).toBe(true);
    expect("error" in inflationCalculator({ country: "US", amount: 10, fromYear: 2000, toYear: 2000 })).toBe(true);
  });

  it("notes that the euro area's make-up changes, and never forecasts", () => {
    const r = ok(inflationCalculator({ country: "EA", amount: 1000, fromYear: 1999 }));
    expect(r.lines.join(" ")).toContain("make-up changes as countries join");
    for (const c of ["US", "CA", "UK", "EA"] as const) {
      const t = ok(inflationCalculator({ country: c, amount: 100, fromYear: coverage(c).from + 5 })).lines.join(" ");
      expect(t).not.toMatch(/\b(will|expected to|likely|you should|buy|sell)\b/i);
    }
  });

  it("understands the usual ways of naming each place", () => {
    expect(["usa", "United States", "USD"].map(priceCountry)).toEqual(["US", "US", "US"]);
    expect(["canada", "CAD"].map(priceCountry)).toEqual(["CA", "CA"]);
    expect(["Britain", "gbp", "UK"].map(priceCountry)).toEqual(["UK", "UK", "UK"]);
    expect(["eurozone", "euro area", "EUR"].map(priceCountry)).toEqual(["EA", "EA", "EA"]);
    expect(priceCountry("Japan")).toBeNull();
  });
});

describe("in the connector and the app", () => {
  afterEach(() => setFeatures(undefined));
  const none: Fetcher = async () => new Response("no", { status: 404 });

  it("is off until V2_TOOLS names it, and on in this deployment", async () => {
    setFeatures(undefined);
    const off = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "inflation_calculator", arguments: { amount: 100, from_year: 2000 } } }, none);
    expect(off?.error).toBeTruthy();
    expect(readFileSync("wrangler.toml", "utf8")).toMatch(/V2_TOOLS = "[^"]*inflation_calculator/);
    setFeatures("inflation_calculator");
    const on = await handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "inflation_calculator", arguments: { amount: 100, from_year: 2000, country: "CA" } } }, none);
    const res = on?.result as { content: { text: string }[]; structuredContent: { country: string; value: number } };
    expect(res.structuredContent.country).toBe("CA");
    expect(res.content[0]!.text).toContain("Statistics Canada Open Licence");
  });

  it("assumes the US when no country is given, and says so", () => {
    const r = inflationCalculatorTool({ amount: 100, from_year: 2000 });
    expect(r.content[0]!.text).toContain("the US was assumed");
    expect(inflationCalculatorTool({ amount: 100, from_year: 2000, country: "Japan" }).isError).toBe(true);
  });

  it("has a card in the app's Tools section, worked out in the browser", () => {
    const tools = readFileSync("src/wallet/tools-section.ts", "utf8");
    expect(tools).toContain("slot.replaceChildren(rateCard(), inflationCard(), growthCard(), scamCard());");
    expect(tools).toContain('from "../core/inflation"');
  });
});

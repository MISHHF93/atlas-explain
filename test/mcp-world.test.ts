import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureWorld, type CaptureEnv } from "../src/data/capture";
import { parseData360, readWorldFile, WORLD_INDICATORS, worldUrl, type WorldFile } from "../src/data/world";
import { compareCountries, type Fetcher } from "../src/mcp/server";

// Real World Bank Data360 answers for the G20, saved on 18 Nov 2026 (test/fixtures/world), trimmed to the fields read.
const fixture = (code: string) => readFileSync(`test/fixtures/world/${code.replace("WB_WDI_", "")}.json`, "utf8");
const AT = "2026-11-18T06:00:00.000Z";

async function world(): Promise<WorldFile> {
  const env: CaptureEnv = {
    get: async (url) => {
      const code = /INDICATOR=([A-Z_]+)/.exec(url)![1]!;
      return fixture(code);
    },
    sleep: async () => {},
    now: Date.parse(AT),
    log: () => {},
  } as CaptureEnv;
  return (await captureWorld(env, null))!;
}
const serve = (body: unknown): Fetcher => async () => new Response(JSON.stringify(body), { status: 200 });
const text = (r: { content: { text: string }[] }) => r.content[0]!.text;

describe("countries compared (World Bank, G20)", () => {
  it("asks Data360 for one indicator, every G20 member and the last nine years", () => {
    const url = worldUrl("WB_WDI_FP_CPI_TOTL_ZG", 2026);
    expect(url).toContain("REF_AREA=USA,CAN,");
    expect(url).toContain("timePeriodFrom=2017&timePeriodTo=2026");
  });

  it("keeps actual values only, per country, oldest first", () => {
    const d = parseData360(JSON.parse(fixture("NY_GDP_MKTP_KD_ZG")), "gdp_growth", AT)!;
    expect(d.rows).toHaveLength(20);
    const us = d.rows.find((r) => r.country === "USA")!.series;
    expect(us.map((p) => p.year)).toEqual([...us.map((p) => p.year)].sort());
    expect(us.at(-1)!.year).toBe("2025");
    // A forecast row is never kept, and an empty value never becomes a number.
    const body = { value: [{ REF_AREA: "USA", TIME_PERIOD: "2027", OBS_VALUE: "2.0", OBS_STATUS: "F" }, { REF_AREA: "CAN", TIME_PERIOD: "2025", OBS_VALUE: "", OBS_STATUS: "A" }, { REF_AREA: "XXX", TIME_PERIOD: "2025", OBS_VALUE: "1", OBS_STATUS: "A" }] };
    expect(parseData360(body, "gdp_growth", AT)).toBeNull();
  });

  it("captures all four indicators, and keeps the last good values when a source fails", async () => {
    const file = await world();
    expect(file.indicators.map((i) => i.id)).toEqual(WORLD_INDICATORS.map((i) => i.id));
    expect(readWorldFile(JSON.parse(JSON.stringify(file)))).not.toBeNull();
    const failing = { get: async () => { throw new Error("down"); }, sleep: async () => {}, now: Date.parse(AT), log: () => {} } as unknown as CaptureEnv;
    const kept = (await captureWorld(failing, file))!;
    expect(kept.indicators).toEqual(file.indicators);
    expect(await captureWorld(failing, null)).toBeNull();
  });

  it("compares one indicator across chosen countries, highest first, each with its year and the source", async () => {
    const file = await world();
    const r = await compareCountries("inflation", "Canada, Japan, US", serve(file));
    const lines = text(r).split("\n");
    expect(lines[0]).toMatch(/^Inflation \(/);
    expect(lines.slice(1, 4).map((l) => l.replace(/:.*/, ""))).toEqual(expect.arrayContaining(["- Canada", "- Japan", "- United States"]));
    for (const l of lines.slice(1, 4)) expect(l).toMatch(/\d\.\d%  ?\(20\d\d\)|\d\.\d% \(20\d\d\)/);
    const values = lines.slice(1, 4).map((l) => Number(/(-?\d+\.\d)%/.exec(l)![1]));
    expect(values).toEqual([...values].sort((a, b) => b - a));
    expect(text(r)).toContain("World Bank, World Development Indicators");
    expect(text(r)).toContain("never a projection");
  });

  it("gives every indicator for the whole G20 by default, and says plainly when it can't help", async () => {
    const file = await world();
    const all = (await compareCountries(undefined, undefined, serve(file))).structuredContent as { countries: { code: string; values: Record<string, { year: string } | null> }[] };
    expect(all.countries).toHaveLength(20);
    expect(Object.keys(all.countries[0]!.values)).toEqual(WORLD_INDICATORS.map((i) => i.id));
    expect((await compareCountries("happiness", undefined, serve(file))).isError).toBe(true);
    expect(text(await compareCountries(undefined, "Narnia", serve(file)))).toContain("Not in the G20 list");
    expect((await compareCountries(undefined, undefined, async () => new Response("no", { status: 404 }))).isError).toBe(true);
  });
});

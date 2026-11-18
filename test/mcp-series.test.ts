import { describe, expect, it } from "vitest";
import { ECONOMY_SCHEMA } from "../src/data/economy";
import { WORLD_SCHEMA } from "../src/data/world";
import { dataSeries, EDUCATION_LINE, handle, type Fetcher } from "../src/mcp/server";

const AT = "2026-11-18T12:00:00.000Z";
const indicator = (id: string, name: string, unit: "%" | "USD", source: string, sourceUrl: string, series: { t: string; v: number }[]) => ({
  id, name, unit, value: series[series.length - 1]!.v, period: series[series.length - 1]!.t, change: null, changeWindow: "vs the month before", note: null, series, source, sourceUrl, capturedAt: AT,
});
const economy = {
  schema: ECONOMY_SCHEMA, generatedAt: AT,
  indicators: [
    indicator("us_cpi", "US inflation (CPI, over 12 months)", "%", "U.S. Bureau of Labor Statistics", "https://www.bls.gov/cpi/", [{ t: "2026-07", v: 3.2 }, { t: "2026-08", v: 3.4 }, { t: "2026-09", v: 3.74 }]),
    indicator("uk_bank_rate", "UK Bank Rate", "%", "Bank of England", "https://www.bankofengland.co.uk/", [{ t: "2026-09-18", v: 3.75 }, { t: "2026-11-05", v: 4 }]),
  ],
  calendar: { capturedAt: AT, events: [] },
};
const world = {
  schema: WORLD_SCHEMA, generatedAt: AT,
  indicators: [{ id: "inflation", capturedAt: AT, rows: [
    { country: "JPN", series: [{ year: "2023", value: 3.3 }, { year: "2024", value: 2.7 }] },
    { country: "DEU", series: [{ year: "2023", value: 5.9 }, { year: "2024", value: 2.3 }] },
    { country: "USA", series: [{ year: "2023", value: 4.1 }, { year: "2024", value: 2.9 }] },
  ] }],
};
const net: Fetcher = async (url) => new Response(JSON.stringify(url.includes("world") ? world : url.includes("economy") ? economy : {}), { status: url.includes("world") || url.includes("economy") ? 200 : 404 });
const body = (r: { content: { text: string }[] }) => r.content[0]!.text;

describe("data_series: rows for charts, spreadsheets and reports", () => {
  it("lists what it can give when asked for nothing", async () => {
    const r = await dataSeries(undefined, undefined, net);
    const ids = (r.structuredContent!.available as { id: string }[]).map((a) => a.id);
    expect(ids).toEqual(["us_cpi", "uk_bank_rate", "world_inflation"]);
    expect(body(r)).toContain("Crypto and stock prices aren't offered as data");
  });

  it("gives an indicator's dated rows with its source, licence and CSV", async () => {
    const r = await dataSeries("us_cpi, bank of england", undefined, net);
    const s = r.structuredContent!.series as { id: string; frequency: string; licence: string; points: { date: string; value: number }[] }[];
    expect(s.map((x) => [x.id, x.frequency, x.points.length])).toEqual([["us_cpi", "monthly", 3], ["uk_bank_rate", "daily", 2]]);
    expect(s[0]!.licence).toContain("Public domain");
    expect(s[1]!.licence).toContain("Bank of England");
    const csv = r.structuredContent!.csv as string;
    expect(csv.split("\n")[0]).toBe("series,name,country,date,value,unit");
    expect(csv).toContain('us_cpi,"US inflation (CPI, over 12 months)",,2026-09,3.74,%');
    expect(body(r)).toContain("```csv");
    expect(body(r).endsWith(EDUCATION_LINE)).toBe(true);
  });

  it("gives World Bank series per country, and a plain word means the World Bank one when countries are named", async () => {
    const r = await dataSeries("inflation", "Japan, Germany", net);
    const s = r.structuredContent!.series as { id: string; country: string; name: string; licence: string }[];
    expect(s.map((x) => [x.id, x.country])).toEqual([["world_inflation", "JPN"], ["world_inflation", "DEU"]]);
    expect(s[0]!.name).toBe("Inflation, Japan");
    expect(s[0]!.licence).toContain("CC BY 4.0");
    // Without countries, a world_ id defaults to the United States.
    expect(((await dataSeries("world_inflation", undefined, net)).structuredContent!.series as { country: string }[])[0]!.country).toBe("USA");
  });

  it("never offers crypto or stock prices as data, and refuses unknown series, countries and too many at once", async () => {
    for (const q of ["bitcoin", "AAPL", "crypto prices"]) {
      const r = await dataSeries(q, undefined, net);
      expect(r.isError, q).toBe(true);
      expect(body(r)).toContain("don't allow redistribution");
    }
    expect((await dataSeries("moon phases", undefined, net)).isError).toBe(true);
    expect((await dataSeries("inflation", "Atlantis", net)).isError).toBe(true);
    expect((await dataSeries("a, b, c, d, e", undefined, net)).isError).toBe(true);
  });

  it("says plainly when the data can't be loaded", async () => {
    const down: Fetcher = async () => new Response("down", { status: 503 });
    const r = await dataSeries("us_cpi", undefined, down);
    expect(r.isError).toBe(true);
    expect(body(r)).toContain("couldn't be loaded");
  });

  it("is reachable through the JSON-RPC handler", async () => {
    const reply = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "data_series", arguments: { series: "us_cpi" } } }, net);
    expect((reply?.result as { structuredContent: { series: unknown[] } }).structuredContent.series).toHaveLength(1);
  });
});

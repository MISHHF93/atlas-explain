import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { captureEconomy, type CaptureEnv } from "../src/data/capture";
import {
  ECONOMY_SOURCES,
  EUROSTAT_UNEMPLOYMENT_URL,
  INDICATOR_IDS,
  onsMonths,
  parseEurostatUnemployment,
  parseOnsCpi,
  parseOnsUnemployment,
  parseStatcanCpi,
  parseStatcanUnemployment,
  readEconomyFile,
  statcanSeries,
  STATCAN_VECTORS,
  type EconomyFile,
} from "../src/data/economy";
import { dataSeries, economySnapshot, type Fetcher } from "../src/mcp/server";

// Real responses saved from Statistics Canada, the ONS and Eurostat on 22 Nov 2026 (test/fixtures/economy).
const fx = (name: string) => readFileSync(`test/fixtures/economy/${name}`, "utf8");
const json = (name: string) => JSON.parse(fx(name)) as unknown;
const AT = "2026-11-22T12:00:00.000Z";
const NOW = Date.parse(AT);

describe("Canada: Statistics Canada", () => {
  it("works out inflation over 12 months from the CPI index, as Statistics Canada does, with its table credited", () => {
    const body = json("statcan-vectors.json");
    const index = statcanSeries(body).get(STATCAN_VECTORS.cpi)!;
    const oct = index.find((p) => p.t === "2026-10")!.v;
    const octBefore = index.find((p) => p.t === "2025-10")!.v;
    const cpi = parseStatcanCpi(body, AT)!;
    expect(cpi).toMatchObject({ id: "ca_cpi", name: "Canada inflation (CPI, over 12 months)", unit: "%", period: "2026-10", source: "Statistics Canada, table 18-10-0004-01" });
    expect(cpi.value).toBe(Math.round(((oct - octBefore) / octBefore) * 1000) / 10);
    expect(cpi.value).toBe(3.1);
    expect(cpi.series).toHaveLength(13);
    expect(cpi.sourceUrl).toBe("https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1810000401");
  });

  it("reads the unemployment rate", () => {
    expect(parseStatcanUnemployment(json("statcan-vectors.json"), AT)).toMatchObject({ id: "ca_unemployment", value: 6.7, period: "2026-10", change: 0.2, source: "Statistics Canada, table 14-10-0287-01" });
  });

  it("gives nothing for an answer it doesn't recognise", () => {
    expect(parseStatcanCpi([{ status: "FAILED" }], AT)).toBeNull();
    expect(parseStatcanCpi({ not: "a list" }, AT)).toBeNull();
  });
});

describe("UK: Office for National Statistics", () => {
  it("reads CPI inflation", () => {
    expect(parseOnsCpi(json("ons-cpi.json"), AT)).toMatchObject({ id: "uk_cpi", value: 3.6, period: "2026-10", change: 0.1, source: "Office for National Statistics" });
  });

  it("dates the three-month unemployment rate by its last month, and says it's an average", () => {
    const u = parseOnsUnemployment(json("ons-unemployment.json"), AT)!;
    expect(u).toMatchObject({ id: "uk_unemployment", value: 4.6, period: "2026-09", changeWindow: "vs the three months before" });
    expect(u.note).toContain("three-month average");
    // A window over the new year ends in the next year.
    expect(onsMonths({ months: [{ label: "2026 NOV-JAN", value: "4.5" }] })).toEqual([{ t: "2027-01", v: 4.5 }]);
  });
});

describe("Euro area: Eurostat", () => {
  it("reads the unemployment rate for the current euro area (21 countries since 2026)", () => {
    expect(parseEurostatUnemployment(json("eurostat-unemployment.json"), AT)).toMatchObject({ id: "euro_unemployment", value: 6.5, period: "2026-09", source: "Eurostat (une_rt_m)" });
  });

  it("follows the euro area's code when a country joins: the newest one with figures", () => {
    const body = {
      id: ["freq", "unit", "s_adj", "sex", "age", "geo", "time"],
      size: [1, 1, 1, 1, 1, 2, 2],
      dimension: { geo: { category: { index: { EA21: 0, EA22: 1 } } }, time: { category: { index: { "2027-01": 0, "2027-02": 1 } } } },
      // EA21 has an old figure; EA22 has both months.
      value: { "0": 6.1, "2": 6.0, "3": 5.9 },
    };
    expect(parseEurostatUnemployment(body, AT)).toMatchObject({ value: 5.9, period: "2027-02" });
    expect(EUROSTAT_UNEMPLOYMENT_URL).toContain("geo=EA21");
    expect(EUROSTAT_UNEMPLOYMENT_URL).toContain("geo=EA25");
    expect(parseEurostatUnemployment({ error: { status: "400" } }, AT)).toBeNull();
  });
});

describe("captured with the rest of the economy", () => {
  const routes: [(u: string) => boolean, string][] = [
    [(u) => u.includes("statcan.gc.ca/t1/wds"), "statcan-vectors.json"],
    [(u) => u === ECONOMY_SOURCES.onsCpi, "ons-cpi.json"],
    [(u) => u === ECONOMY_SOURCES.onsUnemployment, "ons-unemployment.json"],
    [(u) => u === EUROSTAT_UNEMPLOYMENT_URL, "eurostat-unemployment.json"],
  ];

  it("asks Statistics Canada once for both series, and keeps the shown order", async () => {
    const gets: string[] = [];
    const env: CaptureEnv = {
      get: async (url) => {
        gets.push(url);
        const hit = routes.find(([m]) => m(url));
        if (!hit) throw new Error("not in this test");
        return fx(hit[1]);
      },
      sleep: async () => undefined,
      now: NOW,
      log: () => undefined,
    };
    const out = (await captureEconomy(env, null))!;
    expect(gets.filter((u) => u.includes("statcan.gc.ca")).length).toBe(1);
    expect(out.indicators.map((i) => i.id)).toEqual(["euro_unemployment", "ca_cpi", "ca_unemployment", "uk_cpi", "uk_unemployment"]);
    expect(INDICATOR_IDS.indexOf("ca_cpi")).toBeLessThan(INDICATOR_IDS.indexOf("ca_policy_rate"));
    // The published file reads back with the new figures.
    expect(readEconomyFile(JSON.parse(JSON.stringify(out)))?.indicators).toHaveLength(5);
  });

  it("keeps a figure's last good value when its agency doesn't answer", async () => {
    const prev = (await captureEconomy({ get: async (u) => fx(routes.find(([m]) => m(u))?.[1] ?? "x"), sleep: async () => undefined, now: NOW, log: () => undefined }, null))!;
    const out = (await captureEconomy({ get: async () => { throw new Error("offline"); }, sleep: async () => undefined, now: NOW + 3_600_000, log: () => undefined }, prev))!;
    expect(out.indicators.find((i) => i.id === "uk_cpi")?.capturedAt).toBe(AT);
  });
});

describe("in the connector", () => {
  const file = async (): Promise<EconomyFile> => {
    const env: CaptureEnv = { get: async (u) => { const name = [["statcan.gc.ca", "statcan-vectors.json"], ["d7g7", "ons-cpi.json"], ["mgsx", "ons-unemployment.json"], ["une_rt_m", "eurostat-unemployment.json"]].find(([k]) => u.includes(k!))?.[1]; if (!name) throw new Error("x"); return fx(name); }, sleep: async () => undefined, now: NOW, log: () => undefined };
    return (await captureEconomy(env, null))!;
  };
  const serve = (f: EconomyFile): Fetcher => async (url) => (url.endsWith("/economy.json") ? new Response(JSON.stringify(f)) : new Response("no", { status: 404 }));

  it("answers a country's question with that country's figures", async () => {
    const f = serve(await file());
    const ids = async (topic: string) => ((await economySnapshot(topic, f, NOW)).structuredContent as { indicators: { id: string }[] }).indicators.map((i) => i.id);
    expect(await ids("canada inflation")).toEqual(["ca_cpi"]);
    expect(await ids("UK")).toEqual(["uk_cpi", "uk_unemployment"]);
    expect(await ids("unemployment")).toEqual(["euro_unemployment", "ca_unemployment", "uk_unemployment"]);
    expect(await ids("eurozone unemployment")).toEqual(["euro_unemployment"]);
    const t = (await economySnapshot("uk unemployment", f, NOW)).content[0]!.text;
    expect(t).toContain("UK unemployment rate: 4.60% for 2026-09");
    expect(t).toContain("three-month average");
  });

  it("serves them as data series, each with its licence", async () => {
    const r = await dataSeries("uk inflation, canada unemployment, euro unemployment", undefined, serve(await file()));
    const s = (r.structuredContent as { series: { id: string; licence: string; points: unknown[] }[] }).series;
    expect(s.map((x) => x.id)).toEqual(["uk_cpi", "ca_unemployment", "euro_unemployment"]);
    expect(s[0]!.licence).toContain("Open Government Licence");
    expect(s[1]!.licence).toContain("Statistics Canada Open Licence");
    expect(s[2]!.licence).toContain("Eurostat");
    expect(s.every((x) => x.points.length === 13)).toBe(true);
  });
});

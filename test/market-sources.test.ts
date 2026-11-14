import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateAsset } from "../src/core/asset-schema";
import { formatValue, readMarketFile } from "../src/core/catalog";
import {
  EIA_SERIES,
  MARKET_SCHEMA,
  noonUtc,
  parseBocBonds,
  parseBocFx,
  parseEcbXml,
  parseEiaSeries,
  parseTreasuryCsv,
} from "../src/data/market-sources";

// Fixtures are real responses captured on 2026-11-13 (trimmed), so the parsers are tested on real formats.
const fx = (name: string) => readFileSync(`test/fixtures/market/${name}`, "utf8");
const NOW = Date.parse("2026-11-13T23:00:00Z");
const allValid = (assets: { id: string }[]) => {
  for (const a of assets) expect(validateAsset(a as never, NOW).errors, a.id).toEqual([]);
};

describe("US Treasury par yield curve", () => {
  const assets = parseTreasuryCsv(fx("treasury.csv"), NOW);
  it("reads every tenor from the latest row, with change vs the previous business day in points", () => {
    expect(assets.map((a) => a.symbol)).toEqual(["US1M", "US3M", "US6M", "US1Y", "US2Y", "US5Y", "US10Y", "US20Y", "US30Y"]);
    const ten = assets.find((a) => a.id === "rate:US:10Y")!;
    expect(ten.quote?.value).toBe(5.15);
    expect(ten.quote?.change).toBe(0.05);
    expect(ten.quote?.changePct).toBeNull();
    expect(ten.quote?.asOf).toBe("2026-11-13T12:00:00Z");
    expect(ten.quote?.source.providerId).toBe("us_treasury");
    allValid(assets);
  });
  it("publishes nothing when the latest row is stale or the file is empty", () => {
    expect(parseTreasuryCsv(fx("treasury.csv"), Date.parse("2027-01-30T00:00:00Z"))).toEqual([]);
    expect(parseTreasuryCsv("Date,\"1 Mo\"\n", NOW)).toEqual([]);
  });
});

describe("ECB euro reference rates", () => {
  const assets = parseEcbXml(fx("ecb.xml"), NOW);
  it("reads EUR pairs directly and labels crosses derived from two ECB rates", () => {
    const eurusd = assets.find((a) => a.id === "fx:EURUSD")!;
    expect(eurusd.quote?.value).toBe(1.1052);
    expect(eurusd.classData).toMatchObject({ base: "EUR", quote: "USD", derived: false });
    const gbpusd = assets.find((a) => a.id === "fx:GBPUSD")!;
    expect(gbpusd.quote?.value).toBeCloseTo(1.1052 / 0.83559, 4);
    expect(gbpusd.classData).toMatchObject({ derived: true });
    expect(assets.find((a) => a.id === "fx:USDJPY")!.quote?.value).toBeCloseTo(176.83 / 1.1052, 2);
    allValid(assets);
  });
});

describe("Bank of Canada", () => {
  it("reads CAD pairs and drops discontinued series instead of showing old values", () => {
    const assets = parseBocFx(fx("boc-fx.json"), NOW);
    expect(assets.map((a) => a.id)).toEqual(["fx:USDCAD", "fx:EURCAD", "fx:GBPCAD", "fx:JPYCAD", "fx:CNYCAD", "fx:MXNCAD"]);
    for (const a of assets) expect(a.quote!.asOf >= "2026-11-03").toBe(true);
    allValid(assets);
  });
  it("reads benchmark bond yields and skips the real-return bond", () => {
    const assets = parseBocBonds(fx("boc-bonds.json"), NOW);
    expect(assets.map((a) => a.symbol)).toEqual(["CA2Y", "CA3Y", "CA5Y", "CA7Y", "CA10Y", "CALONG"]);
    expect(assets[0]!.quote?.value).toBe(3.33);
    allValid(assets);
  });
});

describe("EIA energy prices", () => {
  const body = JSON.stringify({ response: { data: [
    { period: "2026-11-07", value: "72.10" },
    { period: "2026-11-10", value: "71.40" },
    { period: "2026-11-09", value: "" },
  ] } });
  it("reads string values (EIA API v2), newest first, with the publication lag stated", () => {
    const wti = parseEiaSeries(body, EIA_SERIES[0]!, NOW)!;
    expect(wti.quote).toMatchObject({ value: 71.4, change: -0.7, mode: "daily", asOf: "2026-11-10T12:00:00Z" });
    expect(wti.classData).toMatchObject({ unit: "barrel", publishLagDays: 3 });
    allValid([wti]);
  });
  it("refuses empty or stale series", () => {
    expect(parseEiaSeries(JSON.stringify({ response: { data: [] } }), EIA_SERIES[0]!, NOW)).toBeNull();
    expect(parseEiaSeries(body, EIA_SERIES[0]!, Date.parse("2027-02-01T00:00:00Z"))).toBeNull();
  });
});

describe("the published market file, as the app reads it", () => {
  const assets = [...parseTreasuryCsv(fx("treasury.csv"), NOW), ...parseEcbXml(fx("ecb.xml"), NOW)];
  const file = { schema: MARKET_SCHEMA, generatedAt: "2026-11-13T23:00:00Z", sources: {}, assets };

  it("keeps valid records and drops anything that fails the contract", () => {
    expect(readMarketFile(file, NOW)).toHaveLength(assets.length);
    const tampered = structuredClone(file);
    tampered.assets[0]!.quote!.source = { ...tampered.assets[0]!.quote!.source, attribution: { text: "", href: "" } };
    (tampered.assets[1] as { name: string }).name = "You should buy this";
    expect(readMarketFile(tampered, NOW)).toHaveLength(assets.length - 2);
  });

  it("ignores the wrong schema and never lets crypto in through this path", () => {
    expect(readMarketFile({ ...file, schema: "other" }, NOW)).toEqual([]);
    expect(readMarketFile(null, NOW)).toEqual([]);
    const crypto = structuredClone(file);
    (crypto.assets[0] as { class: string }).class = "crypto";
    expect(readMarketFile(crypto, NOW)).toHaveLength(assets.length - 1);
  });

  it("formats small exchange rates without losing their digits", () => {
    const jpycad = parseBocFx(fx("boc-fx.json"), NOW).find((a) => a.id === "fx:JPYCAD")!;
    expect(formatValue(jpycad)).toBe("0.008920");
    expect(noonUtc("2026-11-13")).toBe("2026-11-13T12:00:00Z");
  });
});

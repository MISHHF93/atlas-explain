import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readCoinGeckoChart, thinEvenly } from "../src/core/coingecko";
import { CHART_RANGES, supportsChartRanges } from "../src/core/price-provider";
import { hasDiagram } from "../src/wallet/term-diagrams";

describe("coin chart ranges", () => {
  it("offers 24 hours, 7 days and 30 days for every coin (the captured file holds 30 days of hourly closes)", () => {
    expect(CHART_RANGES.map((r) => r.label)).toEqual(["24H", "7D", "30D"]);
    expect(supportsChartRanges({ provider: "coingecko" })).toBe(true);
    expect(supportsChartRanges({ provider: "kraken" })).toBe(true);
  });

  it("keeps a long range's whole shape in at most 96 points, first and last included", () => {
    const series = Array.from({ length: 721 }, (_, i) => i);
    const thin = thinEvenly(series, 96);
    expect(thin).toHaveLength(96);
    expect(thin[0]).toBe(0);
    expect(thin.at(-1)).toBe(720);
    expect(thinEvenly([1, 2, 3], 96)).toEqual([1, 2, 3]);
    const body = { prices: series.map((i) => [Date.UTC(2026, 10, 1) + i * 3_600_000, 100 + i]) };
    expect(readCoinGeckoChart(body, 96, true)).toHaveLength(96);
    // The default sparkline still keeps the newest points.
    expect(readCoinGeckoChart(body).at(-1)?.c).toBe(820);
  });

  it("caches each range briefly and leaves a chosen range alone on the live refresh", () => {
    const provider = readFileSync("src/core/price-provider.ts", "utf8");
    const controller = readFileSync("src/wallet/assets-controller.ts", "utf8");
    expect(provider).toContain("CHART_CACHE_MS = 5 * 60_000");
    expect(controller).toContain("if (chosenRange === null) page.setSpark(");
  });
});

describe("glossary diagrams", () => {
  it("draw the spread, a stop-limit order and the yield curve, with labels only and a text description", () => {
    for (const id of ["spread", "stop_limit", "yield_curve"]) expect(hasDiagram(id)).toBe(true);
    const src = readFileSync("src/wallet/term-diagrams.ts", "utf8");
    // No prices or figures in any label: nothing in a diagram can be read as market data.
    const labels = [...src.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]!);
    expect(labels.length).toBeGreaterThan(10);
    for (const label of labels) expect(label, label).not.toMatch(/\d/);
    expect(src).toContain('figure.setAttribute("aria-label", d.alt)');
  });
});

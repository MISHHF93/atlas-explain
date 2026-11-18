import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EIA_SERIES, parseEiaSpotPage } from "../src/data/market-sources";

// The ends of the EIA's own daily history pages, saved on 18 Nov 2026 (test/fixtures/energy).
const page = (name: string) => readFileSync(`test/fixtures/energy/${name}.tail.html`, "utf8");
const NOW = Date.parse("2026-11-18T15:00:00Z");
const meta = (symbol: string) => EIA_SERIES.find((m) => m.symbol === symbol)!;

describe("energy prices without a key, from the EIA's own pages (public domain)", () => {
  it("reads WTI's latest daily spot price and the day before, dated by weekday", () => {
    const wti = parseEiaSpotPage(page("RWTCD"), meta("WTI"), NOW)!;
    // Week of Nov 9: Monday 90.40, Tuesday 89.62, Wednesday 89.62; Thursday and Friday not published yet.
    expect(wti.quote).toMatchObject({ value: 89.62, change: 0, asOf: "2026-11-11T12:00:00Z", mode: "daily" });
    expect(wti.classData).toMatchObject({ class: "commodity", unit: "barrel" });
    expect(wti.quote!.source.label).toMatch(/EIA|Energy Information/);
  });

  it("reads Brent and Henry Hub natural gas the same way", () => {
    const brent = parseEiaSpotPage(page("RBRTED"), meta("BRENT"), NOW)!;
    const gas = parseEiaSpotPage(page("rngwhhdD"), meta("NATGAS"), NOW)!;
    expect(brent.quote!.value).toBe(92.14);
    expect(brent.quote!.change).toBeCloseTo(1.98, 2);
    expect(gas.quote!.value).toBe(3);
    expect(gas.symbol).toBe("NATGAS");
  });

  it("shows nothing rather than an old or missing price", () => {
    expect(parseEiaSpotPage("<html>blocked</html>", meta("WTI"), NOW)).toBeNull();
    // More than three weeks after the last published day: too old to show as current.
    expect(parseEiaSpotPage(page("RWTCD"), meta("WTI"), Date.parse("2026-12-20T15:00:00Z"))).toBeNull();
  });
});

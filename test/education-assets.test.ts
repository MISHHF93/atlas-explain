import { describe, expect, it } from "vitest";
import { validateAsset } from "../src/core/asset-schema";
import { CLASS_INFO, findAsset } from "../src/core/catalog";
import { EDUCATION_ASSETS } from "../src/core/education-assets";
import { ALL_TERMS, TRADING_TERMS } from "../src/core/terms";
import { parseRoute, pathFor } from "../src/app/routes";

const NOW = Date.parse("2026-11-13T23:00:00Z");
const termIds = new Set(ALL_TERMS.map((t) => t.id));

describe("index, futures and options explainer pages", () => {
  it("cover the main indices, common futures and both kinds of options", () => {
    const ids = EDUCATION_ASSETS.map((a) => a.id);
    for (const id of ["index:SPX", "index:DJI", "index:NDX", "index:RUT", "index:TSX", "index:VIX", "future:ES", "future:CL", "future:GC", "future:ZN", "option:EQUITY", "option:SPX"]) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never show a level or price, and always say why", () => {
    for (const a of EDUCATION_ASSETS) {
      expect(a.quote, a.id).toBeNull();
      expect(a.noQuoteReason, a.id).toBeTruthy();
    }
  });

  it("pass the Asset contract, with every fact linked to the owner's public page", () => {
    for (const a of EDUCATION_ASSETS) {
      expect(validateAsset(a, NOW).errors, a.id).toEqual([]);
      expect(a.facts.length, a.id).toBeGreaterThan(1);
      for (const f of a.facts) expect(f.source.attribution.href, `${a.id} ${f.label}`).toMatch(/^https:\/\/www\.(spglobal|nasdaq|cboe|lseg|cmegroup|optionseducation)\.(com|org)\//);
    }
  });

  it("link only to glossary terms that exist, and every class intro does too", () => {
    for (const a of EDUCATION_ASSETS) for (const id of a.relatedTerms) expect(termIds.has(id), `${a.id}: ${id}`).toBe(true);
    for (const info of Object.values(CLASS_INFO)) for (const id of info.learn) expect(termIds.has(id), id).toBe(true);
  });

  it("have addresses the app router accepts", () => {
    for (const a of EDUCATION_ASSETS) {
      const route = parseRoute(pathFor({ kind: "asset", symbol: a.symbol }));
      expect(route.kind, a.symbol).toBe("asset");
      expect(findAsset(EDUCATION_ASSETS, (route as { symbol: string }).symbol)?.id).toBe(a.id);
    }
  });
});

describe("new glossary terms", () => {
  it("explain options and rates without buy or sell wording", () => {
    for (const id of ["call_put", "strike", "greeks", "futures_contract", "yield_curve", "basis_point", "pip", "reference_rate", "filings"]) {
      const t = TRADING_TERMS.find((x) => x.id === id);
      expect(t, id).toBeDefined();
      expect(`${t!.title} ${t!.summary}`).not.toMatch(/\b(buy|sell)\b/i);
    }
  });
});

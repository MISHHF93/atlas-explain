import { describe, expect, it } from "vitest";
import { ALL_TERMS, ATLAS_TERMS, TRADING_TERMS, searchTerms } from "../src/core/terms";
import { GLOSSARY } from "../src/core/glossary";

describe("wallet glossary terms", () => {
  it("lists trading terms plus hybrid inference publicly, and keeps ATLAS research terms out", () => {
    expect(ALL_TERMS.length).toBe(TRADING_TERMS.length + 1);
    expect(ALL_TERMS.map((t) => t.id)).toContain("hybrid_inference");
    expect(ALL_TERMS.some((t) => t.group === "atlas")).toBe(false);
    expect(ATLAS_TERMS.length + 1).toBe(GLOSSARY.length);
    expect(new Set(ALL_TERMS.map((t) => t.id)).size).toBe(ALL_TERMS.length);
  });

  it("never uses buy or sell wording in the trading terms", () => {
    for (const term of TRADING_TERMS) expect(`${term.title} ${term.summary}`).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("searches titles and summaries", () => {
    expect(searchTerms("spread").map((t) => t.id)).toContain("spread");
    expect(searchTerms("").length).toBe(ALL_TERMS.length);
    expect(searchTerms("zzzz")).toEqual([]);
  });
});

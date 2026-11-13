import { describe, expect, it } from "vitest";
import { ALL_TERMS, TRADING_TERMS, searchTerms } from "../src/core/terms";
import { GLOSSARY } from "../src/core/glossary";

describe("wallet glossary terms", () => {
  it("includes every ATLAS concept plus trading terms with unique ids", () => {
    expect(ALL_TERMS.length).toBe(GLOSSARY.length + TRADING_TERMS.length);
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

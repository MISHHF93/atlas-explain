import { describe, expect, it } from "vitest";
import { moneyMaths } from "../src/core/money-maths";
import { matchRedFlags } from "../src/core/red-flags";
import { ALL_TERMS, searchTerms, TERM_GROUP_LABEL } from "../src/core/terms";

/** Cases found by asking Claude real questions through the connector (18 Nov 2026). */
describe("found by testing real questions in Claude", () => {
  it("names every warning sign in a typical relationship-scam pitch", () => {
    const pitch = "Someone I met on WhatsApp says her uncle's crypto platform pays 3% a day guaranteed on USDT and I can start with $500. She sent screenshots of her profits.";
    expect(matchRedFlags(pitch).map((f) => f.id)).toEqual(expect.arrayContaining(["guaranteed_returns", "unsolicited", "unusual_payment", "proof_screenshots"]));
    // One-digit and decimal rates per period are caught too.
    expect(matchRedFlags("earn 1.5% per week").map((f) => f.id)).toContain("guaranteed_returns");
  });

  it("refuses a rate it can't work out instead of quietly capping it (3% a day had come back as 30% a year)", () => {
    for (const ratePct of [4241, 31, -25]) {
      const r = moneyMaths({ calculation: "compound_growth", amount: 500, ratePct, years: 1 });
      expect("error" in r, String(ratePct)).toBe(true);
    }
    const fees = moneyMaths({ calculation: "fees", amount: 1000, ratePct: 45, feePct: 1, years: 10 });
    expect("error" in fees && fees.error).toContain("common sign of fraud");
    // Inside the range nothing changes.
    expect("error" in moneyMaths({ calculation: "compound_growth", amount: 5000, monthly: 200, ratePct: 6, years: 20 })).toBe(false);
  });

  it("explains the beginner terms people ask first, in their own group", () => {
    for (const q of ["index fund", "expense ratio", "diversification", "compound growth", "dollar-cost averaging", "emergency fund", "TFSA", "401(k)", "capital gain", "bear market", "real return", "drawdown", "index"]) {
      expect(searchTerms(q)[0], q).toBeDefined();
    }
    expect(searchTerms("index fund")[0]!.id).toBe("index_fund");
    expect(TERM_GROUP_LABEL.saving).toBe("Saving and investing");
    expect(ALL_TERMS.filter((t) => t.group === "saving").length).toBeGreaterThanOrEqual(15);
    for (const t of ALL_TERMS) expect(t.summary, t.id).not.toMatch(/\b(buy|sell|should)\b/i);
  });
});

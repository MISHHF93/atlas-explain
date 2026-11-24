import { describe, expect, it } from "vitest";
import { LEARN_PATH, learnTerms } from "../src/core/learn";
import { relatedTerms } from "../src/core/related-terms";
import { blankTitle, checkQuestions } from "../src/core/review";
import { ALL_TERMS, searchTerms, TERM_GROUP_LABEL } from "../src/core/terms";
import { debtPayoffTool, explainTerm, rateChangeImpactTool } from "../src/mcp/server";

// Borrowing and saving at home (24 Nov 2026): the ideas behind rate_change_impact, debt_payoff and the posted rates.
const IDS = ["principal", "amortization", "mortgage_term", "fixed_variable_rate", "prime_rate", "home_equity", "heloc", "down_payment", "refinancing", "credit_score", "credit_utilization", "minimum_payment", "debt_avalanche_snowball", "gic_cd", "deposit_insurance"];
const household = ALL_TERMS.filter((t) => t.group === "household");

describe("household-money terms", () => {
  it("adds 15 terms in their own group, each plain and short, never advice", () => {
    expect(household.map((t) => t.id).sort()).toEqual([...IDS].sort());
    expect(TERM_GROUP_LABEL.household).toBe("Borrowing and saving");
    for (const t of household) {
      expect(t.summary.length, t.id).toBeLessThan(420);
      expect(t.summary, t.id).not.toMatch(/\b(buy|sell|you should|we recommend|best (rate|deal|card))\b/i);
    }
  });

  it("finds them by name, abbreviation and comparison, and answers the questions that found nothing before", () => {
    expect(searchTerms("HELOC")[0]?.id).toBe("heloc");
    expect(searchTerms("GIC")[0]?.id).toBe("gic_cd");
    expect((explainTerm("credit score").structuredContent as { found: boolean }).found).toBe(true);
    expect((explainTerm("fixed vs variable").structuredContent as { found: boolean }).found).toBe(true);
  });

  it("is a learning-path topic, so the hub quizzes and reviews it, and its questions don't give the answer away", () => {
    const step = LEARN_PATH.find((s) => s.id === "household")!;
    expect(step.title).toBe("Borrowing and saving at home");
    expect(learnTerms(step).map((t) => t.id)).toEqual(IDS);
    expect(checkQuestions("household", 5)).toHaveLength(3);
    const blank = (id: string) => blankTitle(ALL_TERMS.find((t) => t.id === id)!);
    expect(blank("gic_cd")).not.toMatch(/\b(GIC|CD)\b/);
    expect(blank("debt_avalanche_snowball")).not.toMatch(/avalanche|snowball/i);
    expect(blank("fixed_variable_rate")).not.toMatch(/\b(fixed|variable)\b/i);
    expect(blank("heloc")).toContain("A line of credit");
  });

  it("shows up as related terms where an answer names them, without matching every mention of rates or payments", () => {
    expect(relatedTerms("A variable mortgage follows the prime rate; the amortization stays 25 years.").map((t) => t.id)).toEqual(expect.arrayContaining(["prime_rate", "amortization"]));
    expect(relatedTerms("Interest rates fell and the monthly payment changed.")).toEqual([]);
  });

  it("is named under the answers of the tools that use the ideas", async () => {
    const debt = debtPayoffTool({ monthly_budget: 800, debts: [{ name: "Card", balance: 6000, rate_pct: 22.99, min_payment: 180 }, { name: "Loan", balance: 9000, rate_pct: 6.9, min_payment: 250 }] });
    expect(debt.content[0]!.text).toContain("Terms to know (explain_term): Avalanche and snowball, Minimum payment, Principal.");
    const heloc = await rateChangeImpactTool({ product: "heloc", balance: 50000, rate_pct: 7, change_pts: -0.25, country: "CA" });
    expect((heloc.structuredContent as { terms: { id: string }[] }).terms.map((t) => t.id)).toEqual(["heloc", "prime_rate", "home_equity"]);
    const gic = await rateChangeImpactTool({ product: "gic_cd", balance: 10000, rate_pct: 4, change_pts: -0.25, country: "US" });
    expect(gic.content[0]!.text).toContain("GIC and CD (term deposits), Deposit insurance");
  });
});

import { describe, expect, it } from "vitest";
import {
  GLOSSARY,
  conceptQuestion,
  getConcept,
  glossaryContainsAdvice,
  isGlossaryId,
} from "../src/core/glossary";

describe("glossary", () => {
  it("exposes the shared ATLAS concept ids", () => {
    const ids = GLOSSARY.map((entry) => entry.id);
    expect(ids).toEqual([
      "shadow",
      "signal15",
      "chart_layers",
      "live_lock",
      "paper_only",
      "drop_study",
      "hybrid_inference",
      "move_card",
    ]);
    expect(isGlossaryId("shadow")).toBe(true);
    expect(isGlossaryId("not-a-concept")).toBe(false);
    expect(getConcept("paper_only")?.title).toBe("Paper only");
  });

  it("keeps educational wording and never gives trade advice", () => {
    expect(glossaryContainsAdvice()).toBe(false);
    for (const entry of GLOSSARY) {
      expect(entry.summary.length).toBeGreaterThan(40);
      expect(entry.summary.toLowerCase()).not.toMatch(/you should buy|you should sell|buy now|sell now/);
      expect(entry.summary.toLowerCase()).not.toMatch(/account number|buying power|your balance|account balance/);
    }
    const question = conceptQuestion("shadow");
    expect(question).toContain("Shadow metrics");
    expect(question).toContain("educational reading");
    expect(question.length).toBeLessThan(90);
    expect(question.toLowerCase()).not.toMatch(/you should buy|you should sell|buy now|sell now/);
  });
});

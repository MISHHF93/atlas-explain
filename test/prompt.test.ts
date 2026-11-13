import { describe, expect, it } from "vitest";
import { buildPrompt, DEFAULT_PROMPT_TEMPLATE } from "../src/core/prompt";
import { DEFAULT_TAXONOMY } from "../src/core/taxonomy";
import type { MoveCard } from "../src/core/types";

const card: MoveCard = {
  symbol: "NVDA",
  asOf: "2025-01-27",
  movePct: -17,
  peerMoves: [],
  upcomingEvents: [],
  headlines: [{ text: "Spending fears returned.", source: "paraphrase" }],
  watchlist: ["AMD"],
  notes: "SECRET-NOTE",
  document: "A short note.",
};

describe("buildPrompt", () => {
  it("includes the card, taxonomy, and question", () => {
    const { prompt, charLength } = buildPrompt({
      card,
      question: "Why buy the dip?",
      template: DEFAULT_PROMPT_TEMPLATE,
      topics: DEFAULT_TAXONOMY,
      includePrivateContext: false,
    });
    expect(prompt).toContain("Why buy the dip?");
    expect(prompt).toContain('"symbol": "NVDA"');
    expect(prompt).toContain("ai_capex");
    expect(prompt).toContain("not financial advice");
    expect(prompt).not.toContain("SECRET-NOTE");
    expect(prompt).not.toContain("AMD");
    expect(charLength).toBe(prompt.length);
  });

  it("includes private notes only when asked", () => {
    const { prompt } = buildPrompt({
      card,
      question: "",
      template: DEFAULT_PROMPT_TEMPLATE,
      topics: DEFAULT_TAXONOMY,
      includePrivateContext: true,
    });
    expect(prompt).toContain("SECRET-NOTE");
    expect(prompt).toContain("AMD");
    expect(prompt).toContain("No specific question");
  });

  it("still appends the card when a remote template drops the placeholder", () => {
    const { prompt } = buildPrompt({
      card,
      question: "What changed?",
      template: "Explain this briefly.",
      topics: DEFAULT_TAXONOMY,
      includePrivateContext: false,
    });
    expect(prompt).toContain("Explain this briefly.");
    expect(prompt).toContain('"movePct": -17');
    expect(prompt).not.toContain("SECRET-NOTE");
  });
});

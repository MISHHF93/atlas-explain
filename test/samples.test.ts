import { describe, expect, it } from "vitest";
import { hasPrivateContext, validateMoveCard } from "../src/core/move-card";
import { SAMPLE_MOVES } from "../src/core/samples";

describe("sample move cards", () => {
  it("validates every sample and keeps private fields empty", () => {
    for (const sample of SAMPLE_MOVES) {
      const result = validateMoveCard(sample.card);
      expect(result.ok, sample.id).toBe(true);
      expect(hasPrivateContext(sample.card)).toBe(false);
      expect(sample.card.notes).toBeUndefined();
      expect(sample.card.watchlist).toEqual([]);
    }
  });

  it("marks the historical sessions and the blank dip differently", () => {
    const historical = SAMPLE_MOVES.filter((sample) => sample.kind === "historical");
    expect(historical.map((sample) => sample.card.asOf)).toEqual([
      "2025-01-27",
      "2025-04-03",
      "2025-04-04",
    ]);
    expect(SAMPLE_MOVES.find((sample) => sample.id === "hypothetical-dip")?.summary).toMatch(/placeholder/i);
    for (const sample of historical) {
      expect(sample.sources.length).toBeGreaterThan(0);
      expect(sample.card.sourceNote).toMatch(/not a market-data feed/i);
    }
  });
});

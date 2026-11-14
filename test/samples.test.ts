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

  it("ships only sourced historical sessions", () => {
    const historical = SAMPLE_MOVES.filter((sample) => sample.kind === "historical");
    expect(historical.map((sample) => sample.card.asOf)).toEqual([
      "2025-01-27",
      "2025-04-03",
      "2025-04-04",
    ]);
    // No placeholder or fixture cards ship to users: every sample is a sourced historical move.
    expect(SAMPLE_MOVES.every((sample) => sample.kind === "historical" && sample.sources.length > 0)).toBe(true);
    for (const sample of historical) {
      expect(sample.sources.length).toBeGreaterThan(0);
      expect(sample.card.sourceNote).toMatch(/not a market-data feed/i);
    }
  });
});

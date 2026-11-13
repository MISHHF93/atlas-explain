import { describe, expect, it } from "vitest";
import { applyPrivateFields, parseMoveCardJson, validateMoveCard } from "../src/core/move-card";

const valid = {
  symbol: "nvda",
  asOf: "2025-01-27",
  movePct: -17,
  volumeVsNormal: 2.1,
  marketLabel: "Nasdaq Composite",
  marketMovePct: -3.1,
  sector: "Semiconductors",
  sectorMovePct: -9,
  peerMoves: [{ symbol: "avgo", movePct: -17 }],
  headlines: [{ text: "A low-cost model reset spending expectations.", source: "paraphrase" }],
  upcomingEvents: ["Model release coverage."],
  watchlist: ["amd"],
  notes: "desk note",
};

describe("validateMoveCard", () => {
  it("normalizes symbols and accepts a complete card", () => {
    const result = validateMoveCard(valid);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.card.symbol).toBe("NVDA");
    expect(result.card.peerMoves[0]?.symbol).toBe("AVGO");
    expect(result.card.watchlist).toEqual(["AMD"]);
    expect(result.card.notes).toBe("desk note");
  });

  it("rejects missing required fields and bad percents", () => {
    const result = validateMoveCard({ symbol: "", movePct: "-6%" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((error) => error.path)).toEqual(expect.arrayContaining(["symbol", "movePct"]));
  });

  it("rejects an impossible date, too many headlines, and a bad peer", () => {
    const headlines = Array.from({ length: 41 }, (_, index) => ({ text: `Headline ${index}` }));
    const result = validateMoveCard({
      symbol: "BRK.B",
      movePct: -6,
      asOf: "2025-02-31",
      headlines,
      peerMoves: [{ symbol: "TOO LONG SYMBOL", movePct: 1 }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((error) => error.path === "asOf")).toBe(true);
    expect(result.errors.some((error) => error.path === "headlines")).toBe(true);
    expect(result.errors.some((error) => error.path.startsWith("peerMoves"))).toBe(true);
  });

  it("parses JSON text and reports invalid JSON", () => {
    const parsed = parseMoveCardJson(JSON.stringify({ symbol: "AAPL", movePct: -9.2 }));
    expect(parsed.ok).toBe(true);
    const broken = parseMoveCardJson("{");
    expect(broken.ok).toBe(false);
  });

  it("lets the private form fields override JSON notes and watchlist", () => {
    const parsed = validateMoveCard({ symbol: "NVDA", movePct: -6, notes: "from json", watchlist: ["AMD"] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = applyPrivateFields(parsed.card, "from form", "AVGO, amd");
    expect(applied.errors).toEqual([]);
    expect(applied.card.notes).toBe("from form");
    expect(applied.card.watchlist).toEqual(["AVGO", "AMD"]);
  });

  it("rejects a watchlist token that is not a symbol", () => {
    const parsed = validateMoveCard({ symbol: "NVDA", movePct: -6 });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const applied = applyPrivateFields(parsed.card, "", "NVDA, bad-symbol");
    expect(applied.errors.length).toBeGreaterThan(0);
  });
});

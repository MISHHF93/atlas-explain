import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FOLLOW_UPS, followUpQuestion, relatedTerms } from "../src/core/follow-ups";

describe("keep-going follow-ups", () => {
  it("offers three follow-ups with plain labels", () => {
    expect(FOLLOW_UPS.map((f) => f.label)).toEqual(["Explain simpler", "Give an example", "Why it matters"]);
  });

  it("keeps every follow-up education-only and free of real prices", async () => {
    const { scanText } = await import("../scripts/trade-word-scan.mjs");
    for (const { kind } of FOLLOW_UPS) {
      const q = followUpQuestion(kind, "stop-limit order");
      expect(q).toContain('"stop-limit order"');
      expect(q).toMatch(/Education only\. Do not recommend a trade/);
      expect(scanText(q)).toEqual([]);
    }
    expect(followUpQuestion("example", "margin")).toMatch(/no real prices/);
  });

  it("clips long selections and handles an empty topic", () => {
    const long = "x".repeat(400);
    expect(followUpQuestion("simpler", long).length).toBeLessThan(320);
    expect(followUpQuestion("matters", "   ")).toContain('"this idea"');
  });

  it("finds related glossary terms in the answer, skipping the topic itself", () => {
    const answer = "A stop-limit order can sit unfilled when the bid-ask spread is wide and implied volatility (IV) is high.";
    const found = relatedTerms(answer, "stop-limit order").map((t) => t.id);
    expect(found).not.toContain("stop_limit");
    expect(found).toEqual(expect.arrayContaining(["spread", "implied_volatility"]));
    expect(relatedTerms("Margin magnifies a drawdown.", "").map((t) => t.id)).toEqual(expect.arrayContaining(["margin", "drawdown"]));
  });

  it("does not treat the plain word market as the term Market order", () => {
    expect(relatedTerms("If the market jumps past your limit, the order can sit unfilled.", "stop-limit order").map((t) => t.id)).not.toContain("market_order");
  });

  it("matches whole words only and caps the list", () => {
    expect(relatedTerms("The gapless engine regaps", "")).toEqual([]);
    const busy = "margin drawdown hit rate volume gap spread market order";
    expect(relatedTerms(busy, "").length).toBe(3);
  });

  it("is wired into both surfaces and the shared answer card", () => {
    const cards = readFileSync("src/wallet/cards.ts", "utf8");
    expect(cards).toContain("keep-going");
    expect(readFileSync("extension/src/popup.ts", "utf8")).toContain("keepGoingFor(");
    expect(readFileSync("src/web/app.ts", "utf8")).toContain("keepGoing(copyText)");
  });
});

import { describe, expect, it } from "vitest";
import { parseExplanation } from "../src/core/parse-explanation";
import { coerceTopic, parseTaxonomyConfig } from "../src/core/taxonomy";
import { TOPIC_IDS } from "../src/core/types";

describe("topic taxonomy", () => {
  it("keeps known ids, drops unknown ones, and always keeps other", () => {
    const parsed = parseTaxonomyConfig([
      { id: "ai_capex", label: "AI spending" },
      { id: "not_a_topic", label: "Nope" },
      "rates_fed",
    ]);
    expect(parsed.topics.map((topic) => topic.id)).toEqual(["ai_capex", "rates_fed", "other"]);
    expect(parsed.topics[0]?.label).toBe("AI spending");
    expect(parsed.warnings.length).toBeGreaterThan(0);
  });

  it("falls back when the config is not an array", () => {
    const parsed = parseTaxonomyConfig("nope");
    expect(parsed.topics.map((topic) => topic.id)).toEqual([...TOPIC_IDS]);
  });

  it("coerces aliases and unknown labels", () => {
    expect(coerceTopic("AI capex", TOPIC_IDS)).toEqual({ topic: "ai_capex", coerced: false });
    expect(coerceTopic("earnings", TOPIC_IDS)).toEqual({ topic: "earnings_guidance", coerced: true });
    expect(coerceTopic("banana", TOPIC_IDS)).toEqual({ topic: "other", coerced: true });
  });
});

describe("parseExplanation", () => {
  const raw = {
    summary: "The drop was about a cheaper model, not a filed earnings miss.",
    headlineTopics: [
      { headline: "Spending fears", topic: "ai_capex", note: "capex" },
      { headline: "Something else", topic: "made up", note: "" },
    ],
    buyerReasons: ["Valuation reset", "Peers fell too", "No company-specific filing"],
    sellerReasons: ["Demand fears can last", "The move was large", "Missing volume data", "extra"],
    whatWouldChange: "A company update on orders would change both cases.",
  };

  it("parses fenced JSON and coerces unknown topics", () => {
    const parsed = parseExplanation("```json\n" + JSON.stringify(raw) + "\n```", TOPIC_IDS);
    expect(parsed.summary).toContain("cheaper model");
    expect(parsed.headlineTopics[1]?.topic).toBe("other");
    expect(parsed.headlineTopics[1]?.coerced).toBe(true);
    expect(parsed.buyerReasons).toHaveLength(3);
    expect(parsed.sellerReasons[0]).toBe("Demand fears can last");
    expect(parsed.truncatedReasons).toBe(true);
  });

  it("rejects fewer than three reasons", () => {
    expect(() =>
      parseExplanation(
        JSON.stringify({ ...raw, buyerReasons: ["only one"] }),
        TOPIC_IDS,
      ),
    ).toThrow(/buyerReasons/);
  });

  it("rejects text that is not JSON", () => {
    expect(() => parseExplanation("I cannot help with that.", TOPIC_IDS)).toThrow(/JSON/);
  });
});

import { describe, expect, it } from "vitest";
import {
  ANSWER_DISCLAIMER,
  buildExplainPrompt,
  isRecommendationRequest,
  relevantSamples,
  toPageContext,
} from "../src/core/explain-prompt";

describe("page context", () => {
  it("keeps the host and drops the path, query, and account-like numbers", () => {
    const context = toPageContext({
      selection: "Stop-limit vs stop-market. Account number 123456789. Balance: $42,000.",
      title: "Order ticket",
      url: "https://broker.example/trade/NVDA?token=secret",
    });
    expect(context.host).toBe("broker.example");
    expect(context.selection).not.toContain("123456789");
    expect(context.selection).not.toContain("42,000");
    expect(context.selection).toContain("Stop-limit");
    expect(context.redacted).toBe(true);
    expect(JSON.stringify(context)).not.toContain("secret");
    expect(JSON.stringify(context)).not.toContain("/trade");
  });
});

describe("explain prompt", () => {
  it("refuses a trade decision and still explains factors", () => {
    expect(isRecommendationRequest("Should I buy NVDA calls?")).toBe(true);
    expect(isRecommendationRequest("What is a stop-limit order?")).toBe(false);
    const { prompt, refusedRecommendation } = buildExplainPrompt({
      context: toPageContext({
        selection: "Should I buy the stock?",
        title: "NVDA",
        url: "https://www.tradingview.com/chart",
      }),
      question: "",
    });
    expect(refusedRecommendation).toBe(true);
    expect(prompt).toContain("Do not give one");
    expect(prompt.toLowerCase()).toContain("you never tell anyone to buy, sell, hold");
    expect(prompt.toLowerCase()).not.toContain("you should buy");
    expect(prompt).toContain(ANSWER_DISCLAIMER);
    expect(prompt).toContain("www.tradingview.com");
  });

  it("attaches the DeepSeek sample when the text mentions NVDA", () => {
    const samples = relevantSamples("Why did NVDA fall after DeepSeek?");
    expect(samples.map((sample) => sample.card.symbol)).toEqual(["NVDA"]);
    const { prompt } = buildExplainPrompt({
      context: toPageContext({
        selection: "Why did NVDA fall after DeepSeek?",
        title: "News",
        url: "https://news.example/",
      }),
      question: "What were the factors?",
      samples,
    });
    expect(prompt).toContain("2025-01-27");
    expect(prompt).toContain("not a live data feed");
    expect(prompt).not.toContain("notes");
  });
});

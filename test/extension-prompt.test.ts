import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXTENSION_DISCLAIMER,
  EXTENSION_PRIVACY_NOTE,
  buildExtensionPrompt,
  extensionHighlightAllowed,
  isRecommendationRequest,
  relevantSamples,
  toPageContext,
  withDisclaimer,
} from "../src/core/extension-prompt";

describe("extension page context", () => {
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

describe("extension prompt", () => {
  it("refuses a trade decision and still explains factors", () => {
    expect(isRecommendationRequest("Should I buy NVDA calls?")).toBe(true);
    expect(isRecommendationRequest("What is a stop-limit order?")).toBe(false);
    const { prompt, refusedRecommendation } = buildExtensionPrompt({
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
    expect(prompt).toContain(EXTENSION_DISCLAIMER);
    expect(prompt).toContain("www.tradingview.com");
  });

  it("attaches the DeepSeek sample when the highlight mentions NVDA", () => {
    const samples = relevantSamples("Why did NVDA fall after DeepSeek?");
    expect(samples.map((sample) => sample.card.symbol)).toEqual(["NVDA"]);
    const { prompt } = buildExtensionPrompt({
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

  it("stamps the disclaimer on every answer", () => {
    expect(withDisclaimer("A stop-limit waits for a trigger, then becomes a limit.")).toContain(EXTENSION_DISCLAIMER);
    expect(withDisclaimer(`Already closed.\n\n${EXTENSION_DISCLAIMER}`).match(/Educational information/g)).toHaveLength(1);
  });
});

describe("extension entitlements during beta", () => {
  it("keeps highlight-to-explain free on every plan, with billing on or off", () => {
    expect(extensionHighlightAllowed({ billingEnabled: false, plan: "free", freeCloudDailyLimit: 50 })).toBe(true);
    expect(extensionHighlightAllowed({ billingEnabled: true, plan: "free", freeCloudDailyLimit: 50 })).toBe(true);
    expect(extensionHighlightAllowed({ billingEnabled: true, plan: "pro", freeCloudDailyLimit: 50 })).toBe(true);
  });

  it("states the privacy limit in the note traders see", () => {
    expect(EXTENSION_PRIVACY_NOTE).toContain("form fields");
    expect(EXTENSION_PRIVACY_NOTE).toContain("until you click");
  });
});

describe("page reader", () => {
  it("reads the highlight and title and does not touch form fields", () => {
    const source = readFileSync("extension/src/read-selection.ts", "utf8");
    expect(source).toContain("getSelection");
    // The only selector is the public ATLAS desk marker, never a form control.
    expect(source).not.toMatch(/querySelector(All)?\(\s*["'`][^"'`]*\b(input|textarea|select|form)\b/i);
    expect(source.match(/querySelector\(/g) ?? []).toHaveLength(1);
    expect(source).not.toContain("password");
    expect(source).not.toContain(".value");
  });
});

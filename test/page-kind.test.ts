import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildExtensionPrompt, toPageContext } from "../src/core/extension-prompt";
import { detectPageKind, pageKindLine } from "../src/core/page-kind";

describe("page kind detector", () => {
  it("recognises charting, broker, crypto and news sites by site name", () => {
    expect(detectPageKind({ host: "www.tradingview.com" }).kind).toBe("charting");
    expect(detectPageKind({ host: "client.schwab.com" }).kind).toBe("broker");
    expect(detectPageKind({ host: "my.wealthsimple.com" }).kind).toBe("broker");
    expect(detectPageKind({ host: "pro.kraken.com" }).kind).toBe("crypto_exchange");
    expect(detectPageKind({ host: "finance.yahoo.com" }).kind).toBe("market_news");
    expect(detectPageKind({ host: "example.org" }).kind).toBe("general");
  });

  it("does not match look-alike domains", () => {
    expect(detectPageKind({ host: "nottradingview.com" }).kind).toBe("general");
    expect(detectPageKind({ host: "tradingview.com.evil.test" }).kind).toBe("general");
  });

  it("recognises the local ATLAS desk only on port 3000", () => {
    expect(detectPageKind({ host: "localhost:3000" }).kind).toBe("atlas_desk");
    expect(detectPageKind({ host: "localhost:5173" }).kind).toBe("general");
  });

  it("falls back to title words, never to page content", () => {
    expect(detectPageKind({ host: "example.org", title: "BTC chart with RSI" }).kind).toBe("charting");
    expect(detectPageKind({ host: "example.org", title: "Option chain" }).kind).toBe("broker");
  });

  it("feeds the site type into the prompt and the card line", () => {
    const context = toPageContext({ selection: "Stop-limit order", title: "Order entry", url: "https://www.tradingview.com/chart/" });
    expect(context.page.label).toBe("Charting site");
    expect(pageKindLine(context.page, context.host)).toBe("Charting site · tradingview.com");
    const { prompt } = buildExtensionPrompt({ context, question: "" });
    expect(prompt).toContain("Site type: Charting site.");
  });

  it("has no buy/sell wording in its hints", () => {
    const source = readFileSync(new URL("../src/core/page-kind.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\b(buy|sell)\b/i);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildExtensionPrompt, toPageContext } from "../src/core/extension-prompt";
import { TWO_SIDED_SCHEMA, parseTwoSided, twoSidedCopyText } from "../src/core/two-sided";

const good = {
  summary: "RSI above 70 means recent gains outpaced losses.",
  buyerReasons: ["Momentum can persist", "Breadth is wide", "Volume confirms"],
  sellerReasons: ["Stretched moves often cool", "Upper band tags can reverse", "Earnings risk ahead"],
  whatWouldChange: "A close back inside the bands.",
};

describe("two-sided extension answers", () => {
  it("parses the JSON shape, including fenced or wrapped output from Gemini Nano", () => {
    expect(parseTwoSided(JSON.stringify(good))).toEqual(good);
    expect(parseTwoSided("Here you go:\n```json\n" + JSON.stringify(good) + "\n```")?.buyerReasons).toHaveLength(3);
  });

  it("keeps at most three reasons and accepts two", () => {
    const four = { ...good, buyerReasons: [...good.buyerReasons, "extra"], sellerReasons: ["a", "b"] };
    const parsed = parseTwoSided(JSON.stringify(four));
    expect(parsed?.buyerReasons).toHaveLength(3);
    expect(parsed?.sellerReasons).toHaveLength(2);
  });

  it("returns null for plain text or a one-sided answer, so the popup falls back to text", () => {
    expect(parseTwoSided("A stop-limit order has two prices.")).toBeNull();
    expect(parseTwoSided(JSON.stringify({ ...good, sellerReasons: ["only one"] }))).toBeNull();
    expect(parseTwoSided(JSON.stringify({ ...good, summary: "" }))).toBeNull();
  });

  it("asks for the shape in the prompt and constrains it with a schema", () => {
    const { prompt } = buildExtensionPrompt({ context: toPageContext({ selection: "RSI", title: "Chart", url: "https://www.tradingview.com/" }), question: "" });
    expect(prompt).toContain('"buyerReasons"');
    expect(prompt).toContain('"sellerReasons"');
    expect(TWO_SIDED_SCHEMA.required).toEqual(["summary", "buyerReasons", "sellerReasons", "whatWouldChange"]);
  });

  it("copies with both cases and the disclaimer", () => {
    const text = twoSidedCopyText(good, "Educational information, not investment advice.");
    expect(text).toContain("Opportunity case:");
    expect(text).toContain("Risk case:");
    expect(text.trim().endsWith("not investment advice.")).toBe(true);
  });

  it("the popup passes the schema to Gemini Nano and shares the web layout", () => {
    const popup = readFileSync(new URL("../extension/src/popup.ts", import.meta.url), "utf8");
    const web = readFileSync(new URL("../src/web/app.ts", import.meta.url), "utf8");
    expect(popup).toContain("explainOnDevice(built.prompt, TWO_SIDED_SCHEMA)");
    expect(popup).toContain("twoSidedNodes(");
    expect(web).toContain("twoSidedNodes(");
  });
});

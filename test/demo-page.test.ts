import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectPageKind } from "../src/core/page-kind";

const html = readFileSync(new URL("../public/demo/trading-terms.html", import.meta.url), "utf8");

describe("practice trading page", () => {
  it("is static: no scripts, no forms, no prices", () => {
    expect(html).not.toMatch(/<script|<form|<input/i);
    expect(html).not.toMatch(/\$\s?\d/);
  });

  it("never tells the reader to trade", () => {
    expect(html).not.toMatch(/\b(you should|time to|go ahead and)\s+(buy|sell)\b|\b(buy|sell)\s+(now|signal|today)\b/i);
  });

  it("reads as a charting page from its title alone", () => {
    const title = /<title>([^<]+)<\/title>/.exec(html)?.[1] ?? "";
    expect(detectPageKind({ host: "atlas-explain.web.app", title }).kind).toBe("charting");
  });
});

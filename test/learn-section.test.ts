import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/web/app.ts", "utf8");

describe("Learn is built once for both surfaces", () => {
  it("is the same section, loaded on demand, on the web app and in the popup", () => {
    expect(app).toContain('import("../wallet/learn-section")');
    for (const src of [app]) expect(src).not.toMatch(/^import [^;]*glossary-panel/m);
  });

  it("asks about a term, or an asset, the same way everywhere: go to Explain and answer now", () => {
    expect(readFileSync("src/wallet/learn-section.ts", "utf8")).toContain('EXPLAIN_TERM_LABEL = "Explain this"');
    expect(app).toContain("onAsk: (term) => sendToExplain(term.title)");
    expect(app).toContain("onExplain: (text) => sendToExplain(text)");
    // Neither surface leaves the reader with a filled box and a second click any more.
    for (const src of [app]) expect(src).not.toContain("Press Explain when ready. Nothing was sent.");
  });

  it("keeps the web app's Learn progress in this browser, in the export and in Clear data", () => {
    const data = readFileSync("src/core/account-data.ts", "utf8");
    expect(data).toContain('"atlas-explain-learned",');
    expect(app).toContain("learnProgress:");
  });
});

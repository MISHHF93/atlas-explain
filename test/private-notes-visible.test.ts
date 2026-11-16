import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the privacy routing is visible to every visitor", () => {
  const app = readFileSync("src/web/app.ts", "utf8");

  it("shows the market-move box with private notes to everyone, closed until opened", () => {
    expect(app).toContain('disclosure("Explain a market move, with private notes"');
    // Only an inbound desk link opens it; nothing hides it any more.
    expect(app).not.toMatch(/moveBox\.hidden = true/);
    expect(app).toContain("they are used only when Gemini Nano answers on this device");
  });

  it("is in the demo and the Devpost text, so judges see it", () => {
    expect(readFileSync("docs/DEMO.md", "utf8")).toContain("Explain a market move, with private notes");
    expect(readFileSync("docs/DEVPOST.md", "utf8")).toContain("Explain a market move, with private notes");
  });
});

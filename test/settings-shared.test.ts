import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settings = readFileSync("src/wallet/settings.ts", "utf8");
const app = readFileSync("src/web/app.ts", "utf8");

describe("Settings is built once for both surfaces", () => {
  it("is assembled by the shared builder", () => {
    expect(app).toContain("buildSettings({");
  });

  it("leaves neither surface assembling its own settings groups", () => {
    // The web app still makes two groups that only it has (usage statistics, and the plan card is its own).
    for (const title of ["Appearance", "How answers are made", "Legal", "Privacy", "About", "Account", "Your data"]) {
      expect(app, title).not.toContain(`group("${title}"`);
    }
    expect(app).not.toContain("themePicker(");
  });

  it("keeps the wording that explains the hybrid in one place", () => {
    expect(settings).toContain("export const HOW_ANSWERS_ARE_MADE");
    expect(app).not.toContain("Gemini Nano answers on your device and nothing is sent");
  });

  it("orders the groups the same way everywhere", () => {
    const order = ["Appearance", "How answers are made", "Privacy and terms", "For ATLAS users", "About"];
    const at = order.map((title) => settings.indexOf(`group("${title}"`));
    expect(at.every((index) => index > 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });
});

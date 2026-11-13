import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/web/app.ts", "utf8");
const legal = readFileSync("src/wallet/legal.ts", "utf8");
const main = readFileSync("src/main.ts", "utf8");
const style = readFileSync("src/style.css", "utf8");
const html = readFileSync("index.html", "utf8");

describe("web wallet", () => {
  it("uses the shared wallet shell instead of a full-page layout", () => {
    expect(app).toContain("createWalletShell");
    expect(main).toContain("mountWebWallet");
    for (const old of ["desk", "legal", "pricing", "setup", "dom"]) {
      expect(existsSync(`src/ui/${old}.ts`)).toBe(false);
    }
    expect(html).toContain('class="stage"');
  });

  it("keeps the same four tabs as the extension", () => {
    for (const tab of ["explain", "signal", "glossary", "settings"]) {
      expect(app).toContain(`"${tab}"`);
    }
  });

  it("has no trade instructions in user-facing copy", () => {
    expect(legal).not.toMatch(/\b(buy|sell)\b/i);
    const strings = app.match(/"[^"]*"/g) ?? [];
    for (const s of strings) expect(s).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("styles the stage with tokens only and no font under 11px", () => {
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    for (const m of style.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(11);
    }
  });

  it("never reads account balances", () => {
    expect(app).not.toMatch(/balance|account_id|positions/i);
  });
});

describe("judge-ready landing", () => {
  const page = readFileSync("index.html", "utf8");
  const css = readFileSync("src/style.css", "utf8");
  it("tells the hybrid story in static HTML beside the live wallet", () => {
    expect(page).toContain('class="hero"');
    expect(page).toMatch(/Gemini Nano, on this device/);
    expect(page).toMatch(/Firebase AI Logic with App Check/);
    expect(page).toContain('href="/?sheet=extension"');
    expect(page).toContain("https://github.com/MISHHF93/atlas-explain");
    expect(page).toMatch(/Educational information, not investment advice/);
    expect(page).toContain('<div id="app"></div>');
  });
  it("keeps the phone layout as the full-screen wallet and respects reduced motion", () => {
    expect(css).toMatch(/@media \(max-width: 420px\), \(max-height: 640px\) \{[^}]*\}[^@]*\.hero \{ display: none; \}/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.hero-dot \{ animation: none; \}/);
  });
  it("has no trade instructions in the landing copy", () => {
    const text = page.replace(/<[^>]+>/g, " ");
    expect(text).not.toMatch(/\b(buy|sell)\b/i);
  });
  it("adds the hybrid step to onboarding", () => {
    expect(readFileSync("src/wallet/cards.ts", "utf8")).toContain('title: "On your device first"');
  });
});

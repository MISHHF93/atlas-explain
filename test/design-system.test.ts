import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The design system's rules, enforced: one token file, no raw sizes, radii or colours in
 * component styles, nothing below 11px, and WCAG AA contrast for every text pair in both themes.
 */
const tokens = readFileSync("src/brand/tokens.css", "utf8");
const sheets = ["src/wallet/wallet.css", "src/site/site.css", "src/app/app.css", "extension/popup.css"].map((f) => [f, readFileSync(f, "utf8")] as const);

/** Reads one theme block's colour tokens. */
function theme(selector: string): Record<string, string> {
  const start = tokens.indexOf(selector);
  const block = tokens.slice(start, tokens.indexOf("}", start));
  return Object.fromEntries([...block.matchAll(/--atlas-([a-z0-9-]+):\s*(#[0-9a-f]{6})/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]));
}

const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe("design tokens", () => {
  it("define the type scale, spacing and radii once", () => {
    for (const name of ["text-2xs", "text-xs", "text-sm", "text-md", "text-base", "text-lg", "text-xl", "text-2xl", "text-3xl", "space-2", "space-4", "radius-sm", "radius", "radius-pill"]) {
      expect(tokens, name).toMatch(new RegExp(`--atlas-${name}:`));
    }
    expect(tokens).toMatch(/--atlas-text-2xs:\s*11px/);
  });

  it("keep component styles free of raw sizes, radii and colours", () => {
    for (const [file, css] of sheets) {
      expect(css.match(/font-size:\s*[0-9.]+(px|rem)/g), file).toBeNull();
      expect(css.match(/border-radius:\s*[0-9.]+px\s*[;}]/g), file).toBeNull();
      expect(css.match(/#[0-9a-f]{3,8}\b/gi), file).toBeNull();
    }
  });

  it("meet WCAG AA (4.5:1) for every text colour on its backgrounds, in light and dark", () => {
    const pairs: [string, string][] = [
      ["ink", "paper"], ["ink", "card"], ["ink", "cloud"], ["muted", "paper"], ["muted", "card"], ["muted", "cloud"],
      ["accent", "card"], ["accent", "paper"], ["accent", "device"], ["accent-ink", "accent"],
      ["signal-up", "card"], ["signal-down", "card"], ["warn-ink", "warn"],
    ];
    for (const selector of [":root {", ':root[data-theme="dark"]']) {
      const t = theme(selector);
      for (const [fg, bg] of pairs) {
        expect(t[fg], `${selector} ${fg}`).toBeTruthy();
        expect(contrast(t[fg]!, t[bg]!), `${selector} ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      // The neutral tone is only used for dots, lights and lines: 3:1 is the bar for graphics.
      expect(contrast(t["signal-flat"]!, t.card!)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keep the dark theme identical for the system setting and the manual switch", () => {
    const system = tokens.slice(tokens.indexOf("@media (prefers-color-scheme: dark)"), tokens.indexOf(':root[data-theme="dark"]'));
    const manual = theme(':root[data-theme="dark"]');
    for (const [name, value] of Object.entries(manual)) expect(system, name).toContain(`--atlas-${name}: ${value}`);
  });
});

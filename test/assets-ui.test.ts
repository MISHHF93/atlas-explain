import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const box = JSON.parse(readFileSync("test/fixtures/atlas-catalog.json", "utf8")) as unknown;
const TRADE = /\b(buy|sell)\b/i;

describe("assets UI", () => {
  const ui = readFileSync("src/wallet/assets.ts", "utf8");
  const ctl = readFileSync("src/wallet/assets-controller.ts", "utf8");
  const shell = readFileSync("src/wallet/shell.ts", "utf8");
  const css = readFileSync("src/wallet/wallet.css", "utf8");
  const web = readFileSync("src/web/app.ts", "utf8");

  it("adds an Assets tab with list, badges, lights, detail, sparkline and the explain hand-off", () => {
    expect(shell).toContain('{ id: "assets", label: "Assets"');
    expect(css).toContain("repeat(var(--tab-count, 5), 1fr)");
    for (const part of ["asset-row", "fresh-badge", "light-dot", "Why this colour?", "Explain this", "connectCard", "spark", "Price predictions are not shown"]) expect(ui).toContain(part);
    expect(ctl).toContain("visibilitychange");
    expect(web).toContain("canReachLocalAtlas(location, false)");
  });

  it("keeps fonts at 11px or more and colours on tokens", () => {
    const tail = css.slice(css.indexOf("assets: wallet-style token list"));
    expect(tail.length).toBeGreaterThan(100);
    for (const m of tail.matchAll(/font-size:\s*([\d.]+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(11);
    for (const m of tail.matchAll(/font-size:\s*([\d.]+)rem/g)) expect(Number(m[1]) * 16).toBeGreaterThanOrEqual(11);
    expect(tail).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("has no trade instructions in the new user-facing copy", () => {
    for (const src of [ui, ctl]) {
      const strings = src.match(/"[^"]*"|`[^`]*`/g) ?? [];
      for (const s of strings) expect(s.replace("Do not recommend a trade", "")).not.toMatch(TRADE);
    }
    expect(JSON.stringify(box)).not.toMatch(/\b(buy|sell|short|long|hold|entry|exit|order|position)\b/i);
  });
});

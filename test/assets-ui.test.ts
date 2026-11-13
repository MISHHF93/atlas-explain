import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCAL_ATLAS_PERMISSION_NOTE } from "../src/core/extension-prompt";

const box = JSON.parse(readFileSync("src/wallet/box-preview.json", "utf8")) as unknown;
const TRADE = /\b(buy|sell)\b/i;

describe("assets UI and extension", () => {
  const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8")) as { host_permissions?: string[]; permissions: string[] };
  const ui = readFileSync("src/wallet/assets.ts", "utf8");
  const ctl = readFileSync("src/wallet/assets-controller.ts", "utf8");
  const shell = readFileSync("src/wallet/shell.ts", "utf8");
  const css = readFileSync("src/wallet/wallet.css", "utf8");
  const popup = readFileSync("extension/src/popup.ts", "utf8");
  const web = readFileSync("src/web/app.ts", "utf8");
  const legal = readFileSync("src/wallet/legal.ts", "utf8");

  it("asks only for the local ATLAS host and our own web app, and explains why", () => {
    expect(manifest.host_permissions).toEqual(["http://localhost:3000/*", "https://atlas-explain.web.app/*"]);
    expect(LOCAL_ATLAS_PERMISSION_NOTE).toMatch(/localhost:3000/);
    expect(LOCAL_ATLAS_PERMISSION_NOTE).toMatch(/atlas-explain\.web\.app/);
    expect(LOCAL_ATLAS_PERMISSION_NOTE).toMatch(/never reads balances, accounts or keys/);
    expect(popup).toContain("LOCAL_ATLAS_PERMISSION_NOTE");
    expect(legal).toMatch(/localhost:3000/);
  });

  it("adds an Assets tab with list, badges, lights, detail, sparkline and the explain hand-off", () => {
    expect(shell).toContain('{ id: "assets", label: "Assets"');
    expect(css).toContain("repeat(5, 1fr)");
    for (const part of ["asset-row", "fresh-badge", "light-dot", "Why this colour?", "Explain this", "connectCard", "spark"]) expect(ui).toContain(part);
    expect(ctl).toContain("visibilitychange");
    expect(popup).toContain("mountAssets");
    expect(web).toContain("canReachLocalAtlas(location, false)");
    expect(popup).toContain("probeAtlasDesk");
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

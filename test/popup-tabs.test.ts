import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const shell = readFileSync("src/wallet/shell.ts", "utf8");
const popup = readFileSync("extension/src/popup.ts", "utf8");

describe("the extension popup has three tabs", () => {
  const tabs = /export const TABS[^=]*= \[([\s\S]*?)\];/.exec(shell)?.[1] ?? "";
  const ids = [...tabs.matchAll(/id: "(\w+)"/g)].map((m) => m[1]);

  it("shows Explain, Learn and Assets, in that order, then Signal for ATLAS users only", () => {
    expect(ids).toEqual(["explain", "glossary", "assets", "signal"]);
    // Signal starts hidden and appears only while ATLAS is present.
    expect(popup).toContain('shell.setTabHidden("signal", true);');
    expect(popup).toContain('shell.setTabHidden("signal", !atlasPresent);');
  });

  it("opens Settings from the menu as a sheet, not a tab", () => {
    expect(ids).not.toContain("settings");
    expect(popup).toContain('{ label: "Settings", icon: "gear", run: () => openSettings() }');
    expect(popup).toContain('shell.openSheet("Settings", settings.nodes);');
    expect(popup).not.toContain("shell.panels.settings");
    expect(popup).not.toContain('shell.select("settings"');
  });

  it("builds its settings with the shared builder, with every extension-only part switched on", () => {
    expect(popup).toContain("const settings = buildSettings({");
    for (const part of ["pageTools:", "onAccount:", "yourData:", "legal:", "atlas:", "about:"]) expect(popup).toContain(part);
    expect(popup).not.toMatch(/\bgroup\(/);
  });
});

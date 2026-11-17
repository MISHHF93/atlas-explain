import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRoute, pathFor, tabFor } from "../src/app/routes";

const app = readFileSync("src/web/app.ts", "utf8");
const shell = readFileSync("src/wallet/shell.ts", "utf8");

describe("the web app is one page", () => {
  it("stacks Explain, Today, Learn and Assets in that order, with Account out of the navigation", () => {
    const tabs = /export const APP_TABS[^=]*= \[([\s\S]*?)\];/.exec(app)?.[1] ?? "";
    expect([...tabs.matchAll(/id: "(\w+)"/g)].map((m) => m[1])).toEqual(["explain", "today", "glossary", "assets"]);
    expect(app).toContain('layout: "page"');
  });

  it("uses section links, not tab roles, on the page layout", () => {
    expect(shell).toContain('if (!paged) button.setAttribute("role", "tab");');
    expect(shell).toContain('if (!paged) list.setAttribute("role", "tablist");');
    expect(shell).toContain('button?.setAttribute("aria-current", "true")');
  });

  it("has no side rail or bottom bar: the links live in the header and the logo goes back to the top", () => {
    expect(shell).toContain("if (paged) header.insertBefore(nav, tools);");
    expect(shell).toContain("if (paged) frame.append(header, body, foot, sheet, overlaySlot, live);");
    expect(shell).toContain('"ATLAS Explain: back to the top"');
    const css = readFileSync("src/app/app.css", "utf8");
    expect(css).not.toMatch(/grid-template-areas|\.tabbar/);
    expect(css).toContain(".section-link[aria-current=\"true\"]");
  });

  it("opens Explain at /app and keeps every old address working", () => {
    expect(pathFor({ kind: "tab", tab: "explain" })).toBe("/app");
    for (const [path, tab] of [["/app/explain", "explain"], ["/app/today", "today"], ["/app/learn", "glossary"], ["/app/assets", "assets"], ["/app/account", "settings"]] as const) {
      expect(parseRoute(path)).toEqual({ kind: "tab", tab });
    }
    expect(tabFor(parseRoute("/app/assets/AAPL"))).toBe("assets");
    expect(parseRoute("/signin")).toEqual({ kind: "signin" });
  });

  it("puts account and settings in one sheet and never scrolls the page when it closes", () => {
    expect(app).toContain("accountPanel(account, accountHandlers(backend)), ...settingsNodes]);");
    expect(app).not.toContain("shell.panels.settings.append");
    expect(app).toMatch(/onSheetClose: \(\) => \{[\s\S]*?scroll: false/);
  });

  it("shows the whole asset catalog on All (owner decision, 17 Nov 2026), and keeps the glossary's visible Show all button", () => {
    const catalog = readFileSync("src/wallet/catalog-view.ts", "utf8");
    expect(catalog).not.toContain("compact");
    expect(catalog).not.toContain("Search above or pick a category to see them.");
    expect(app).not.toMatch(/mountAssets\([\s\S]{0,300}compact: true/);
    expect(app).toContain("initialCount: 6");
    expect(readFileSync("src/wallet/glossary-panel.ts", "utf8")).toContain("Show all ${items.length} terms");
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPOSER_PLACEHOLDER, EXPLAIN_TAB_BLOCKS, composerAction, composerHint } from "../src/core/composer";
import { digestRowStatus } from "../src/core/digest";

const popup = readFileSync("extension/src/popup.ts", "utf8");
const web = readFileSync("src/web/app.ts", "utf8");
const css = readFileSync("src/wallet/wallet.css", "utf8");

describe("minimal Explain composer", () => {
  it("reads the highlight while the box is empty", () => {
    expect(composerAction("")).toEqual({ mode: "highlight", label: "Explain highlight", icon: "highlight" });
    expect(composerAction("   \n").mode).toBe("highlight");
  });

  it("explains typed text once the reader types", () => {
    expect(composerAction("stop-limit")).toEqual({ mode: "typed", label: "Explain", icon: "sparkle" });
  });

  it("keeps the hint to one calm line with the shortcut", () => {
    const hint = composerHint("Alt+Shift+E opens this popup.");
    expect(hint).toContain("Explain with ATLAS");
    expect(hint).toContain("Alt+Shift+E");
    expect(hint.split("\n")).toHaveLength(1);
    expect(COMPOSER_PLACEHOLDER).toMatch(/Highlight text/);
  });

  it("uses no trade wording", () => {
    const copy = [COMPOSER_PLACEHOLDER, composerHint(""), composerAction("").label, composerAction("x").label].join(" ");
    expect(copy).not.toMatch(/\b(buy|sell|short|long)\b/i);
  });
});

describe("Today's digest row", () => {
  it("maps every digest state to one short honest label", () => {
    expect(digestRowStatus({ kind: "loading" })).toEqual({ label: "Loading", tone: "loading" });
    expect(digestRowStatus({ kind: "not_connected", reason: "x", today: "2026-11-13" })).toEqual({ label: "Not ready yet", tone: "waiting" });
    expect(digestRowStatus({ kind: "not_ready", reason: "x", today: "2026-11-13" }).tone).toBe("waiting");
  });
});

describe("popup Explain tab layout", () => {
  it("has one primary button instead of two", () => {
    expect(popup).not.toContain("explainTyped");
    expect(popup).not.toContain('"Explain text"');
    expect(popup).toContain("composerAction(question.value)");
  });

  it("stacks only the minimal blocks, in order", () => {
    expect(popup).toContain("shell.panels.explain.append(explainHead, composer, engine.node, today.node, result, recentSlot);");
    expect(EXPLAIN_TAB_BLOCKS).toEqual(["composer", "engine", "today", "result", "recent"]);
  });

  it("keeps the title for screen readers only", () => {
    expect(popup).toContain('el("div", "panel-title sr-only")');
  });

  it("uses the compact engine line on both surfaces and the digest row in the popup", () => {
    for (const src of [popup, web]) expect(src).toContain("engineStrip({ compact: true })");
    expect(popup).toContain("todayRow(");
    expect(popup).not.toMatch(/append\([^)]*brief\.node,/);
    // The web app gives the digest its own Today screen instead of a row on Explain.
    expect(web).toContain("shell.panels.today.append(");
    expect(web).not.toContain("todayRow(");
  });

  it("limits recent explanations to three", () => {
    expect(popup).toMatch(/historyCard\(\{\s*entries: history,\s*limit: 3,/);
  });

  it("styles with tokens and keeps fonts at 11px or more", () => {
    const block = css.slice(css.indexOf("/* minimal Explain"));
    expect(block).not.toMatch(/font-size:\s*(\d+(\.\d+)?)px/);
    expect(block).not.toMatch(/#[0-9a-f]{3,6}\b/i);
  });
});

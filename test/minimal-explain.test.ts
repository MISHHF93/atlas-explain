import { describe, expect, it } from "vitest";
import { COMPOSER_PLACEHOLDER, composerAction, composerHint } from "../src/core/composer";
import { digestRowStatus } from "../src/core/digest";


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


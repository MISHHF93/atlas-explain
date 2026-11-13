import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connectionCopy, signalCopy, whyQuestion, shortSelection, SAMPLE_EXPLANATION } from "../src/core/popup-copy";
import { mapSignal } from "../src/core/signal";

const css = readFileSync("extension/popup.css", "utf8");
const tokens = readFileSync("src/brand/tokens.css", "utf8");
const popup = readFileSync("extension/src/popup.ts", "utf8");
const icons = readFileSync("extension/src/icons.ts", "utf8");

const views = {
  connect: mapSignal({ connected: false }),
  thin: mapSignal({ connected: true, signal: { lean: "up", hitRate: 0.23, sampleSize: 13 } }),
  up: mapSignal({ connected: true, modelsClearGate: true, signal: { lean: "up", hitRate: 0.62, sampleSize: 240 } }),
  down: mapSignal({ connected: true, modelsClearGate: true, signal: { lean: "down", hitRate: 0.61, sampleSize: 240 } }),
};

describe("wallet popup copy", () => {
  it("names each light state without trade instructions", () => {
    expect(signalCopy(views.connect).headline).toBe("Connect ATLAS");
    expect(signalCopy(views.thin).headline).toBe("Not enough evidence");
    expect(signalCopy(views.up).headline).toBe("Model leans up");
    expect(signalCopy(views.down).headline).toBe("Model leans down");
    for (const view of Object.values(views)) {
      const copy = signalCopy(view);
      expect([copy.headline, copy.detail, copy.gate].join(" ")).not.toMatch(/\b(buy|sell)\b/i);
    }
    expect(SAMPLE_EXPLANATION.text).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("pairs every colour with an icon so the state is not colour-only", () => {
    expect(signalCopy(views.up).icon).toBe("up");
    expect(signalCopy(views.down).icon).toBe("down");
    expect(signalCopy(views.thin).icon).toBe("flat");
    expect(signalCopy(views.connect).icon).toBe("plug");
  });

  it("explains the evidence gate with the real thresholds", () => {
    expect(signalCopy(views.thin).detail).toContain("200");
    expect(signalCopy(views.thin).detail).toContain("55%");
    expect(whyQuestion(views.thin)).toContain("Do not recommend a trade");
  });

  it("labels the connection pill for desk, none, and offline", () => {
    expect(connectionCopy("desk").label).toBe("ATLAS desk");
    expect(connectionCopy("none").label).toBe("Not connected");
    expect(connectionCopy("offline").label).toBe("Offline");
  });

  it("shortens long highlights for the quote line", () => {
    expect(shortSelection("a".repeat(200)).length).toBe(90);
    expect(shortSelection("  stop   limit ")).toBe("stop limit");
  });
});

describe("wallet popup design rules", () => {
  it("uses tokens only: no hex colours in popup CSS", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("never sets a font below 11px", () => {
    for (const match of `${css}\n${tokens}`.matchAll(/font-size:\s*([\d.]+)(px|rem)/g)) {
      const px = match[2] === "rem" ? Number(match[1]) * 16 : Number(match[1]);
      expect(px).toBeGreaterThanOrEqual(11);
    }
    for (const match of tokens.matchAll(/--atlas-text-[\w-]+:\s*([\d.]+)px/g)) {
      expect(Number(match[1])).toBeGreaterThanOrEqual(11);
    }
  });

  it("honours reduced motion and shows a focus ring", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    expect(css).toMatch(/:focus-visible\s*\{\s*outline: 3px solid var\(--atlas-accent\)/);
  });

  it("announces results and state changes to screen readers", () => {
    expect(popup).toContain('result.setAttribute("aria-live", "polite")');
    expect(popup).toContain('live.setAttribute("aria-live", "polite")');
    expect(popup).toContain('settings.setAttribute("role", "dialog")');
    expect(popup).toContain('themeGroup.setAttribute("role", "radiogroup")');
  });

  it("keeps Firebase out of the popup entry and never says buy or sell", () => {
    expect(popup).not.toMatch(/^import .*from "\.\/cloud"/m);
    expect(popup).toContain('import("./cloud")');
    expect(popup).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("ships every icon the popup asks for", () => {
    for (const match of popup.matchAll(/icon(?:Button)?\(\s*"([a-z]+)"/g)) {
      expect(icons).toContain(`  ${match[1]}: '`);
    }
    for (const match of popup.matchAll(/labelledButton\(\s*"([a-z]+)"/g)) {
      expect(icons).toContain(`  ${match[1]}: '`);
    }
  });
});

describe("hidden attribute", () => {
  it("wins over component display rules, so hidden links and the closed sheet stay hidden", () => {
    expect(css).toMatch(/\[hidden\]\s*\{\s*display: none !important;\s*\}/);
  });
});

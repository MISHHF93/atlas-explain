import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { engineCopy, isEngineState, lastRunLine, mapAvailability, readEngineState, type EngineState } from "../src/core/hybrid-engine";

const ALL: EngineState[] = ["checking", "ready", "downloadable", "downloading", "cloud", "offline"];

describe("hybrid engine status", () => {
  it("maps old and new Prompt API availability strings", () => {
    expect(mapAvailability("available")).toBe("ready");
    expect(mapAvailability("readily")).toBe("ready");
    expect(mapAvailability("downloadable")).toBe("downloadable");
    expect(mapAvailability("after-download")).toBe("downloadable");
    expect(mapAvailability("downloading")).toBe("downloading");
    expect(mapAvailability("unavailable")).toBe("cloud");
    expect(mapAvailability("no")).toBe("cloud");
    expect(mapAvailability(undefined)).toBe("cloud");
  });

  it("reads availability without creating a session or downloading", async () => {
    let created = 0;
    const scope = { LanguageModel: { availability: async () => "available", create: async () => { created += 1; } } };
    expect(await readEngineState(scope, true)).toBe("ready");
    expect(created).toBe(0);
  });

  it("falls back to cloud when the API is missing or throws, and to offline when no route exists", async () => {
    expect(await readEngineState({}, true)).toBe("cloud");
    expect(await readEngineState({ LanguageModel: { availability: async () => { throw new Error("x"); } } }, true)).toBe("cloud");
    expect(await readEngineState({}, false)).toBe("offline");
    expect(await readEngineState({ LanguageModel: { availability: async () => "downloadable" } }, false)).toBe("offline");
    // A ready on-device model still answers offline.
    expect(await readEngineState({ LanguageModel: { availability: async () => "available" } }, false)).toBe("ready");
  });

  it("names the route for every state in plain, education-safe words", () => {
    expect(engineCopy("ready").route).toBe("device");
    expect(engineCopy("cloud").route).toBe("cloud");
    expect(engineCopy("downloadable").route).toBe("cloud");
    expect(engineCopy("offline").route).toBe("none");
    for (const state of ALL) {
      const copy = engineCopy(state);
      expect(copy.label.length).toBeGreaterThan(0);
      expect(`${copy.label} ${copy.detail}`).not.toMatch(/\b(buy|sell)\b/i);
      expect(isEngineState(state)).toBe(true);
    }
    expect(isEngineState("fast")).toBe(false);
    expect(engineCopy("cloud").detail).toMatch(/Firebase AI Logic/);
  });

  it("describes the route the last answer actually took", () => {
    expect(lastRunLine("on_device")).toMatch(/this device/);
    expect(lastRunLine("in_cloud")).toMatch(/cloud/);
    expect(lastRunLine("unknown")).toMatch(/did not report/);
  });

  it("shows the strip on both surfaces and respects reduced motion", () => {
    const popup = readFileSync("extension/src/popup.ts", "utf8");
    const web = readFileSync("src/web/app.ts", "utf8");
    const css = readFileSync("src/wallet/wallet.css", "utf8");
    for (const src of [popup, web]) {
      expect(src).toContain("engineStrip()");
      expect(src).toContain("engine.markRun(");
    }
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.engine-pulse \{ animation: none !important; \}/);
  });
});

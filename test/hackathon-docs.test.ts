import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const submission = readFileSync(new URL("../docs/SUBMISSION.md", import.meta.url), "utf8");
const demo = readFileSync(new URL("../docs/DEMO.md", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

describe("hackathon write-up matches current features", () => {
  it("describes one front end and one back end, and the honest header state", () => {
    expect(submission.length).toBeGreaterThan(0);
    expect(readme).toMatch(/Live prices/);
    expect(readme).toContain("## How the pieces fit");
    expect(readme).toContain("http://127.0.0.1:5173");
    // The separate local ATLAS app and its connectors library are gone (24 Nov 2026).
    expect(readme).not.toMatch(/src\/connectors|ATLAS connected|api\/mcp\/public/);
  });

  it("keeps the demo video unchecked and tells the presenter to record on a laptop with Gemini Nano", () => {
    expect(submission).toMatch(/- \[ \] Demo video/);
    expect(submission).not.toMatch(/- \[x\] Demo video/i);
    expect(demo).toMatch(/Gemini Nano/);
    expect(demo).toMatch(/LanguageModel\.availability/);
    expect(demo).toMatch(/chrome:\/\/flags\/#prompt-api-for-gemini-nano-multimodal-input/);
    expect(demo).toMatch(/presenter's laptop|presenters laptop|your laptop/i);
  });

  it("lists the recording shots, the on-device answer first and the connector last, with no Chrome extension", () => {
    expect(demo).toMatch(/Shot list/);
    expect(demo).toMatch(/Explain this move/);
    expect(demo).toMatch(/Live prices/);
    expect(demo).toMatch(/ATLAS connected/);
    expect(demo).toMatch(/price_history/);
    // Judges score the use of Firebase AI Logic, so the hybrid answer leads.
    const shots = demo.slice(demo.indexOf("## Shot list"));
    expect(shots.indexOf("On this device")).toBeLessThan(shots.indexOf("price_history"));
    for (const text of [demo, readme]) expect(text).not.toMatch(/Alt\+Shift|build:extension|Load unpacked/);
  });


  it("ships the README screenshot set and does not invent an on-device badge", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const shots = ["hosted-header.png", "hosted-full.png"];
    for (const name of shots) {
      expect(existsSync(join(root, "docs/screenshots", name))).toBe(true);
      expect(readme).toContain(`docs/screenshots/${name}`);
    }
    expect(existsSync(join(root, "docs/screenshots", "on-device-badge.png"))).toBe(false);
    expect(readme).toMatch(/on-device badge is \*\*not\*\* included/i);
    expect(demo).toMatch(/do not fabricate this badge/i);
  });

  it("gives the Devpost text every required part, with Firebase AI Logic before the connector", () => {
    const devpost = readFileSync(new URL("../docs/DEVPOST.md", import.meta.url), "utf8");
    for (const part of ["## How we built it: Firebase AI Logic hybrid inference", "## What we built during the submission period", "PREFER_ON_DEVICE", "inferenceSource", "AI coding assistant", "https://atlas-explain.web.app/app", "Apache-2.0"]) {
      expect(devpost, part).toContain(part);
    }
    expect(devpost.indexOf("Gemini Nano")).toBeLessThan(devpost.indexOf("MCP"));
    expect(devpost).not.toMatch(/\b(you should|we recommend)\s+(buy|sell)\b/i);
  });

  it("stays education-only in the submission and demo scripts", () => {
    const joined = `${submission}\n${demo}`;
    expect(joined).not.toMatch(/\b(you should|we recommend|you must|time to|go ahead and)\s+(buy|sell|short)\b/i);
    expect(joined).not.toMatch(/\b(buy|sell)\s+(now|signal|today)\b/i);
    expect(joined).toMatch(/not investment advice/i);
  });
});

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const submission = readFileSync(new URL("../docs/SUBMISSION.md", import.meta.url), "utf8");
const demo = readFileSync(new URL("../docs/DEMO.md", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
const connectors = readFileSync(new URL("../docs/connectors/README.md", import.meta.url), "utf8");

describe("hackathon write-up matches current features", () => {
  it("names connectors, public MCP, and honest header states", () => {
    for (const text of [submission, readme]) {
      expect(text).toMatch(/src\/connectors/);
      expect(text).toMatch(/\/api\/mcp\/public/);
      expect(text).toMatch(/Hosted app/);
      expect(text).toMatch(/ATLAS local/);
      expect(text).toMatch(/never calls localhost/i);
    }
    expect(connectors).toMatch(/src\/connectors\//);
    expect(connectors).toMatch(/Hosted app|never calls localhost/);
  });

  it("keeps the demo video unchecked and tells the presenter to record on a laptop with Gemini Nano", () => {
    expect(submission).toMatch(/- \[ \] Demo video/);
    expect(submission).not.toMatch(/- \[x\] Demo video/i);
    expect(demo).toMatch(/Gemini Nano/);
    expect(demo).toMatch(/LanguageModel\.availability/);
    expect(demo).toMatch(/chrome:\/\/flags\/#prompt-api-for-gemini-nano-multimodal-input/);
    expect(demo).toMatch(/presenter's laptop|presenters laptop|your laptop/i);
  });

  it("lists the recording shots and both extension shortcuts", () => {
    expect(demo).toMatch(/Shot list/);
    expect(demo).toMatch(/Explain this move/);
    expect(demo).toMatch(/Hosted app/);
    expect(demo).toMatch(/ATLAS local/);
    expect(demo).toMatch(/Alt\+Shift\+E/);
    expect(demo).toMatch(/Alt\+Shift\+X/);
    expect(readme).toMatch(/Alt\+Shift\+E/);
    expect(readme).toMatch(/Alt\+Shift\+X/);
  });


  it("ships the README screenshot set and does not invent an on-device badge", () => {
    const root = fileURLToPath(new URL("..", import.meta.url));
    const shots = [
      "hosted-header.png",
      "local-header.png",
      "desk-explain-link.png",
      "local-full.png",
      "hosted-full.png",
      "glossary-shadow.png",
      "signal-grey.png",
      "highlight-practice.png",
    ];
    for (const name of shots) {
      expect(existsSync(join(root, "docs/screenshots", name))).toBe(true);
      expect(readme).toContain(`docs/screenshots/${name}`);
    }
    expect(existsSync(join(root, "docs/screenshots", "on-device-badge.png"))).toBe(false);
    expect(readme).toMatch(/on-device badge is \*\*not\*\* included/i);
    expect(demo).toMatch(/do not fabricate this badge/i);
  });

  it("stays education-only in the submission and demo scripts", () => {
    const joined = `${submission}\n${demo}`;
    expect(joined).not.toMatch(/\b(you should|we recommend|you must|time to|go ahead and)\s+(buy|sell|short)\b/i);
    expect(joined).not.toMatch(/\b(buy|sell)\s+(now|signal|today)\b/i);
    expect(joined).toMatch(/not investment advice/i);
  });
});

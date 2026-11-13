import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { earlierOfficialNoteCopy, staleMorningReportCopy } from "../src/wallet/digest";

describe("stale digest copy", () => {
  it("says an earlier official note is on file and is not today's note", () => {
    const line = earlierOfficialNoteCopy("2026-11-12", "America/Toronto");
    expect(line).toBe(
      "An earlier official note from 2026-11-12 (America/Toronto) is on file. It is not today's note.",
    );
    expect(line.toLowerCase()).not.toMatch(/most recent earlier/);
  });

  it("does not present a prior morning report as today's brief", () => {
    const line = staleMorningReportCopy("2026-11-02", "America/Toronto");
    expect(line).toBe(
      "The last ATLAS morning report is dated 2026-11-02 (America/Toronto). It is not today's report, so it is not shown as today's brief.",
    );
    expect(line.toLowerCase()).not.toMatch(/you should buy|you should sell|buy now|sell now/);
  });
});

describe("compact brief when not ready", () => {
  const src = readFileSync("src/wallet/digest.ts", "utf8");
  const css = readFileSync("src/wallet/wallet.css", "utf8");
  it("collapses loading and not-ready to one line but keeps the honest reason in the DOM", () => {
    expect(src).toContain('node.dataset.compact = view.kind === "ready" ? "false" : "true"');
    expect(src).toContain('p.dataset.testid = "digest-not-ready"');
    expect(src).toContain("Why it is not ready");
    expect(css).toContain('.daily-digest[data-compact="true"] .digest-date { display: none; }');
  });
  it("keeps the ready brief as a full card", () => {
    expect(src).toMatch(/digest-headline/);
    expect(css).not.toMatch(/\.daily-digest\[data-compact="false"\][^{]*\{[^}]*display: none/);
  });
});

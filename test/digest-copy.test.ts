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

import { describe, expect, it } from "vitest";
import { NOT_READY, todayToronto, viewFor } from "../src/core/digest";

const NOW = Date.parse("2026-11-13T13:12:00Z"); // 8:12 America/Toronto

const todayBody = {
  schema: "atlas-explain-digest-v1",
  reportingDate: "2026-11-13",
  timezone: "America/Toronto",
  generatedAtToronto: "2026-11-13 08:12 EST",
  headline: "Educational market context for Friday, November 13, 2026 (America/Toronto).",
  officialNotes: [{ title: "Bank of Canada publishes a consultation", source: "boc_press", publishedAtToronto: "2026-11-13 07:00 EST", publishedDate: "2026-11-13", url: "https://example.invalid/b", kind: "macro" }],
  previousOfficialNotes: [{ title: "Federal Reserve Board announces a pricing schedule", source: "fed_press", publishedAtToronto: "2026-11-12 13:30 EST", publishedDate: "2026-11-12", url: "https://example.invalid/a", kind: "macro" }],
  reason: null,
  morningReport: { reportDate: "2026-11-02", generatedAtToronto: "2026-11-02 18:52 EST", isToday: false },
  disclaimer: "Education only.",
};

describe("today's digest", () => {
  it("uses America/Toronto, not UTC, around midnight", () => {
    expect(todayToronto(Date.parse("2026-11-13T02:30:00Z"))).toBe("2026-11-12");
    expect(todayToronto(NOW)).toBe("2026-11-13");
  });

  it("is not_connected on the hosted app and does not invent a digest", () => {
    const v = viewFor(todayBody, false, NOW);
    expect(v.kind).toBe("not_connected");
    if (v.kind !== "not_connected") throw new Error("expected not_connected");
    expect(v.today).toBe("2026-11-13");
    expect(v.reason).toContain(NOT_READY);
  });

  it("refuses to treat yesterday's file as today", () => {
    const v = viewFor({ ...todayBody, reportingDate: "2026-11-12" }, true, NOW);
    expect(v.kind).toBe("not_ready");
    if (v.kind !== "not_ready") throw new Error("expected not_ready");
    expect(v.today).toBe("2026-11-13");
    expect(v.reason).toContain("2026-11-12");
    expect(v.digest?.reportingDate).toBe("2026-11-12");
  });

  it("keeps today's official notes separate from yesterday's", () => {
    const v = viewFor(todayBody, true, NOW);
    expect(v.kind).toBe("ready");
    if (v.kind !== "ready") throw new Error("expected ready");
    expect(v.digest.officialNotes.map((n) => n.publishedDate)).toEqual(["2026-11-13"]);
    expect(v.digest.previousOfficialNotes[0]?.publishedDate).toBe("2026-11-12");
    expect(v.digest.morningReport?.isToday).toBe(false);
  });
});

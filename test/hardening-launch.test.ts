import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLOUD_PER_DAY, CLOUD_PER_MINUTE, checkCloudRate, readStamps, takeCloudSlot, type RateStore } from "../src/core/rate-limit";
import { addMonitorSink, recentEvents, report, scrub } from "../src/core/monitor";

const mem = (): RateStore & { value: string | null } => {
  const s = { value: null as string | null, get: () => s.value, set: (v: string) => { s.value = v; } };
  return s;
};

describe("cloud abuse guard", () => {
  it("allows normal use and stops bursts with a plain message", () => {
    const now = 1_000_000_000;
    const store = mem();
    for (let i = 0; i < CLOUD_PER_MINUTE; i++) expect(takeCloudSlot(store, now + i).ok).toBe(true);
    const blocked = takeCloudSlot(store, now + 100);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toMatch(/On-device answers are not limited/);
    expect(takeCloudSlot(store, now + 61_000).ok).toBe(true);
  });

  it("caps a day and ignores junk storage", () => {
    const now = 2_000_000_000;
    const day = Array.from({ length: CLOUD_PER_DAY }, (_, i) => now - 3_600_000 - i * 1000);
    expect(checkCloudRate(day, now).ok).toBe(false);
    expect(readStamps("not json", now)).toEqual([]);
    expect(readStamps(JSON.stringify(["x", now + 5, now - 90_000_000, now - 1]), now)).toEqual([now - 1]);
  });
});

describe("monitoring hooks", () => {
  it("scrubs emails and tokens and never throws on a broken sink", () => {
    expect(scrub("failed for ada@example.com with eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9")).toBe("failed for [email] with [token]");
    const seen: string[] = [];
    const off = addMonitorSink((e) => seen.push(e.kind));
    const offBad = addMonitorSink(() => { throw new Error("sink down"); });
    report("auth_error", "web", "auth/operation-not-allowed");
    expect(seen).toEqual(["auth_error"]);
    expect(recentEvents().at(-1)?.code).toBe("auth/operation-not-allowed");
    off();
    offBad();
  });
});

describe("launch docs", () => {
  it("has a checklist and clearly marked legal drafts", () => {
    const checklist = readFileSync("docs/LAUNCH_CHECKLIST.md", "utf8");
    for (const part of ["Chrome Web Store", "OAuth consent", "Privacy policy and terms review", "Billing switch-on", "ppobolmelmhmaofinpcihihlnhokiomm"]) expect(checklist).toContain(part);
    for (const f of ["docs/legal/PRIVACY_DRAFT.md", "docs/legal/TERMS_DRAFT.md"]) expect(readFileSync(f, "utf8")).toMatch(/DRAFT for review/);
    expect(readFileSync("src/wallet/legal.ts", "utf8")).toMatch(/DRAFT for review/);
  });
});

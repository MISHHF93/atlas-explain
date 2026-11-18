import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { comingUp } from "../src/core/coming-up";
import { countdown, eventIcs, scenariosFor } from "../src/core/scenarios";
import { decisionTime, ECONOMY_SCHEMA, parseBlsSchedule, parseBoeBankRate, parseBoeMpcDates, readEconomyFile, zonedTime, type EconomyFile } from "../src/data/economy";
import { upcomingEvents, type Fetcher } from "../src/mcp/server";

// The BLS's own release calendar and the Bank of England's MPC dates, saved on 18 Nov 2026.
const fx = (name: string) => readFileSync(`test/fixtures/economy/${name}`, "utf8");
const AT = "2026-11-18T15:00:00.000Z";
const NOW = Date.parse(AT);
const releases = parseBlsSchedule(fx("bls-schedule.ics"));
const file: EconomyFile = readEconomyFile({
  schema: ECONOMY_SCHEMA, generatedAt: AT,
  indicators: [parseBoeBankRate(fx("boe-bank-rate.csv"), AT)],
  calendar: { capturedAt: AT, events: parseBoeMpcDates(fx("boe-mpc-dates.html")) },
  releases: { capturedAt: AT, events: releases },
})!;

describe("exact times, from each publisher's own calendar", () => {
  it("reads the BLS calendar: CPI, jobs and PPI at 8:30 am New York time, in UTC", () => {
    const cpi = releases.find((r) => r.kind === "cpi" && r.date === "2026-12-10")!;
    // December: New York is UTC-5.
    expect(cpi.time).toBe("2026-12-10T13:30:00.000Z");
    const jobs = releases.find((r) => r.kind === "jobs" && r.date === "2026-12-04")!;
    expect(jobs.title).toMatch(/jobs report/);
    expect(releases.every((r) => r.sourceUrl.startsWith("https://www.bls.gov/"))).toBe(true);
  });

  it("follows daylight saving: 8:30 in New York is 12:30 UTC in summer", () => {
    expect(zonedTime("2026-07-15", 8, 30, "America/New_York")).toBe("2026-07-15T12:30:00.000Z");
    expect(zonedTime("2026-12-17", 12, 0, "Europe/London")).toBe("2026-12-17T12:00:00.000Z");
    expect(zonedTime("2026-06-17", 12, 0, "Europe/London")).toBe("2026-06-17T11:00:00.000Z");
  });

  it("times each rate decision at its bank's announcement hour", () => {
    expect(decisionTime({ date: "2026-12-09", startDate: "2026-12-08", institution: "Federal Reserve", title: "", about: "", withProjections: true, sourceUrl: "https://x" })).toBe("2026-12-09T19:00:00.000Z");
    expect(decisionTime({ date: "2026-12-09", startDate: null, institution: "Bank of Canada", title: "", about: "", withProjections: false, sourceUrl: "https://x" })).toBe("2026-12-09T14:45:00.000Z");
    expect(decisionTime({ date: "2026-12-17", startDate: null, institution: "European Central Bank", title: "", about: "", withProjections: false, sourceUrl: "https://x" })).toBe("2026-12-17T13:15:00.000Z");
  });
});

describe("coming up, with countdowns and 'if this happens'", () => {
  it("merges decisions and releases soonest first, each with context and its outcomes", () => {
    const list = comingUp(file, NOW, 4);
    expect(list.map((e) => e.time)).toEqual([...list.map((e) => e.time)].sort());
    expect(list[0]).toMatchObject({ kind: "jobs", time: "2026-12-04T13:30:00.000Z" });
    const boe = comingUp(file, NOW, 12).find((e) => e.kind === "rate_decision")!;
    expect(boe.context).toMatch(/Bank of England Bank Rate 4\.00%.*last moved \+0\.25 pt on 2026-11-05/);
    expect(boe.scenarios.outcomes.map((o) => o.outcome)).toEqual(expect.arrayContaining([expect.stringMatching(/holds/), expect.stringMatching(/raises/), expect.stringMatching(/cuts/)]));
  });

  it("counts down in plain words", () => {
    expect(countdown("2026-12-04T13:30:00.000Z", NOW)).toBe("in 15 days, 22 hours");
    expect(countdown("2026-11-18T17:05:00.000Z", NOW)).toBe("in 2 hours, 5 minutes");
    expect(countdown("2026-11-18T15:00:30.000Z", NOW)).toBe("in 1 minute");
    expect(countdown("2026-11-18T14:00:00.000Z", NOW)).toBe("now");
  });

  it("explains outcomes without predicting one or suggesting a trade", () => {
    for (const kind of ["rate_decision", "cpi", "jobs", "ppi"] as const) {
      const set = scenariosFor(kind);
      const all = [...set.watch, ...set.outcomes.flatMap((o) => [o.outcome, o.meaning]), set.caution].join(" ");
      expect(all, kind).not.toMatch(/\b(buy|sell|will (rise|fall|happen)|expect(ed)? to|likely to (rise|fall)|forecast)\b/i);
      expect(set.outcomes.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("makes a calendar file for any event", () => {
    const ics = eventIcs({ title: "US inflation report (Consumer Price Index)", time: "2026-12-10T13:30:00.000Z", about: "Prices, over 12 months.", sourceUrl: "https://www.bls.gov/x", uid: "bls-cpi-2026-12-10" });
    expect(ics).toContain("DTSTART:20261210T133000Z");
    expect(ics).toContain("SUMMARY:US inflation report (Consumer Price Index)");
    expect(ics).toContain("DESCRIPTION:Prices\\, over 12 months. Source: https://www.bls.gov/x");
  });

  it("is a connector tool: upcoming_events, filterable to rates or data", async () => {
    const serve: Fetcher = async () => new Response(JSON.stringify(file), { status: 200 });
    const all = await upcomingEvents(undefined, serve, NOW);
    expect(all.content[0]!.text).toContain("in 15 days, 22 hours");
    expect(all.content[0]!.text).toContain("they never say which will happen");
    const rates = (await upcomingEvents("rates", serve, NOW)).structuredContent as { events: { kind: string }[] };
    expect(rates.events.every((e) => e.kind === "rate_decision")).toBe(true);
    const data = (await upcomingEvents("data", serve, NOW)).structuredContent as { events: { kind: string }[] };
    expect(data.events.length).toBeGreaterThan(0);
    expect(data.events.every((e) => e.kind !== "rate_decision")).toBe(true);
  });
});

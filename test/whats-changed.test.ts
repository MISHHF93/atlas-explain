import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { changeTopic, whatsChanged } from "../src/core/whats-changed";
import { DOCS_SCHEMA, type DocsFile } from "../src/data/docs";
import { ECONOMY_SCHEMA, readEconomyFile, trackFirstSeen, type EconomyFile, type Indicator } from "../src/data/economy";
import { handle, setFeatures, whatsChangedTool, type Fetcher } from "../src/mcp/server";

const NOW = Date.parse("2026-11-23T12:00:00Z");
const DAY = 86_400_000;

const ind = (id: Indicator["id"], name: string, series: { t: string; v: number }[], unit: "%" | "USD" = "%"): Indicator => ({
  id, name, unit, value: series.at(-1)!.v, period: series.at(-1)!.t, change: null, changeWindow: "", note: null, series,
  source: "Agency", sourceUrl: "https://agency.example/series", capturedAt: "2026-11-23T00:00:00Z",
});

function economy(): EconomyFile {
  const cpi = ind("ca_cpi", "Canada inflation (CPI, over 12 months)", [{ t: "2026-08", v: 2.9 }, { t: "2026-09", v: 3.1 }, { t: "2026-10", v: 3.1 }]);
  const boc = ind("ca_policy_rate", "Bank of Canada policy rate", [{ t: "2025-11-18", v: 2.25 }, { t: "2026-10-29", v: 2.5 }, { t: "2026-11-20", v: 2.5 }]);
  const sofr = ind("us_sofr", "SOFR", [{ t: "2026-11-01", v: 3.9 }, { t: "2026-11-20", v: 3.93 }]);
  const debt = ind("us_debt", "US total public debt outstanding", [{ t: "2026-11-01", v: 40.4e12 }, { t: "2026-11-20", v: 40.7e12 }], "USD");
  return {
    schema: ECONOMY_SCHEMA, generatedAt: "2026-11-23T00:00:00Z", indicators: [cpi, boc, sofr, debt],
    calendar: { capturedAt: "2026-11-23T00:00:00Z", events: [{ date: "2026-12-09", startDate: null, institution: "Bank of Canada", title: "Bank of Canada rate announcement", about: "", withProjections: false, sourceUrl: "https://boc.example/dec" }] },
    // Sep was there before tracking; Oct was first seen on 17 Nov.
    firstSeen: { ca_cpi: { "2026-08": null, "2026-09": null, "2026-10": "2026-11-17T13:00:00.000Z" } },
    trackingSince: "2026-11-01T00:00:00.000Z",
  };
}
const docs: DocsFile = {
  schema: DOCS_SCHEMA, generatedAt: "2026-11-23T00:00:00Z",
  statements: { fed: [], ecb: [], boe: [], boc: [{ bank: "boc", date: "2026-10-28", title: "Bank of Canada raises the policy rate", url: "https://boc.example/st", paragraphs: [], decision: null, capturedAt: "2026-10-28T14:00:00Z" }] },
  speeches: {
    fed: [{ bank: "fed", date: "2026-11-20", title: "Remarks", speaker: "Cook", about: "", url: "https://fed.example/sp" }],
    boc: [{ bank: "boc", date: "2026-12-01", title: "Not yet given", speaker: null, about: "", url: "https://boc.example/later" }],
    ecb: [], boe: [],
  },
};

describe("what changed since a date", () => {
  it("names the day a policy rate took effect, not the first day of its old level", () => {
    const r = whatsChanged({ economy: economy(), docs, topic: "canada", since: Date.parse("2026-10-01"), now: NOW });
    const boc = r.changes.find((c) => c.id === "ca_policy_rate")!;
    expect(boc.claim).toBe("Bank of Canada policy rate rose from 2.25% to 2.50%, in effect from 2026-10-29.");
    expect(boc.asOf).toBe("2026-10-29");
    expect(boc.source.url).toMatch(/^https:\/\//);
  });

  it("counts a monthly figure only when it was first published after the date", () => {
    const after = whatsChanged({ economy: economy(), docs, topic: "inflation", since: Date.parse("2026-11-10"), now: NOW });
    expect(after.changes.map((c) => c.claim)).toEqual(["Canada inflation (CPI, over 12 months) was unchanged at 3.10% (Sep 2026 and Oct 2026)."]);
    const later = whatsChanged({ economy: economy(), docs, topic: "inflation", since: Date.parse("2026-11-18"), now: NOW });
    expect(later.changes).toEqual([]);
  });

  it("ignores day-to-day noise in SOFR but reports US debt, with both dates", () => {
    const r = whatsChanged({ economy: economy(), docs, topic: "us", since: Date.parse("2026-11-05"), now: NOW });
    expect(r.changes.map((c) => c.id)).toEqual(["us_debt"]);
    expect(r.changes[0]!.claim).toBe("US total public debt outstanding rose from $40.40 trillion (2026-11-01) to $40.70 trillion (2026-11-20).");
  });

  it("lists the statements and speeches given since then, never one scheduled for later, and what's coming", () => {
    const r = whatsChanged({ economy: economy(), docs, topic: "all", since: Date.parse("2026-10-01"), now: NOW });
    expect(r.documents.map((d) => `${d.publishedAt} ${d.kind} ${d.institution}`)).toEqual(["2026-11-20 speech Federal Reserve", "2026-10-28 statement Bank of Canada"]);
    expect(r.upcoming).toEqual([{ date: "2026-12-09", institution: "Bank of Canada", title: "Bank of Canada rate announcement", sourceUrl: "https://boc.example/dec" }]);
  });

  it("says when monthly figures can't be compared that far back, or at all yet", () => {
    const early = whatsChanged({ economy: economy(), docs, topic: "all", since: Date.parse("2026-10-01"), now: NOW });
    expect(early.notes.join(" ")).toContain("Monthly figures are compared from 2026-11-01");
    const untracked = { ...economy(), firstSeen: undefined, trackingSince: undefined };
    expect(whatsChanged({ economy: untracked, docs, topic: "all", since: NOW - 7 * DAY, now: NOW }).notes.join(" ")).toContain("aren't compared yet");
    expect(whatsChanged({ economy: null, docs: null, topic: "all", since: NOW - 7 * DAY, now: NOW }).notes.length).toBe(2);
  });

  it("reads topics in plain words", () => {
    expect(["", "everything", "Eurozone", "britain", "unemployment", "prices"].map(changeTopic)).toEqual(["all", "all", "euro", "uk", "jobs", "inflation"]);
    expect(changeTopic("crypto")).toBeNull();
  });
});

describe("recording when each figure first appears", () => {
  const a = ind("uk_cpi", "UK inflation", [{ t: "2026-09", v: 3.5 }, { t: "2026-10", v: 3.6 }]);
  const base = (indicators: Indicator[], extra: Partial<EconomyFile> = {}): EconomyFile => ({ schema: ECONOMY_SCHEMA, generatedAt: "2026-11-23T00:00:00Z", indicators, calendar: { capturedAt: "2026-11-23T00:00:00Z", events: [] }, ...extra });

  it("marks what was already there when tracking starts, then stamps each new period", () => {
    const first = trackFirstSeen([a], null, "2026-11-23T06:00:00.000Z");
    expect(first).toEqual({ firstSeen: { uk_cpi: { "2026-09": null, "2026-10": null } }, trackingSince: "2026-11-23T06:00:00.000Z" });
    const b = ind("uk_cpi", "UK inflation", [{ t: "2026-09", v: 3.5 }, { t: "2026-10", v: 3.6 }, { t: "2026-11", v: 3.4 }]);
    const next = trackFirstSeen([b], base([a], first), "2026-12-16T08:00:00.000Z");
    expect(next.firstSeen.uk_cpi).toEqual({ "2026-09": null, "2026-10": null, "2026-11": "2026-12-16T08:00:00.000Z" });
    expect(next.trackingSince).toBe("2026-11-23T06:00:00.000Z");
    // An indicator added later starts as "before tracking" too.
    const added = trackFirstSeen([b, ind("ca_cpi", "Canada inflation", [{ t: "2026-10", v: 3.1 }])], base([b], next), "2026-12-17T00:00:00.000Z");
    expect(added.firstSeen.ca_cpi).toEqual({ "2026-10": null });
  });

  it("keeps the dates through the published file", () => {
    const file = base([a], trackFirstSeen([a], null, "2026-11-23T06:00:00.000Z"));
    expect(readEconomyFile(JSON.parse(JSON.stringify(file)))?.trackingSince).toBe("2026-11-23T06:00:00.000Z");
    expect(readEconomyFile(JSON.parse(JSON.stringify(base([a]))))?.firstSeen).toBeUndefined();
  });
});

describe("whats_changed in the connector", () => {
  afterEach(() => setFeatures(undefined));
  const serve = (e: EconomyFile): Fetcher => async (url) =>
    url.endsWith("/economy.json") ? new Response(JSON.stringify(e)) : url.endsWith("/docs.json") ? new Response(JSON.stringify(docs)) : new Response("no", { status: 404 });

  it("is off until V2_TOOLS names it, and on in this deployment", async () => {
    setFeatures(undefined);
    const off = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whats_changed", arguments: {} } }, serve(economy()));
    expect(off?.error).toBeTruthy();
    expect(readFileSync("wrangler.toml", "utf8")).toMatch(/V2_TOOLS = "[^"]*whats_changed/);
  });

  it("answers with sourced claims and never forecasts", async () => {
    const r = await whatsChangedTool({ topic: "canada", since: "2026-10-01" }, serve(economy()), NOW);
    const t = r.content[0]!.text;
    expect(t).toContain("What changed since 2026-10-01 (canada):");
    expect(t).toContain("in effect from 2026-10-29. Source: Agency (https://agency.example/series).");
    expect(t).toContain("2026-10-28, Bank of Canada statement");
    expect(t).toContain("nothing here says what happens next");
    expect(t.replace(/"[^"]*"/g, "")).not.toMatch(/\b(will (cut|raise|hold)|likely to|expected to|you should|buy|sell)\b/i);
  });

  it("refuses what it can't answer", async () => {
    const f = serve(economy());
    expect((await whatsChangedTool({ since: "2025-01-01" }, f, NOW)).isError).toBe(true);
    expect((await whatsChangedTool({ days: 0 }, f, NOW)).isError).toBe(true);
    expect((await whatsChangedTool({ since: "next week" }, f, NOW)).isError).toBe(true);
    expect((await whatsChangedTool({ topic: "crypto" }, f, NOW)).isError).toBe(true);
    expect((await whatsChangedTool({ since: "2026-12-01" }, f, NOW)).isError).toBe(true);
  });
});

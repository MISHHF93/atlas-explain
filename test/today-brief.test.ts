import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headlinesFrom } from "../src/core/catalog";
import { loadTodayBrief, ratesFrom, readNotable } from "../src/core/today-brief";
import { ECONOMY_SCHEMA, parseBoeBankRate, parseBoeMpcDates, parseEcbDepositRate, type EconomyFile } from "../src/data/economy";

// Real responses saved on 18 Nov 2026 (test/fixtures/economy).
const fx = (name: string) => readFileSync(`test/fixtures/economy/${name}`, "utf8");
const AT = "2026-11-18T15:00:00.000Z";
const NOW = Date.parse(AT);
const economy: EconomyFile = {
  schema: ECONOMY_SCHEMA,
  generatedAt: AT,
  indicators: [parseEcbDepositRate(fx("ecb-deposit-rate.csv"), AT)!, parseBoeBankRate(fx("boe-bank-rate.csv"), AT)!],
  calendar: { capturedAt: AT, events: parseBoeMpcDates(fx("boe-mpc-dates.html")) },
};
const notableAnswer = {
  jsonrpc: "2.0", id: 1,
  result: { structuredContent: {
    observations: [{ kind: "economic_change", title: "Bank of England Bank Rate rose 0.25 percentage points to 4.00%", detail: "For 2026-11-17.", rule: "Picked because it changed by at least 0.2 percentage points.", source: "Bank of England", asOf: AT }],
    quiet: ["No Fed, ECB, Bank of Canada or Bank of England rate decision in the next 7 days."],
  } },
};

describe("Today: what stands out, and the central banks' rates", () => {
  it("reads the connector's notable items, with each rule and source", () => {
    const r = readNotable(notableAnswer)!;
    expect(r.items).toEqual([expect.objectContaining({ kind: "economic_change", rule: expect.stringContaining("Picked because"), source: "Bank of England" })]);
    expect(r.quiet).toHaveLength(1);
    expect(readNotable({ jsonrpc: "2.0", id: 1, error: { code: -1, message: "x" } })).toBeNull();
  });

  it("lists the policy rates it has and the next decision of any bank", () => {
    const { rates, next } = ratesFrom(economy, NOW);
    expect(rates.map((r) => [r.bank, r.value])).toEqual([["European Central Bank (deposit rate)", 2.5], ["Bank of England (Bank Rate)", 4]]);
    expect(next).toMatchObject({ institution: "Bank of England", date: "2026-12-17", daysAway: 29 });
    // The last move and its day, not the change since the day before.
    expect(rates.map((r) => [r.change, r.movedOn])).toEqual([[0.25, "2026-09-16"], [0.25, "2026-11-05"]]);
  });

  it("loads both parts, and a part that fails is empty, never made up", async () => {
    const ok = await loadTodayBrief(async (_url, init) => new Response(JSON.stringify(init?.method === "POST" ? notableAnswer : economy), { status: 200 }), NOW);
    expect(ok.notable).toHaveLength(1);
    expect(ok.rates).toHaveLength(2);
    expect(ok.next?.institution).toBe("Bank of England");
    const down = await loadTodayBrief(async () => new Response("down", { status: 503 }), NOW);
    expect(down).toEqual({ notable: null, quiet: [], rates: [], next: null, economyAsOf: null });
  });

  it("the news list in the app shows each story once, even when several outlets carried it", () => {
    const n = (title: string, domain: string, seenAt: string) => ({ title, url: `https://${domain}/x`, domain, seenAt });
    const view = headlinesFrom({ schema: "atlas-explain-news-v1", generatedAt: AT, items: {
      "stock:US:NVDA": [n("Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit | News Radio 101.9", "a.iheart.com", "2026-11-18T01:10:00Z"), n("Nvidia Exceeds Q3 Expectations Amid CEO Huang Exit | PowerTalk 1460", "b.iheart.com", "2026-11-18T01:05:00Z")],
    } });
    expect(view.kind === "ready" ? view.items.map((i) => i.domain) : []).toEqual(["a.iheart.com"]);
  });
});

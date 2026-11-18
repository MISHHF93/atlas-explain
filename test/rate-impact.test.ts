import { describe, expect, it } from "vitest";
import { rateChangeImpact, type ImpactInput, type ImpactResult } from "../src/core/rate-impact";
import { handle, setFeatures } from "../src/mcp/server";

const run = (i: ImpactInput): ImpactResult => {
  const r = rateChangeImpact(i);
  if ("error" in r) throw new Error(r.error);
  return r;
};
const row = (r: ImpactResult, label: string) => r.rows.find((x) => x.label === label)!;

/** An independent schedule: pay the rounded payment monthly, interest rounded to the cent each month. */
function schedule(balance: number, monthlyRate: number, payment: number, months: number): number {
  let b = balance;
  for (let m = 0; m < months; m++) b = Math.round((b + Math.round(b * monthlyRate * 100) / 100 - payment) * 100) / 100;
  return b;
}

describe("rate_change_impact: arithmetic on the person's own numbers", () => {
  it("matches published reference mortgage payments to the cent", () => {
    // Canada, semi-annual compounding (the Interest Act convention), 25 years.
    expect(row(run({ product: "variable_mortgage", balance: 100_000, ratePct: 5, changePts: 0.25, country: "CA" }), "Monthly payment").before).toBe(581.6);
    expect(row(run({ product: "variable_mortgage", balance: 500_000, ratePct: 5, changePts: 0.25, country: "CA" }), "Monthly payment").before).toBe(2908.02);
    // US, monthly compounding, 30 years.
    expect(row(run({ product: "variable_mortgage", balance: 300_000, ratePct: 6, changePts: -0.25, country: "US", months: 360 }), "Monthly payment").before).toBe(1798.65);
    expect(row(run({ product: "variable_mortgage", balance: 200_000, ratePct: 4.5, changePts: -0.25, country: "US", months: 360 }), "Monthly payment").before).toBe(1013.37);
    expect(row(run({ product: "variable_mortgage", balance: 100_000, ratePct: 7, changePts: -0.25, country: "US", months: 360 }), "Monthly payment").before).toBe(665.3);
  });

  it("pays the loan off: an independent cent-rounded schedule ends within one payment of zero", () => {
    for (const [balance, rate, months, perYear, country] of [[100_000, 5, 300, 2, "CA"], [300_000, 6, 360, 12, "US"], [450_000, 4.75, 240, 2, "CA"]] as const) {
      const r = run({ product: "variable_mortgage", balance, ratePct: rate, changePts: 0.5, months, country });
      for (const [rt, pay] of [[rate, row(r, "Monthly payment").before], [rate + 0.5, row(r, "Monthly payment").after]] as const) {
        const i = Math.pow(1 + rt / 100 / perYear, perYear / 12) - 1;
        expect(Math.abs(schedule(balance, i, pay, months))).toBeLessThan(pay);
      }
    }
  });

  it("works out a quarter-point change on a Canadian variable mortgage, and the fixed-payment case", () => {
    const r = run({ product: "variable_mortgage", balance: 100_000, ratePct: 5, changePts: -0.25, country: "CA" });
    const p = row(r, "Monthly payment");
    expect(p.after).toBeLessThan(p.before);
    expect(p.change).toBe(Math.round((p.after - p.before) * 100) / 100);
    expect(row(r, "Interest in the first month").before).toBe(412.39);
    expect(r.lines[0]).toContain("$581.60 a month");
    expect(r.lines[1]).toContain("payment stays fixed");
    expect(r.follows).toContain("Bank of Canada");
    expect(r.assumptions[0]).toContain("twice a year");
  });

  it("works out HELOC interest, savings interest and a GIC or CD renewal", () => {
    const heloc = run({ product: "heloc", balance: 50_000, ratePct: 7.2, changePts: -0.25, country: "CA" });
    expect(row(heloc, "Interest a month")).toEqual({ label: "Interest a month", before: 300, after: 289.58, change: -10.42 });
    const save = run({ product: "savings", balance: 20_000, ratePct: 3, changePts: -0.25, country: "US" });
    expect(row(save, "Interest a year")).toEqual({ label: "Interest a year", before: 600, after: 550, change: -50 });
    expect(save.follows).toContain("Federal Reserve");
    const gic = run({ product: "gic_cd", balance: 10_000, ratePct: 4, changePts: -0.5, months: 24, country: "CA" });
    // 10,000 × (1.04² − 1) = 816.00; at 3.5%: 10,000 × (1.035² − 1) = 712.25.
    expect(row(gic, "Interest over 24 months")).toEqual({ label: "Interest over 24 months", before: 816, after: 712.25, change: -103.75 });
    expect(gic.lines[0]).toContain("GIC");
    const cd = run({ product: "gic_cd", balance: 10_000, ratePct: 4, changePts: 0.25, months: 6, country: "US" });
    expect(row(cd, "Interest over 6 months").before).toBe(200);
    expect(cd.lines[0]).toContain("CD");
  });

  it("names the central bank behind each product, by country", () => {
    expect(run({ product: "heloc", balance: 1000, ratePct: 7, changePts: 0.25, country: "US" }).follows).toContain("Federal Reserve");
    expect(run({ product: "variable_mortgage", balance: 100_000, ratePct: 6, changePts: 0.25, country: "US" }).follows).toContain("SOFR");
    expect(run({ product: "savings", balance: 1000, ratePct: 2, changePts: 0.25, country: "CA" }).follows).toContain("Bank of Canada");
  });

  it("asks for what's missing or out of range, and never predicts", () => {
    expect("error" in rateChangeImpact({ product: "variable_mortgage", balance: 0, ratePct: 5, changePts: 0.25 })).toBe(true);
    expect("error" in rateChangeImpact({ product: "savings", balance: 1000, ratePct: 40, changePts: 0.25 })).toBe(true);
    expect("error" in rateChangeImpact({ product: "savings", balance: 1000, ratePct: 3, changePts: 0 })).toBe(true);
    expect("error" in rateChangeImpact({ product: "car_loan" as never, balance: 1000, ratePct: 3, changePts: 0.25 })).toBe(true);
    // A cut larger than the rate floors at 0%.
    expect(run({ product: "savings", balance: 1000, ratePct: 0.25, changePts: -0.5 }).inputs.newRatePct).toBe(0);
    for (const p of ["variable_mortgage", "heloc", "savings", "gic_cd"] as const) {
      const t = run({ product: p, balance: 10_000, ratePct: 4, changePts: -0.25 }).lines.join(" ");
      expect(t).not.toMatch(/\b(buy|sell|you should|will (cut|raise|hold)|likely|expected to)\b/i);
      expect(t).toContain("doesn't say whether rates will change");
    }
  });
});

describe("rate_change_impact as a connector tool behind the V2_TOOLS flag", () => {
  const net = async () => new Response("{}", { status: 404 });
  const list = async () => ((await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }, net))!.result as { tools: { name: string; outputSchema?: unknown }[] }).tools;
  const call = (args: Record<string, unknown>) => handle({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "rate_change_impact", arguments: args } }, net);

  it("is off by default: not listed, and refused if called", async () => {
    setFeatures(undefined);
    expect((await list()).map((t) => t.name)).not.toContain("rate_change_impact");
    expect((await list()).length).toBe(18);
    expect((await call({ product: "savings", balance: 1000, rate_pct: 3, change_pts: -0.25 }))!.error?.code).toBe(-32602);
  });

  it("is listed and answers when the flag names it; unknown names are ignored", async () => {
    setFeatures(" rate_change_impact , not_a_tool");
    try {
      const tools = await list();
      expect(tools.map((t) => t.name)).toContain("rate_change_impact");
      expect(tools.find((t) => t.name === "rate_change_impact")!.outputSchema).toBeDefined();
      const r = (await call({ product: "variable_mortgage", balance: 100000, rate_pct: 5, change_pts: -0.25, country: "CA" }))!.result as { content: { text: string }[]; structuredContent: { rows: { before: number }[] } };
      expect(r.structuredContent.rows[0]!.before).toBe(581.6);
      expect(r.content[0]!.text).toContain("Bank of Canada");
      const noCountry = (await call({ product: "savings", balance: "20000", rate_pct: "3", change_pts: "-0.25" }))!.result as { content: { text: string }[] };
      expect(noCountry.content[0]!.text).toContain("Canada was assumed");
      const bad = (await call({ product: "savings", balance: -5, rate_pct: 3, change_pts: 1 }))!.result as { isError: boolean };
      expect(bad.isError).toBe(true);
    } finally {
      setFeatures(undefined);
    }
  });
});

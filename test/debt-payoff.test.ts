import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { debtPayoff, type PayoffPlan } from "../src/core/debt-payoff";
import { debtPayoffTool, handle, setFeatures, type Fetcher } from "../src/mcp/server";

const plans = (r: ReturnType<typeof debtPayoff>): PayoffPlan[] => {
  if ("error" in r) throw new Error(r.error);
  return r.plans;
};
const three = [
  { name: "Credit card", balance: 6000, ratePct: 22.99, minPayment: 180 },
  { name: "Car loan", balance: 9000, ratePct: 6.9, minPayment: 250 },
  { name: "Line of credit", balance: 2500, ratePct: 9.5, minPayment: 60 },
];

describe("paying off debts, month by month", () => {
  it("matches the standard loan formula for a single debt", () => {
    // $5,000 at 18% (1.5% a month) paying $200: n = −ln(1 − 0.015 × 5000 / 200) / ln(1.015) = 31.6, so 32 payments.
    const [p] = plans(debtPayoff({ budget: 200, method: "avalanche", debts: [{ name: "Card", balance: 5000, ratePct: 18, minPayment: 100 }] }));
    expect(p!.months).toBe(32);
    const n = -Math.log(1 - (0.015 * 5000) / 200) / Math.log(1.015);
    expect(p!.totalInterest).toBeCloseTo(200 * n - 5000, -1);
    expect(p!.points[0]).toEqual({ month: 0, balance: 5000 });
    expect(p!.points.at(-1)).toEqual({ month: 32, balance: 0 });
  });

  it("targets the highest rate first (avalanche) or the smallest balance first (snowball)", () => {
    const [a, s] = plans(debtPayoff({ budget: 800, debts: three }));
    expect(a!.method).toBe("avalanche");
    expect(a!.order.map((o) => o.name)).toEqual(["Credit card", "Line of credit", "Car loan"]);
    expect(s!.order.map((o) => o.name)).toEqual(["Line of credit", "Credit card", "Car loan"]);
    // The avalanche never costs more interest; the snowball clears a debt sooner.
    expect(a!.totalInterest).toBeLessThan(s!.totalInterest);
    expect(s!.order[0]!.month).toBeLessThan(a!.order[0]!.month);
    // Everything owed plus interest is what's paid.
    expect(a!.totalPaid).toBeCloseTo(17500 + a!.totalInterest, 1);
  });

  it("compares the two plainly, and never tells anyone which to choose", () => {
    const r = debtPayoff({ budget: 800, debts: three });
    if ("error" in r) throw new Error(r.error);
    const t = r.lines.join(" ");
    expect(t).toMatch(/The avalanche costs \$\d+ less in interest/);
    expect(t).toContain("doesn't say which to choose");
    expect(t).not.toMatch(/\b(you should|we recommend|best option|buy|sell)\b/i);
  });

  it("refuses what can't be worked out, and says why", () => {
    const err = (x: ReturnType<typeof debtPayoff>) => ("error" in x ? x.error : "");
    expect(err(debtPayoff({ budget: 100, debts: three }))).toContain("less than the minimum payments added up ($490)");
    expect(err(debtPayoff({ budget: 50, debts: [{ name: "Card", balance: 10000, ratePct: 24, minPayment: 50 }] }))).toContain("don't cover the interest");
    expect(err(debtPayoff({ budget: 800, debts: [] }))).toContain("between 1 and 10");
    expect(err(debtPayoff({ budget: 800, debts: [three[0]!, { ...three[1]!, name: "credit card" }] }))).toContain("different name");
    expect(err(debtPayoff({ budget: 800, debts: [{ ...three[0]!, ratePct: 150 }] }))).toContain("0% to 100%");
  });
});

describe("in the connector and the app", () => {
  afterEach(() => setFeatures(undefined));
  const none: Fetcher = async () => new Response("no", { status: 404 });

  it("is off until V2_TOOLS names it, and on in this deployment", async () => {
    setFeatures(undefined);
    const off = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "debt_payoff", arguments: { debts: [], monthly_budget: 1 } } }, none);
    expect(off?.error).toBeTruthy();
    expect(readFileSync("wrangler.toml", "utf8")).toMatch(/V2_TOOLS = "[^"]*debt_payoff/);
  });

  it("takes the connector's field names and answers with both plans", () => {
    const r = debtPayoffTool({ monthly_budget: 800, debts: three.map((d) => ({ name: d.name, balance: d.balance, rate_pct: d.ratePct, min_payment: d.minPayment })) });
    expect(r.isError).toBeFalsy();
    expect((r.structuredContent as { plans: unknown[] }).plans).toHaveLength(2);
    expect(r.content[0]!.text).toContain("Avalanche (highest rate first): debt-free in");
    expect(debtPayoffTool({ monthly_budget: 800, debts: "lots" }).isError).toBe(true);
  });

  it("has a card in the app's Tools section", () => {
    expect(readFileSync("src/wallet/tools-section.ts", "utf8")).toContain("slot.replaceChildren(rateCard(), inflationCard(), debtCard(), growthCard(), scamCard());");
  });
});

describe("chart views for the newer calculators (MCP Apps)", () => {
  it("links inflation_calculator and debt_payoff to their views, and serves both", async () => {
    const { V2_TOOLS, handle, setFeatures } = await import("../src/mcp/server");
    const { DEBT_APP_URI, INFLATION_APP_URI, DEBT_APP_HTML, INFLATION_APP_HTML } = await import("../src/mcp/calc-apps");
    const meta = (n: string) => (V2_TOOLS.find((t) => t.name === n) as { _meta?: { ui?: { resourceUri?: string } } })._meta?.ui?.resourceUri;
    expect(meta("inflation_calculator")).toBe(INFLATION_APP_URI);
    expect(meta("debt_payoff")).toBe(DEBT_APP_URI);
    setFeatures(undefined);
    const none: Fetcher = async () => new Response("no", { status: 404 });
    for (const [uri, html] of [[INFLATION_APP_URI, INFLATION_APP_HTML], [DEBT_APP_URI, DEBT_APP_HTML]] as const) {
      const r = await handle({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri } }, none);
      expect((r?.result as { contents: { text: string }[] }).contents[0]!.text).toBe(html);
      expect(html).toMatch(/never a forecast/);
    }
  });

  it("charts interest paid so far for debts (where the two methods differ), ending at each plan's exact total", async () => {
    const { DEBT_APP_HTML } = await import("../src/mcp/calc-apps");
    expect(DEBT_APP_HTML).toContain("i === last ? p.totalInterest : Math.max(0, d.budget * q.month - (start - q.balance))");
    expect(DEBT_APP_HTML).toContain("Interest paid so far, month by month, by method.");
  });
});

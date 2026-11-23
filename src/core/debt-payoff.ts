/**
 * Paying off several debts with one monthly budget: the avalanche method (extra money to the highest rate first)
 * and the snowball method (extra money to the smallest balance first), worked out month by month on the numbers
 * the person gives. Pure arithmetic: it shows what each method costs and how long it takes; it never says which
 * to choose, and it isn't advice about whether to borrow, consolidate or pay down debt at all.
 *
 * Each month, in this order: interest is added (yearly rate ÷ 12 on the balance), every debt gets its minimum
 * payment (or what's left of it), and the rest of the budget goes to the target debt, then the next. A paid-off
 * debt's minimum stays in the budget, so it rolls into the extra. Money is rounded to the cent each month.
 */

export interface Debt {
  name: string;
  balance: number;
  ratePct: number;
  minPayment: number;
}
export type PayoffMethod = "avalanche" | "snowball";

export interface PayoffPlan {
  method: PayoffMethod;
  months: number;
  totalInterest: number;
  totalPaid: number;
  /** When each debt is paid off, in the order it happens. */
  order: { name: string; month: number }[];
  /** Total still owed at the end of each month, for a chart (month 0 is the start). */
  points: { month: number; balance: number }[];
}

export interface PayoffResult {
  budget: number;
  debts: Debt[];
  plans: PayoffPlan[];
  lines: string[];
}

const MAX_MONTHS = 600;
const cents = (v: number) => Math.round(v * 100) / 100;
const money = (v: number) => `$${Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : v.toFixed(2)}`;
const span = (m: number) => {
  const y = Math.floor(m / 12);
  const r = m % 12;
  return [y ? `${y} year${y === 1 ? "" : "s"}` : "", r ? `${r} month${r === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ") || "0 months";
};

function simulate(debts: Debt[], budget: number, method: PayoffMethod): PayoffPlan | { error: string } {
  const bal = debts.map((d) => d.balance);
  const points: PayoffPlan["points"] = [{ month: 0, balance: cents(bal.reduce((a, b) => a + b, 0)) }];
  const order: PayoffPlan["order"] = [];
  let interest = 0;
  let paid = 0;
  for (let month = 1; month <= MAX_MONTHS; month++) {
    let left = budget;
    // Interest first.
    for (let i = 0; i < bal.length; i++) {
      if (bal[i]! <= 0) continue;
      const add = cents(bal[i]! * (debts[i]!.ratePct / 100 / 12));
      bal[i] = cents(bal[i]! + add);
      interest += add;
    }
    // Every minimum (or what's left of the debt).
    for (let i = 0; i < bal.length; i++) {
      if (bal[i]! <= 0) continue;
      const pay = Math.min(debts[i]!.minPayment, bal[i]!, left);
      bal[i] = cents(bal[i]! - pay);
      left = cents(left - pay);
      paid += pay;
    }
    // The rest to the target: highest rate (avalanche) or smallest balance (snowball), then the next.
    const targets = bal.map((_, i) => i).filter((i) => bal[i]! > 0).sort((a, b) =>
      method === "avalanche" ? debts[b]!.ratePct - debts[a]!.ratePct || bal[a]! - bal[b]! : bal[a]! - bal[b]! || debts[b]!.ratePct - debts[a]!.ratePct);
    for (const i of targets) {
      if (left <= 0) break;
      const pay = Math.min(left, bal[i]!);
      bal[i] = cents(bal[i]! - pay);
      left = cents(left - pay);
      paid += pay;
    }
    for (let i = 0; i < bal.length; i++) if (bal[i]! <= 0 && !order.some((o) => o.name === debts[i]!.name)) order.push({ name: debts[i]!.name, month });
    const total = cents(bal.reduce((a, b) => a + b, 0));
    points.push({ month, balance: total });
    if (total <= 0) return { method, months: month, totalInterest: cents(interest), totalPaid: cents(paid), order, points };
    if (month === 12 && total >= points[0]!.balance) return { error: "At this budget the debts aren't going down: the payments don't cover the interest. A larger monthly amount is needed." };
  }
  return { error: `At this budget the debts take longer than ${MAX_MONTHS / 12} years to pay off. A larger monthly amount is needed.` };
}

export function debtPayoff(input: { debts: Debt[]; budget: number; method?: PayoffMethod | "both" }): PayoffResult | { error: string } {
  const debts = input.debts.map((d, i) => ({ name: (d.name || `Debt ${i + 1}`).trim().slice(0, 40) || `Debt ${i + 1}`, balance: Number(d.balance), ratePct: Number(d.ratePct), minPayment: Number(d.minPayment) }));
  if (debts.length < 1 || debts.length > 10) return { error: "Give between 1 and 10 debts." };
  if (new Set(debts.map((d) => d.name.toLowerCase())).size !== debts.length) return { error: "Give each debt a different name." };
  for (const d of debts) {
    if (!(d.balance > 0) || d.balance > 1e8) return { error: `Give ${d.name} a balance above zero.` };
    if (!(d.ratePct >= 0) || d.ratePct > 100) return { error: `Give ${d.name} a yearly rate from 0% to 100%.` };
    if (!(d.minPayment >= 0)) return { error: `Give ${d.name} a minimum payment of zero or more.` };
  }
  const budget = Number(input.budget);
  const minimums = cents(debts.reduce((a, d) => a + d.minPayment, 0));
  if (!(budget > 0)) return { error: "Give the total you can pay each month." };
  if (budget < minimums) return { error: `The monthly total (${money(budget)}) is less than the minimum payments added up (${money(minimums)}).` };
  const methods: PayoffMethod[] = input.method === "avalanche" || input.method === "snowball" ? [input.method] : ["avalanche", "snowball"];
  const plans: PayoffPlan[] = [];
  for (const m of methods) {
    const p = simulate(debts, cents(budget), m);
    if ("error" in p) return p;
    plans.push(p);
  }
  const label = { avalanche: "Avalanche (highest rate first)", snowball: "Snowball (smallest balance first)" };
  const lines = plans.map((p) => `${label[p.method]}: debt-free in ${span(p.months)}, paying ${money(p.totalInterest)} in interest (${money(p.totalPaid)} in all). Paid off in this order: ${p.order.map((o) => `${o.name} (month ${o.month})`).join(", ")}.`);
  if (plans.length === 2) {
    const [a, s] = plans as [PayoffPlan, PayoffPlan];
    const saved = cents(s.totalInterest - a.totalInterest);
    const firstA = a.order[0]!;
    const firstS = s.order[0]!;
    lines.push(
      saved > 0.5
        ? `The avalanche costs ${money(saved)} less in interest${a.months < s.months ? ` and finishes ${a.months === s.months - 1 ? "a month" : `${s.months - a.months} months`} sooner` : ""}; the snowball clears its first debt in month ${firstS.month}${firstS.month < firstA.month ? `, ${firstA.month - firstS.month} months before the avalanche clears its first` : ""}, which some people find easier to stick with.`
        : "Here both methods cost about the same in interest.",
    );
  }
  lines.push(`Worked out month by month on the rates and payments given, with interest added monthly (the yearly rate ÷ 12). A lender's own figures can differ slightly; this compares methods and doesn't say which to choose.`);
  return { budget: cents(budget), debts, plans, lines };
}

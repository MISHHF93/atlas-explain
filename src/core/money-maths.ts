/**
 * Money maths for learning: compound growth, what fees cost over time, what inflation does to savings,
 * and how holding more things changes how much a mix swings. Pure arithmetic on the numbers the person
 * chooses: no market data, no forecast, no suggestion. The connector (money_maths) and its interactive
 * view run this same function, so the view's live recalculation always matches the answer.
 *
 * Self-contained on purpose (no imports, no outside names): the view embeds it with Function#toString.
 */

export type MoneyCalc = "compound_growth" | "fees" | "inflation" | "diversification";

export interface MoneyInput {
  calculation: MoneyCalc;
  /** Starting amount, in any currency. */
  amount?: number;
  /** Yearly return the person assumes, in percent. */
  ratePct?: number;
  years?: number;
  /** Added at the end of each month. */
  monthly?: number;
  /** Yearly fee, in percent of the balance. */
  feePct?: number;
  /** Yearly inflation the person assumes, in percent. */
  inflationPct?: number;
  /** For diversification: the most holdings to show, each swinging the same amount. */
  holdings?: number;
  /** For diversification: how much one holding swings in a year (standard deviation), in percent. */
  volatilityPct?: number;
  /** For diversification: how closely the holdings move together, from -1 to 1. */
  correlation?: number;
}

export interface MoneySeries {
  name: string;
  /** x is the year (or, for diversification, the number of holdings). */
  points: { x: number; y: number }[];
}

export interface MoneyResult {
  calculation: MoneyCalc;
  /** The inputs actually used, after limits. */
  inputs: Required<Pick<MoneyInput, "calculation">> & Record<string, number | string>;
  series: MoneySeries[];
  /** Plain-language results, one per line. */
  lines: string[];
  xLabel: string;
  yLabel: string;
}

export function moneyMaths(input: MoneyInput): MoneyResult | { error: string } {
  const clamp = (v: unknown, lo: number, hi: number, fallback: number | null): number | null => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return n == null ? null : Math.min(hi, Math.max(lo, n));
  };
  // Amounts are in the person's own currency; the dollar sign marks them as money, not a count.
  const money = (v: number) => `${v < 0 ? "−" : ""}$${Math.abs(v) >= 100 ? Math.round(Math.abs(v)).toLocaleString("en-US") : Math.abs(v).toFixed(2)}`;
  const pct = (v: number) => `${Number(v.toFixed(2))}%`;
  const calc = input.calculation;

  // Month-by-month balance at a yearly rate (compounded monthly), with additions at each month's end.
  const grow = (start: number, yearlyPct: number, years: number, monthly: number) => {
    const r = yearlyPct / 100 / 12;
    let bal = start;
    const pts = [{ x: 0, y: start }];
    for (let m = 1; m <= years * 12; m++) {
      bal = bal * (1 + r) + monthly;
      if (m % 12 === 0) pts.push({ x: m / 12, y: Math.round(bal * 100) / 100 });
    }
    return pts;
  };

  if (calc === "compound_growth" || calc === "fees") {
    // A rate outside the range is refused, not quietly capped: capping 3% a day to 30% a year gave a wrong answer.
    const asked = typeof input.ratePct === "number" && Number.isFinite(input.ratePct) ? input.ratePct : null;
    if (asked != null && (asked > 30 || asked < -20)) {
      return { error: `${pct(asked)} a year is outside what this works out (from -20% to 30% a year). No ordinary investment grows faster than about 30% a year, year after year; a promise of returns like that is a common sign of fraud.` };
    }
    const amount = clamp(input.amount, 0, 1e9, null);
    const rate = clamp(input.ratePct, -20, 30, null);
    const years = clamp(input.years, 1, 60, null);
    const monthly = clamp(input.monthly, 0, 1e7, 0)!;
    if (amount == null || rate == null || years == null) return { error: "Give a starting amount, a yearly rate in percent and a number of years." };
    const y = Math.round(years);
    const paidIn = amount + monthly * 12 * y;
    if (calc === "compound_growth") {
      const pts = grow(amount, rate, y, monthly);
      const end = pts[pts.length - 1]!.y;
      return {
        calculation: calc,
        inputs: { calculation: calc, amount, ratePct: rate, years: y, monthly },
        series: [{ name: "Balance", points: pts }, { name: "Paid in", points: pts.map((p) => ({ x: p.x, y: amount + monthly * 12 * p.x })) }],
        lines: [
          `Starting with ${money(amount)}${monthly ? ` and adding ${money(monthly)} a month` : ""} at ${pct(rate)} a year for ${y} years gives about ${money(end)}.`,
          `Of that, ${money(paidIn)} is what was paid in and ${money(end - paidIn)} is growth on growth (compounding).`,
          `The same rate every year is an assumption: real returns vary, can be negative, and are never guaranteed.`,
        ],
        xLabel: "Years",
        yLabel: "Balance",
      };
    }
    const fee = clamp(input.feePct, 0, 10, null);
    if (fee == null) return { error: "Give the yearly fee in percent, for example 1." };
    const without = grow(amount, rate, y, monthly);
    const withFee = grow(amount, rate - fee, y, monthly);
    const a = without[without.length - 1]!.y;
    const b = withFee[withFee.length - 1]!.y;
    return {
      calculation: calc,
      inputs: { calculation: calc, amount, ratePct: rate, years: y, monthly, feePct: fee },
      series: [{ name: "Without the fee", points: without }, { name: `With a ${pct(fee)} yearly fee`, points: withFee }],
      lines: [
        `After ${y} years: about ${money(a)} without the fee and ${money(b)} with a ${pct(fee)} yearly fee.`,
        `The fee costs about ${money(a - b)}, or ${a > 0 ? pct(((a - b) / a) * 100) : "0%"} of the final balance, because each year's fee also stops that money from growing.`,
        `Same assumed return in both lines; only the fee differs. Real returns vary and are never guaranteed.`,
      ],
      xLabel: "Years",
      yLabel: "Balance",
    };
  }

  if (calc === "inflation") {
    const amount = clamp(input.amount, 0, 1e9, null);
    const infl = clamp(input.inflationPct, -5, 50, null);
    const years = clamp(input.years, 1, 60, null);
    if (amount == null || infl == null || years == null) return { error: "Give an amount, a yearly inflation rate in percent and a number of years." };
    const y = Math.round(years);
    const pts = Array.from({ length: y + 1 }, (_, t) => ({ x: t, y: Math.round((amount / Math.pow(1 + infl / 100, t)) * 100) / 100 }));
    const need = amount * Math.pow(1 + infl / 100, y);
    const end = pts[pts.length - 1]!.y;
    return {
      calculation: calc,
      inputs: { calculation: calc, amount, inflationPct: infl, years: y },
      series: [{ name: "What it buys, in today's money", points: pts }],
      lines: [
        `At ${pct(infl)} inflation a year, ${money(amount)} kept as cash for ${y} years buys about what ${money(end)} buys today: ${amount > 0 ? pct((1 - end / amount) * 100) : "0%"} less.`,
        `To pay for the same things after ${y} years you would need about ${money(need)}.`,
        `Inflation is rarely the same every year; this uses one steady rate to show the idea.`,
      ],
      xLabel: "Years",
      yLabel: "Buying power",
    };
  }

  if (calc === "diversification") {
    const n = Math.round(clamp(input.holdings, 2, 100, 20)!);
    const vol = clamp(input.volatilityPct, 1, 150, null);
    const rho = clamp(input.correlation, -1, 1, null);
    if (vol == null || rho == null) return { error: "Give how much one holding swings in a year (in percent) and how closely the holdings move together (-1 to 1)." };
    // Equal weights, the same swing for each, the same correlation between every pair.
    const swing = (k: number) => vol * Math.sqrt(Math.max(0, 1 / k + (1 - 1 / k) * rho));
    const pts = Array.from({ length: n }, (_, i) => ({ x: i + 1, y: Math.round(swing(i + 1) * 100) / 100 }));
    const floor = vol * Math.sqrt(Math.max(0, rho));
    return {
      calculation: calc,
      inputs: { calculation: calc, holdings: n, volatilityPct: vol, correlation: rho },
      series: [{ name: "How much the mix swings", points: pts }],
      lines: [
        `One holding that swings about ${pct(vol)} a year; ${n} of them in equal parts swing about ${pct(swing(n))} together, when each pair moves with a correlation of ${rho}.`,
        rho > 0
          ? `Adding more helps less and less: however many you hold, the swing can't fall below about ${pct(floor)}, because the holdings tend to move together.`
          : `With holdings that don't move together, the swing keeps falling as more are added.`,
        `This is a textbook model (same swing and correlation for every holding); real holdings differ, and correlations change, often rising in a crash.`,
      ],
      xLabel: "Number of holdings",
      yLabel: "Yearly swing (%)",
    };
  }
  return { error: "Choose compound_growth, fees, inflation or diversification." };
}

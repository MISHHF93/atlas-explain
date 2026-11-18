/**
 * What a change in interest rates would do to someone's own numbers (docs/V2_DESIGN.md, rate_change_impact).
 * Pure arithmetic on the numbers given: it never says whether a change will happen. Self-contained (no
 * imports, no outside references) because the widget runs this same function from its source text.
 *
 * Mortgage payments use the standard formula P = B·i / (1 − (1+i)^−n), with i the monthly rate equivalent to
 * the stated rate under its compounding: semi-annual by default in Canada (lenders state rates that way under
 * the Interest Act), monthly in the US. Money is rounded to the cent, as lenders' schedules are.
 */

export type ImpactProduct = "variable_mortgage" | "heloc" | "savings" | "gic_cd";
export type ImpactCountry = "CA" | "US";

export interface ImpactInput {
  product: ImpactProduct;
  /** Amount owed (mortgage, HELOC) or held (savings, GIC/CD). */
  balance: number;
  /** The rate today, in percent a year. */
  ratePct: number;
  /** The change to work out, in percentage points (−0.25 for a quarter-point cut). */
  changePts: number;
  /** Mortgage: months left to pay it off (default 300). GIC/CD: the term (default 12). */
  months?: number;
  country?: ImpactCountry;
  /** Mortgage only; defaults by country. */
  compounding?: "semi-annual" | "monthly";
}

export interface ImpactRow {
  label: string;
  before: number;
  after: number;
  change: number;
}

export interface ImpactResult {
  product: ImpactProduct;
  country: ImpactCountry;
  inputs: { balance: number; ratePct: number; changePts: number; newRatePct: number; months: number | null; compounding: string | null };
  rows: ImpactRow[];
  /** Plain-language results, one per line. */
  lines: string[];
  /** Which rate this product usually follows, for the country given. */
  follows: string;
  /** What the arithmetic assumed. */
  assumptions: string[];
}

export function rateChangeImpact(input: ImpactInput): ImpactResult | { error: string } {
  const cents = (v: number) => Math.round(v * 100) / 100;
  const money = (v: number) => "$" + cents(Math.abs(v)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const signed = (v: number) => (v > 0 ? "+" : v < 0 ? "-" : "") + money(v);
  const pts = (v: number) => (v > 0 ? "+" : "") + Number(v.toFixed(3)) + " pt";
  const pct = (v: number) => Number(v.toFixed(3)) + "%";
  const ok = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;

  const product = input.product;
  if (!["variable_mortgage", "heloc", "savings", "gic_cd"].includes(product)) return { error: "Choose a product: variable_mortgage, heloc, savings or gic_cd." };
  if (!ok(input.balance, 1, 1e8)) return { error: "Give the balance in dollars, from $1 to $100,000,000." };
  if (!ok(input.ratePct, 0, 30)) return { error: "Give today's rate in percent a year, from 0% to 30%." };
  if (!ok(input.changePts, -10, 10) || input.changePts === 0) return { error: "Give the change in percentage points, for example -0.25 for a quarter-point cut or 0.5 for a half-point rise (from -10 to 10, not 0)." };
  const country: ImpactCountry = input.country === "US" ? "US" : "CA";
  const balance = cents(input.balance);
  const rate = input.ratePct;
  const newRate = Math.max(0, rate + input.changePts);
  const isMortgage = product === "variable_mortgage";
  const defaultMonths = isMortgage ? 300 : product === "gic_cd" ? 12 : null;
  const months = defaultMonths == null ? null : ok(input.months, 1, 480) ? Math.round(input.months) : defaultMonths;
  if (isMortgage && input.months != null && !ok(input.months, 1, 480)) return { error: "Give the months left on the mortgage, from 1 to 480." };

  const FOLLOWS: Record<ImpactCountry, Record<ImpactProduct, string>> = {
    CA: {
      variable_mortgage: "Variable-rate mortgages in Canada move with the lender's prime rate, which follows the Bank of Canada's policy rate, usually by the same amount within a day or two of a decision.",
      heloc: "HELOCs in Canada are priced from the lender's prime rate, which follows the Bank of Canada's policy rate.",
      savings: "Savings rates are set by each bank or credit union. They usually move in the same direction as the Bank of Canada's policy rate, but not always by the same amount or at once.",
      gic_cd: "GIC rates are set by each institution and follow bond yields more than the policy rate. A GIC keeps its rate until it matures; the change applies only at renewal.",
    },
    US: {
      variable_mortgage: "Adjustable-rate mortgages in the US usually reset on a schedule from an index such as SOFR plus a margin, within caps, not right after a Fed decision. Ask your lender which index and dates apply.",
      heloc: "HELOCs in the US are usually priced from the prime rate, which moves with the top of the Federal Reserve's target range.",
      savings: "Savings rates are set by each bank or credit union. They usually move in the same direction as the Federal Reserve's rate, but not always by the same amount or at once.",
      gic_cd: "CD rates are set by each institution and follow Treasury yields more than the Fed's rate. A CD keeps its rate until it matures; the change applies only at renewal.",
    },
  };
  const assumptions: string[] = [];
  const rows: ImpactRow[] = [];
  const lines: string[] = [];
  const row = (label: string, before: number, after: number) => rows.push({ label, before: cents(before), after: cents(after), change: cents(cents(after) - cents(before)) });
  let compounding: string | null = null;

  if (isMortgage) {
    compounding = input.compounding ?? (country === "CA" ? "semi-annual" : "monthly");
    const perYear = compounding === "semi-annual" ? 2 : 12;
    const monthlyRate = (r: number) => Math.pow(1 + r / 100 / perYear, perYear / 12) - 1;
    const payment = (r: number) => {
      const i = monthlyRate(r);
      return cents(i === 0 ? balance / months! : (balance * i) / (1 - Math.pow(1 + i, -months!)));
    };
    const firstInterest = (r: number) => cents(balance * monthlyRate(r));
    const before = payment(rate), after = payment(newRate);
    row("Monthly payment", before, after);
    row("Interest in the first month", firstInterest(rate), firstInterest(newRate));
    row("Payments over a year", before * 12, after * 12);
    const d = cents(after - before);
    lines.push(`At ${pct(rate)}, a ${money(balance)} mortgage paid off over ${months} months costs ${money(before)} a month. At ${pct(newRate)} (${pts(input.changePts)}) it would be ${money(after)}: ${signed(d)} a month, ${signed(d * 12)} a year.`);
    lines.push(`If your payment stays fixed while the rate moves (common with Canadian variable mortgages), the payment doesn't change; instead about ${money(Math.abs(cents(firstInterest(newRate) - firstInterest(rate))))} a month ${input.changePts > 0 ? "more" : "less"} goes to interest, and the rest to paying down the balance.`);
    assumptions.push(`Interest compounded ${compounding === "semi-annual" ? "twice a year" : "monthly"}${country === "CA" && !input.compounding ? " (how Canadian lenders state mortgage rates)" : ""}, paid monthly, rounded to the cent.`);
    assumptions.push(`The rate stays at ${pct(newRate)} for the rest of the ${months} months.`);
  } else if (product === "heloc") {
    const interest = (r: number) => cents((balance * r) / 100 / 12);
    row("Interest a month", interest(rate), interest(newRate));
    row("Interest a year", interest(rate) * 12, interest(newRate) * 12);
    const d = cents(interest(newRate) - interest(rate));
    lines.push(`On a ${money(balance)} HELOC balance at ${pct(rate)}, interest is about ${money(interest(rate))} a month. At ${pct(newRate)} (${pts(input.changePts)}) it would be about ${money(interest(newRate))}: ${signed(d)} a month, ${signed(d * 12)} a year.`);
    assumptions.push("Interest-only, worked out as balance × rate ÷ 12; lenders usually charge daily, so each month differs by a few cents.");
  } else if (product === "savings") {
    const yearly = (r: number) => cents((balance * r) / 100);
    row("Interest a year", yearly(rate), yearly(newRate));
    row("Interest a month", yearly(rate) / 12, yearly(newRate) / 12);
    const d = cents(yearly(newRate) - yearly(rate));
    lines.push(`On ${money(balance)} in savings at ${pct(rate)}, interest is about ${money(yearly(rate))} a year. At ${pct(newRate)} (${pts(input.changePts)}) it would be about ${money(yearly(newRate))}: ${signed(d)} a year.`);
    assumptions.push("Simple yearly interest on a steady balance; accounts that pay interest monthly earn slightly more. Interest is taxable in many cases.");
  } else {
    const earned = (r: number) => cents(months! >= 12 ? balance * (Math.pow(1 + r / 100, months! / 12) - 1) : (balance * r * months!) / 1200);
    row(`Interest over ${months} months`, earned(rate), earned(newRate));
    const d = cents(earned(newRate) - earned(rate));
    const kind = country === "CA" ? "GIC" : "CD";
    lines.push(`Renewing a ${money(balance)} ${kind} for ${months} months at ${pct(rate)} earns about ${money(earned(rate))}. At ${pct(newRate)} (${pts(input.changePts)}) it would earn about ${money(earned(newRate))}: ${signed(d)} over the term.`);
    assumptions.push(months! >= 12 ? "Interest compounded yearly and paid at maturity." : "Simple interest for a term under a year, paid at maturity.");
  }
  lines.push("This works out your numbers under the change you gave. It doesn't say whether rates will change; that's for each central bank and lender to decide.");
  return {
    product,
    country,
    inputs: { balance, ratePct: rate, changePts: input.changePts, newRatePct: Number(newRate.toFixed(4)), months, compounding },
    rows,
    lines,
    follows: FOLLOWS[country][product],
    assumptions,
  };
}

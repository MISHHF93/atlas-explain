/**
 * The Tools section of the web app: the connector's rate_change_impact, money_maths and scam_red_flags, run in
 * the browser on the numbers and text the person types, debt_payoff, and inflation_calculator on official yearly price indexes. Nothing is sent anywhere. Arithmetic and warning signs
 * only: never a forecast or a recommendation.
 */
import { debtPayoff } from "../core/debt-payoff";
import { coverage, inflationCalculator, type PriceCountry } from "../core/inflation";
import { moneyMaths } from "../core/money-maths";
import { rateChangeImpact, type ImpactProduct } from "../core/rate-impact";
import { CHECKS, matchRedFlags, REPORT } from "../core/red-flags";
import { el } from "./dom";

function card(id: string, title: string, intro: string): HTMLElement {
  const c = el("section", "card econ-card");
  c.setAttribute("aria-labelledby", id);
  const h = el("h2", "card-title", title);
  h.id = id;
  c.append(h, el("p", "fine", intro));
  return c;
}
function field(label: string, input: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): HTMLElement {
  const l = el("label", "tool-field");
  l.append(el("span", undefined, label), input);
  return l;
}
function num(value: string, step = "any"): HTMLInputElement {
  const i = el("input") as HTMLInputElement;
  i.type = "number";
  i.inputMode = "decimal";
  i.step = step;
  i.value = value;
  return i;
}
function select(options: [string, string][]): HTMLSelectElement {
  const s = el("select") as HTMLSelectElement;
  for (const [v, t] of options) s.append(Object.assign(el("option", undefined, t), { value: v }));
  return s;
}
const out = () => {
  const o = el("div", "tool-out");
  o.setAttribute("aria-live", "polite");
  return o;
};
const lines = (o: HTMLElement, ls: string[]) => o.replaceChildren(...ls.map((l) => el("p", undefined, l)));

function rateCard(): HTMLElement {
  const c = card("tool-rate", "What a rate change would do to my numbers", "Your mortgage payment, HELOC interest, savings interest or GIC/CD renewal, to the cent. It doesn't say whether rates will change.");
  const country = select([["CA", "Canada"], ["US", "United States"]]);
  const product = select([["variable_mortgage", "Variable-rate mortgage"], ["heloc", "HELOC"], ["savings", "Savings account"], ["gic_cd", "GIC or CD at renewal"]]);
  const balance = num("400000"), rate = num("4.95", "0.01"), change = num("-0.25", "0.05"), months = num("300", "1");
  const o = out();
  const run = () => {
    const r = rateChangeImpact({ product: product.value as ImpactProduct, country: country.value as "CA" | "US", balance: Number(balance.value), ratePct: Number(rate.value), changePts: Number(change.value), months: product.value === "variable_mortgage" || product.value === "gic_cd" ? Number(months.value) : undefined });
    if ("error" in r) return lines(o, [r.error]);
    lines(o, [...r.lines, r.follows]);
  };
  for (const i of [country, product, balance, rate, change, months]) i.addEventListener("input", run);
  const form = el("div", "tool-grid");
  form.append(field("Where", country), field("What", product), field("Balance ($)", balance), field("Rate today (%)", rate), field("Change (points)", change), field("Months (mortgage left, or GIC/CD term)", months));
  c.append(form, o);
  run();
  return c;
}

function inflationCard(): HTMLElement {
  const c = card("tool-inflation", "What money from one year buys in another", "From each country's official consumer price index, as yearly averages: the US from 1913, Canada from 1914, the UK from 1988 and the euro area from 1997. It describes the past and is not a forecast.");
  const country = select([["US", "United States"], ["CA", "Canada"], ["UK", "United Kingdom"], ["EA", "Euro area"]]);
  const latest = coverage("US").to;
  const amount = num("1000"), from = num("1990", "1"), to = num(String(latest), "1");
  const o = out();
  const run = () => {
    const r = inflationCalculator({ country: country.value as PriceCountry, amount: Number(amount.value), fromYear: Number(from.value), toYear: Number(to.value) });
    if ("error" in r) return lines(o, [r.error]);
    const src = el("p", "fine");
    const a = el("a", undefined, r.source.name) as HTMLAnchorElement;
    a.href = r.source.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    src.append("Source: ", a, `. ${r.source.series}.`);
    o.replaceChildren(...r.lines.slice(0, 3).map((l) => el("p", undefined, l)), src);
  };
  // Each country's index starts in a different year: keep the years inside it.
  country.addEventListener("input", () => {
    const span = coverage(country.value as PriceCountry);
    for (const i of [from, to]) {
      i.min = String(span.from);
      i.max = String(span.to);
    }
    if (Number(from.value) < span.from) from.value = String(span.from);
    run();
  });
  for (const i of [amount, from, to]) i.addEventListener("input", run);
  for (const i of [from, to]) {
    i.min = "1913";
    i.max = String(latest);
  }
  const form = el("div", "tool-grid");
  form.append(field("Where", country), field("Amount", amount), field("From the year", from), field("To the year", to));
  c.append(form, o);
  run();
  return c;
}

function debtCard(): HTMLElement {
  const c = card("tool-debt", "Paying off several debts", "Highest rate first (avalanche) or smallest balance first (snowball): how long each takes and the interest each costs. It compares; it doesn't say which to choose. Leave a row's balance empty to skip it.");
  const rows: { name: HTMLInputElement; balance: HTMLInputElement; rate: HTMLInputElement; min: HTMLInputElement }[] = [];
  const text = (value: string) => {
    const i = el("input") as HTMLInputElement;
    i.type = "text";
    i.value = value;
    i.maxLength = 40;
    return i;
  };
  const starts: [string, string, string, string][] = [["Credit card", "6000", "22.99", "180"], ["Car loan", "9000", "6.9", "250"], ["Line of credit", "2500", "9.5", "60"]];
  const grid = el("div", "tool-grid");
  for (const [n, b, r, m] of starts) {
    const row = { name: text(n), balance: num(b), rate: num(r, "0.01"), min: num(m) };
    rows.push(row);
    grid.append(field("Debt", row.name), field("Owed ($)", row.balance), field("Rate (%)", row.rate), field("Minimum a month ($)", row.min));
  }
  const budget = num("800");
  grid.append(field("Total each month ($)", budget));
  const o = out();
  const run = () => {
    const debts = rows.filter((r) => r.balance.value.trim() !== "" && Number(r.balance.value) > 0).map((r) => ({ name: r.name.value, balance: Number(r.balance.value), ratePct: Number(r.rate.value), minPayment: Number(r.min.value) }));
    const res = debtPayoff({ debts, budget: Number(budget.value) });
    lines(o, "error" in res ? [res.error] : res.lines.slice(0, -1));
  };
  for (const r of rows) for (const i of [r.name, r.balance, r.rate, r.min]) i.addEventListener("input", run);
  budget.addEventListener("input", run);
  c.append(grid, o);
  run();
  return c;
}

function growthCard(): HTMLElement {
  const c = card("tool-growth", "Money maths: growth and fees", "What a starting amount and monthly savings could grow to at a rate you choose, and what a yearly fee takes. An assumption, never a forecast.");
  const amount = num("5000"), monthly = num("200"), rate = num("6", "0.1"), fee = num("1", "0.05"), years = num("20", "1");
  const o = out();
  const run = () => {
    const base = { amount: Number(amount.value), monthly: Number(monthly.value), ratePct: Number(rate.value), years: Number(years.value) };
    const g = moneyMaths({ calculation: "compound_growth", ...base });
    const f = moneyMaths({ calculation: "fees", ...base, feePct: Number(fee.value) });
    lines(o, [...("error" in g ? [g.error] : g.lines.slice(0, 2)), ...("error" in f ? [] : f.lines.slice(0, 2))]);
  };
  for (const i of [amount, monthly, rate, fee, years]) i.addEventListener("input", run);
  const form = el("div", "tool-grid");
  form.append(field("Starting amount ($)", amount), field("Added each month ($)", monthly), field("Yearly return (%)", rate), field("Yearly fee (%)", fee), field("Years", years));
  c.append(form, o);
  run();
  return c;
}

function scamCard(): HTMLElement {
  const c = card("tool-scam", "Does this offer show warning signs?", "Paste a message or pitch. It's checked here, in your browser, against the warning signs regulators list. Nothing is sent or kept.");
  const text = el("textarea", "tool-text") as HTMLTextAreaElement;
  text.rows = 4;
  text.placeholder = "For example: “My new friend's platform pays 3% a day, guaranteed. Start with $500 in USDT.”";
  const o = out();
  const run = () => {
    const flags = text.value.trim() ? matchRedFlags(text.value) : [];
    if (!text.value.trim()) return o.replaceChildren();
    const nodes: HTMLElement[] = [el("p", undefined, flags.length ? `${flags.length} warning sign${flags.length === 1 ? "" : "s"} found:` : "None of the listed warning signs were found. That doesn't make an offer safe: check who is selling it.")];
    for (const f of flags) {
      const p = el("p");
      p.append(el("strong", undefined, `${f.title}. `), f.why);
      nodes.push(p);
    }
    const links = el("p", "fine");
    links.append("Check who's selling: ");
    CHECKS.forEach((x, i) => {
      const a = el("a", undefined, x.name) as HTMLAnchorElement;
      a.href = x.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      links.append(...(i ? ["; ", a] : [a]));
    });
    links.append(". Report: ");
    REPORT.forEach((x, i) => {
      const a = el("a", undefined, x.name) as HTMLAnchorElement;
      a.href = x.url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      links.append(...(i ? ["; ", a] : [a]));
    });
    nodes.push(links);
    o.replaceChildren(...nodes);
  };
  text.addEventListener("input", run);
  c.append(field("Message or offer", text), o);
  return c;
}

/** Fills the Tools section. Everything runs in the browser. */
export function mountTools(slot: HTMLElement): void {
  slot.replaceChildren(rateCard(), inflationCard(), debtCard(), growthCard(), scamCard());
}

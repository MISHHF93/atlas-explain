/**
 * The embeddable rate-change calculator (embed/rate-impact.html, docs/V2_DESIGN.md phase 1). Runs the same
 * pure function as the connector's rate_change_impact tool, in the page: nothing is sent anywhere. Query
 * parameters prefill it: ?country=US&product=savings&balance=20000&rate=3&change=-0.25&months=12.
 */
import { rateChangeImpact, type ImpactCountry, type ImpactProduct } from "../core/rate-impact";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const country = $<HTMLSelectElement>("country"), product = $<HTMLSelectElement>("product");
const balance = $<HTMLInputElement>("balance"), rate = $<HTMLInputElement>("rate"), months = $<HTMLInputElement>("months"), change = $<HTMLInputElement>("change");
const out = $<HTMLDivElement>("out");

const DEFAULT_MONTHS: Record<string, string> = { variable_mortgage: "300", gic_cd: "12" };
const fmt = (v: number) => "$" + v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const el = (tag: string, text?: string, cls?: string) => Object.assign(document.createElement(tag), text == null ? {} : { textContent: text }, cls ? { className: cls } : {});

function monthsField(): void {
  const p = product.value;
  $("months-label").hidden = !(p in DEFAULT_MONTHS);
  $("months-label").firstChild!.textContent = p === "gic_cd" ? "Term (months)" : "Months left";
}

function render(): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>("[data-step]")) b.setAttribute("aria-pressed", String(Number(b.dataset.step) === Number(change.value)));
  const r = rateChangeImpact({
    product: product.value as ImpactProduct,
    country: country.value as ImpactCountry,
    balance: Number(balance.value), ratePct: Number(rate.value), changePts: Number(change.value),
    months: product.value in DEFAULT_MONTHS ? Number(months.value) : undefined,
  });
  if ("error" in r) {
    out.replaceChildren(el("p", r.error, "err"));
    return;
  }
  const table = el("table");
  const head = el("tr");
  for (const h of ["", "Now", "After the change", "Difference"]) head.append(Object.assign(el("th", h), { scope: "col" }));
  table.append(head);
  for (const row of r.rows) {
    const tr = el("tr");
    tr.append(el("td", row.label), el("td", fmt(row.before)), el("td", fmt(row.after)), el("td", (row.change > 0 ? "+" : row.change < 0 ? "-" : "") + fmt(Math.abs(row.change))));
    table.append(tr);
  }
  const lines = el("div", undefined, "lines");
  for (const l of r.lines) lines.append(el("p", l));
  out.replaceChildren(table, lines, el("p", r.follows, "note"), el("p", "Assumed: " + r.assumptions.join(" "), "note"));
}

// Prefill from the query string, within the form's own limits.
const q = new URLSearchParams(location.search);
if (q.get("country") === "US" || q.get("country") === "CA") country.value = q.get("country")!;
if (q.get("product") && [...product.options].some((o) => o.value === q.get("product"))) product.value = q.get("product")!;
for (const [key, input] of [["balance", balance], ["rate", rate], ["change", change], ["months", months]] as const) {
  const v = q.get(key);
  if (v != null && v.trim() !== "" && Number.isFinite(Number(v))) input.value = v;
}
if (!q.get("months") && product.value in DEFAULT_MONTHS) months.value = DEFAULT_MONTHS[product.value]!;

product.addEventListener("change", () => {
  if (product.value in DEFAULT_MONTHS) months.value = DEFAULT_MONTHS[product.value]!;
  monthsField();
  render();
});
for (const input of [country, balance, rate, months, change]) input.addEventListener("input", render);
for (const b of document.querySelectorAll<HTMLButtonElement>("[data-step]")) b.addEventListener("click", () => { change.value = b.dataset.step!; render(); });
$("form").addEventListener("submit", (e) => e.preventDefault());
monthsField();
render();

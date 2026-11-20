/**
 * The Economy section of the web app: what the connector serves as economy_snapshot, decision_explainer,
 * speech_tracker, treasury_auctions, compare_countries and data_series, read from the same public data files.
 * Every figure names its source and date; anything missing says so. Describes what happened, never a forecast.
 */
import { DOCS_DATA_URL, ECONOMY_DATA_URL, WORLD_DATA_URL } from "../core/links";
import { BANK_NAME, compareStatements, readDocsFile, type DocBank, type DocsFile } from "../data/docs";
import { readEconomyFile, type EconomyFile } from "../data/economy";
import { readWorldFile, WORLD_COUNTRIES, WORLD_INDICATORS, type WorldFile } from "../data/world";
import { el } from "./dom";

const getJson = (url: string): Promise<unknown> => fetch(url).then((r) => (r.ok ? r.json() : null)).catch(() => null);
const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const big = (v: number) => (Math.abs(v) >= 1e12 ? `$${(v / 1e12).toFixed(2)} trillion` : `$${(v / 1e9).toFixed(1)} billion`);
const signed = (v: number, unit: string) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}${unit}`;

function card(id: string, title: string, intro: string): HTMLElement {
  const c = el("section", "card econ-card");
  c.setAttribute("aria-labelledby", id);
  const h = el("h2", "card-title", title);
  h.id = id;
  c.append(h, el("p", "fine", intro));
  return c;
}
const missing = (c: HTMLElement, what: string) => c.append(el("p", "fine", `${what} couldn't be loaded right now. Nothing is shown in its place.`));
const source = (text: string, href: string) => {
  const p = el("p", "fine econ-source");
  const a = el("a", undefined, text) as HTMLAnchorElement;
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  p.append("Source: ", a);
  return p;
};

function indicatorsCard(file: EconomyFile | null, onExplain: (t: string) => void): HTMLElement {
  const c = card("econ-indicators", "The economy in figures", "Inflation, jobs, policy rates and US debt, each from the agency that publishes it.");
  if (!file) return (missing(c, "The figures"), c);
  const list = el("ul", "notable-list");
  for (const i of file.indicators) {
    const li = el("li", "notable-row");
    const text = el("div", "notable-text");
    const value = i.unit === "USD" ? big(i.value) : `${i.value.toFixed(2)}%`;
    const change = i.change == null ? "" : `, ${signed(i.change, i.unit === "USD" ? "%" : " pt")} ${i.changeWindow}`;
    text.append(el("p", "notable-title", `${i.name}: ${value}`), el("p", "fine", `For ${i.period}${change}.${i.note ? ` ${i.note}` : ""}`), source(i.source, i.sourceUrl));
    const ask = el("button", "secondary small", "Explain") as HTMLButtonElement;
    ask.type = "button";
    ask.addEventListener("click", () => onExplain(`${i.name} is ${value} for ${i.period}${change}. What does that mean?`));
    li.append(text, ask);
    list.append(li);
  }
  c.append(list);
  return c;
}

function banksCard(docs: DocsFile | null, onExplain: (t: string) => void): HTMLElement {
  const c = card("econ-banks", "Central banks: latest decisions", "Read from each bank's own statement, with how its wording changed since the decision before.");
  if (!docs) return (missing(c, "The statements"), c);
  const list = el("ul", "notable-list");
  for (const bank of ["fed", "boc", "ecb", "boe"] as DocBank[]) {
    const [cur, prev] = docs.statements[bank];
    if (!cur?.decision) continue;
    const d = cur.decision;
    const level = d.range ? `${d.range.replace(" to ", "% to ")}%` : `${d.rate}%`;
    const what = d.action === "hold" ? `held at ${level}` : `${d.action === "raise" ? "raised" : "lowered"}${d.bp ? ` by ${d.bp} basis points` : ""} to ${level}`;
    const li = el("li", "notable-row");
    const text = el("div", "notable-text");
    text.append(el("span", "notable-kind", BANK_NAME[bank]), el("p", "notable-title", `${day(cur.date)}: ${what}`));
    if (prev) {
      const cmp = compareStatements(prev.paragraphs, cur.paragraphs);
      text.append(el("p", "fine", cmp.mode === "words" ? `${cmp.changes.length} wording changes since ${day(prev.date)}.` : `Mostly rewritten since ${day(prev.date)} (about ${Math.round(cmp.changedShare * 100)}% of the words).`));
    }
    text.append(source(cur.title, cur.url));
    const ask = el("button", "secondary small", "Explain") as HTMLButtonElement;
    ask.type = "button";
    ask.addEventListener("click", () => onExplain(`The ${BANK_NAME[bank]} ${what} on ${day(cur.date)}. What does that mean for borrowers and savers?`));
    li.append(text, ask);
    list.append(li);
  }
  c.append(list.childElementCount ? list : el("p", "fine", "No decision statements are stored yet."));
  return c;
}

function speechesCard(docs: DocsFile | null): HTMLElement {
  const c = card("econ-speeches", "What central bankers have been saying", "Recent speeches, with each bank's own one-line description. Nothing is added or interpreted.");
  if (!docs) return (missing(c, "The speeches"), c);
  const all = (["fed", "boc", "ecb", "boe"] as DocBank[]).flatMap((b) => docs.speeches[b].map((s) => ({ ...s, bank: b }))).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const list = el("ul", "coming-list");
  for (const s of all) {
    const li = el("li", "coming-row");
    const a = el("a", "coming-title", s.title) as HTMLAnchorElement;
    a.href = s.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    // Banks list scheduled appearances in the same feed; one dated after today hasn't happened yet.
    const upcoming = s.date > new Date().toISOString().slice(0, 10);
    li.append(a, el("p", "fine", `${BANK_NAME[s.bank]}${s.speaker ? `, ${s.speaker}` : ""} · ${upcoming ? "Scheduled for " : ""}${day(s.date)}`));
    if (s.about && !["Speech", "Interview", "Remarks"].includes(s.about)) li.append(el("p", "fine", s.about));
    list.append(li);
  }
  c.append(all.length ? list : el("p", "fine", "No speeches are stored yet."));
  return c;
}

function auctionsCard(file: EconomyFile | null): HTMLElement {
  const c = card("econ-auctions", "US Treasury auctions", "How the US government borrows: what is sold, how much, and the yield each recent auction set.");
  const au = file?.auctions;
  if (!au) return (missing(c, "The auctions"), c);
  const list = el("ul", "coming-list");
  for (const a of [...au.upcoming.slice(0, 4), ...au.recent.filter((r) => r.yieldPct != null).slice(0, 4)]) {
    const li = el("li", "coming-row");
    const set = a.yieldPct == null ? `$${(a.offeringUsd / 1e9).toFixed(0)} billion offered` : `sold at ${a.yieldPct.toFixed(3)}%${a.bidToCover ? `, bids ${a.bidToCover.toFixed(2)} times the amount` : ""}`;
    li.append(el("p", "coming-title", `${a.term} ${a.type.toLowerCase()}, ${day(a.auctionDate)}`), el("p", "fine", set));
    list.append(li);
  }
  c.append(list, source("TreasuryDirect, U.S. Department of the Treasury", "https://www.treasurydirect.gov/auctions/"));
  return c;
}

function countriesCard(world: WorldFile | null): HTMLElement {
  const c = card("econ-countries", "Countries compared", "The G20's latest published figures from the World Bank, and each stock market's OECD share-price index.");
  if (!world) return (missing(c, "The country figures"), c);
  const pick = ["USA", "CAN", "GBR", "DEU", "JPN", "CHN", "IND", "BRA"];
  const table = el("table", "econ-table");
  const head = el("tr");
  const inds = WORLD_INDICATORS.filter((i) => i.id !== "gdp_per_capita");
  for (const h of ["", ...inds.map((i) => i.name), ...(world.sharePrices ? ["Share prices (2015 = 100)"] : [])]) head.append(Object.assign(el("th", undefined, h), { scope: "col" }));
  table.append(head);
  for (const code of pick) {
    const tr = el("tr");
    tr.append(Object.assign(el("th", undefined, WORLD_COUNTRIES.find((w) => w.code === code)?.name ?? code), { scope: "row" }));
    for (const i of inds) {
      const s = world.indicators.find((d) => d.id === i.id)?.rows.find((r) => r.country === code)?.series;
      const v = s?.[s.length - 1];
      tr.append(el("td", undefined, v ? `${v.value.toFixed(1)}% (${v.year})` : "—"));
    }
    if (world.sharePrices) {
      const s = world.sharePrices.rows.find((r) => r.country === code)?.series;
      const v = s?.[s.length - 1];
      tr.append(el("td", undefined, v ? `${v.v.toFixed(1)} (${v.t})` : "—"));
    }
    table.append(tr);
  }
  const wrap = el("div", "econ-table-wrap");
  wrap.append(table);
  c.append(wrap, source("World Bank, World Development Indicators (CC BY 4.0)", world.source.url));
  if (world.sharePrices) c.append(source("OECD, Financial market: share prices", "https://data-explorer.oecd.org/"));
  return c;
}

/** Fills the Economy section; cards appear as their data arrives. */
export function mountEconomy(slot: HTMLElement, onExplain: (text: string) => void): void {
  slot.replaceChildren(el("p", "fine", "Loading the economy…"));
  void Promise.all([getJson(ECONOMY_DATA_URL), getJson(DOCS_DATA_URL), getJson(WORLD_DATA_URL)]).then(([e, d, w]) => {
    const economy = e ? readEconomyFile(e) : null;
    const docs = d ? readDocsFile(d) : null;
    const world = w ? readWorldFile(w) : null;
    slot.replaceChildren(indicatorsCard(economy, onExplain), banksCard(docs, onExplain), speechesCard(docs), auctionsCard(economy), countriesCard(world));
  });
}

/**
 * Today's "What stands out" and "Rates and the next decision" cards (data from src/core/today-brief.ts).
 * Each notable item shows why it was picked and its source, and one tap explains it in plain language.
 * Missing data says so; nothing is filled in. Describes the past and the calendar only, never a forecast.
 */
import type { ComingUpEvent } from "../core/coming-up";
import { countdown, eventIcs } from "../core/scenarios";
import type { TodayBrief } from "../core/today-brief";
import { el, labelledButton } from "./dom";

const day = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

const KIND: Record<string, string> = {
  crypto_move: "Crypto move",
  yield_curve: "Yield curve",
  rate_decision: "Rate decision",
  economic_change: "Economic figure",
  official_release: "Official release",
};

export function todayBriefCards(brief: TodayBrief | "loading", onExplain: (text: string) => void): HTMLElement[] {
  return [notableCard(brief, onExplain), comingUpCard(brief), ratesCard(brief)];
}

/** Countdowns on the page tick together, once every 30 seconds, while any is shown. */
const ticking = new Set<{ node: HTMLElement; time: string }>();
let timer: number | undefined;
function tick(): void {
  const now = Date.now();
  for (const t of ticking) {
    if (!t.node.isConnected) ticking.delete(t);
    else t.node.textContent = countdown(t.time, now);
  }
  if (!ticking.size && timer !== undefined) {
    clearInterval(timer);
    timer = undefined;
  }
}

function comingUpCard(brief: TodayBrief | "loading"): HTMLElement {
  const card = el("section", "card today-coming");
  card.setAttribute("aria-labelledby", "coming-title");
  const title = el("h2", "card-title", "Coming up");
  title.id = "coming-title";
  card.append(title);
  if (brief === "loading") {
    card.append(el("p", "fine", "Loading the calendar…"));
    return card;
  }
  if (!brief.events.length) {
    card.append(el("p", "fine", "The calendars couldn't be loaded right now. Nothing is shown in their place."));
    return card;
  }
  card.append(el("p", "fine", "Scheduled rate decisions and data releases, with what each possible outcome would mean. Nobody knows the outcome in advance."));
  const list = el("ul", "coming-list");
  for (const e of brief.events) list.append(eventRow(e));
  card.append(list);
  if (timer === undefined) timer = window.setInterval(tick, 30_000);
  return card;
}

function eventRow(e: ComingUpEvent): HTMLElement {
  const li = el("li", "coming-row");
  const when = new Date(e.time).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const count = el("span", "coming-count", countdown(e.time, Date.now()));
  count.setAttribute("aria-live", "off");
  ticking.add({ node: count, time: e.time });
  const head = el("div", "coming-head");
  head.append(el("p", "coming-title", e.title), count);
  const meta = el("p", "fine", `${when} your time`);
  li.append(head, meta);
  if (e.context) li.append(el("p", "fine coming-context", e.context));
  const more = el("details", "coming-more");
  more.append(el("summary", undefined, "If this happens"));
  const outs = el("ul", "coming-outcomes");
  for (const o of e.scenarios.outcomes) {
    const item = el("li");
    item.append(el("strong", undefined, `${o.outcome}. `), o.meaning);
    outs.append(item);
  }
  more.append(outs, el("p", "fine", `People watch: ${e.scenarios.watch.join("; ")}.`), el("p", "fine", e.scenarios.caution));
  const actions = el("div", "coming-actions");
  const add = labelledButton("calendar", "Add to calendar", "secondary small");
  add.addEventListener("click", () => {
    const blob = new Blob([eventIcs({ title: e.title, time: e.time, about: e.about, sourceUrl: e.sourceUrl, uid: e.id })], { type: "text/calendar" });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `${e.id}.ics` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1_000);
  });
  const src = el("a", "fine", "Official calendar") as HTMLAnchorElement;
  src.href = e.sourceUrl;
  src.target = "_blank";
  src.rel = "noreferrer";
  actions.append(add, src);
  li.append(more, actions);
  return li;
}

function notableCard(brief: TodayBrief | "loading", onExplain: (text: string) => void): HTMLElement {
  const card = el("section", "card today-notable");
  card.setAttribute("aria-labelledby", "notable-title");
  const title = el("h2", "card-title", "What stands out today");
  title.id = "notable-title";
  card.append(title);
  if (brief === "loading") {
    card.append(el("p", "fine", "Checking today's data…"));
    return card;
  }
  if (brief.notable == null) {
    card.append(el("p", "fine", "What stands out couldn't be checked right now. Prices and headlines below are unaffected."));
    return card;
  }
  if (!brief.notable.length) {
    card.append(el("p", "fine", "Nothing passed the rules today."));
  } else {
    card.append(el("p", "fine", "Each item was picked by a fixed rule from data that has already happened. None of it says what happens next."));
    const list = el("ul", "notable-list");
    for (const item of brief.notable.slice(0, 6)) {
      const li = el("li", "notable-row");
      const text = el("div", "notable-text");
      text.append(el("span", "notable-kind", KIND[item.kind] ?? "Notable"), el("p", "notable-title", item.title), el("p", "fine", item.detail));
      const why = el("details", "notable-why");
      why.append(el("summary", undefined, "Why it's here"), el("p", "fine", item.rule), el("p", "fine", `Source: ${item.source}`));
      text.append(why);
      const explain = labelledButton("sparkle", "Explain", "secondary small");
      explain.setAttribute("aria-label", `Explain: ${item.title}`);
      explain.addEventListener("click", () => onExplain(item.title));
      li.append(text, explain);
      list.append(li);
    }
    card.append(list);
  }
  if (brief.quiet.length) {
    const quiet = el("details", "notable-quiet");
    quiet.append(el("summary", undefined, "Checked, nothing unusual"));
    const ul = el("ul", "fine");
    for (const q of brief.quiet) ul.append(el("li", undefined, q));
    quiet.append(ul);
    card.append(quiet);
  }
  return card;
}

function ratesCard(brief: TodayBrief | "loading"): HTMLElement {
  const card = el("section", "card today-rates");
  card.setAttribute("aria-labelledby", "rates-title");
  const title = el("h2", "card-title", "Policy rates and the next decision");
  title.id = "rates-title";
  card.append(title);
  if (brief === "loading") {
    card.append(el("p", "fine", "Loading the central banks' rates…"));
    return card;
  }
  if (!brief.rates.length && !brief.next) {
    card.append(el("p", "fine", "The central banks' figures couldn't be loaded right now. Nothing is shown in their place."));
    return card;
  }
  if (brief.next) {
    const when = brief.next.daysAway <= 0 ? "today" : brief.next.daysAway === 1 ? "tomorrow" : `in ${brief.next.daysAway} days`;
    const p = el("p", "rates-next");
    p.append(el("strong", undefined, `Next decision: ${brief.next.institution}, ${day(brief.next.date)} (${when}).`), " The date only; nobody knows the outcome in advance.");
    card.append(p);
  }
  const table = el("table", "rates-table");
  const head = el("tr");
  head.append(el("th", undefined, "Central bank"), el("th", undefined, "Rate"), el("th", undefined, "Last move"));
  const thead = el("thead");
  thead.append(head);
  const body = el("tbody");
  for (const r of brief.rates) {
    const tr = el("tr");
    const move = r.change == null || !r.movedOn ? "none in the last year" : `${r.change > 0 ? "+" : "−"}${Math.abs(r.change).toFixed(2)} pt, ${day(r.movedOn)}`;
    tr.append(el("td", undefined, r.bank), el("td", "num", `${r.value.toFixed(2)}%`), el("td", "num", move));
    body.append(tr);
  }
  table.append(thead, body);
  card.append(table, el("p", "fine", "From each central bank's own data (Federal Reserve Bank of New York, ECB, Bank of Canada, Bank of England)."));
  return card;
}

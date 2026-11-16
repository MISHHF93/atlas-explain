/**
 * "In the news" on Today: real headlines from the GDELT news index and official press releases
 * (src/core/news.ts), captured on a schedule, each with its source, its age and one tap to
 * explain it in plain language.
 * Nothing is made up: when no headline is recent enough, the card says so and why.
 */
import type { HeadlinesView } from "../core/catalog";
import { HEADLINE_CREDIT, type NewsItem } from "../core/news";
import { relativeTime } from "../core/history";
import { el, labelledButton } from "./dom";

export const HEADLINES_SOURCE = HEADLINE_CREDIT.replace(/\.$/, "");

export function headlinesCard(view: HeadlinesView | { kind: "loading" }, onExplain: (title: string) => void, now: number = Date.now()): HTMLElement {
  const card = el("section", "card headlines");
  card.setAttribute("aria-labelledby", "headlines-title");
  const title = el("h2", "card-title", "In the news");
  title.id = "headlines-title";
  card.append(title);

  if (view.kind === "loading") {
    card.append(el("p", "fine", "Loading today's headlines…"));
    return card;
  }
  if (view.kind === "unavailable") {
    card.append(el("p", "fine", "Headlines couldn't be loaded right now. They come from a free public news index and will be back shortly."));
    return card;
  }
  if (view.kind === "none") {
    const when = Date.parse(view.generatedAt);
    card.append(el("p", "fine", `No headline is recent enough to call today's news. The list was last refreshed ${Number.isFinite(when) ? relativeTime(when, now) : "a while ago"}, and older headlines are not shown.`));
    return card;
  }

  card.append(el("p", "fine", "Tap Explain to get any headline in plain language, with both sides. Education only."));
  const list = el("ul", "headline-list");
  for (const item of view.items) list.append(headlineRow(item, onExplain, now));
  card.append(list, el("p", "fine headline-source", `${HEADLINES_SOURCE}. Each links to its publisher; we don't write or check them.`));
  return card;
}

function headlineRow(item: NewsItem, onExplain: (title: string) => void, now: number): HTMLElement {
  const row = el("li", "news-row");
  const link = el("a", "headline-title", item.title) as HTMLAnchorElement;
  link.href = item.url;
  link.target = "_blank";
  link.rel = "noreferrer";
  const meta = el("span", "fine headline-meta", `${item.domain} · ${relativeTime(Date.parse(item.seenAt), now)}`);
  const explain = labelledButton("sparkle", "Explain", "secondary small");
  explain.setAttribute("aria-label", `Explain the headline: ${item.title}`);
  explain.addEventListener("click", () => onExplain(item.title));
  const text = el("div", "headline-text");
  text.append(link, meta);
  row.append(text, explain);
  return row;
}

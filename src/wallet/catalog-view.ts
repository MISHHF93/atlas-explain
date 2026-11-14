/**
 * The public multi-asset catalog: one search, class filters, calm class sections,
 * recently viewed, honest rows and a page that adapts to each class.
 * Loaded on demand, so the popup's first paint does not pay for it.
 */
import type { Asset, AssetClass } from "../core/asset-schema";
import { sparkPath, type SparkPoint } from "../core/assets";
import {
  CLASS_INFO,
  MODE_HELP,
  MODE_LABEL,
  formatAsOf,
  formatChange,
  formatValue,
  groupByClass,
  presentClasses,
  searchAssets,
  type ClassFilter,
} from "../core/catalog";
import { ALL_TERMS } from "../core/terms";

/** Everything the public catalog needs, in this one lazily loaded chunk (keeps popup.js small). */
export { assetFromLiveRow } from "../core/asset-schema";
export { EDUCATION_ASSETS } from "../core/education-assets";
export { loadNews, withCompanyLogos } from "../core/catalog";
import { LOGO_CREDIT } from "../core/catalog";
import { recentFilingLines } from "../core/catalog";
import { NEWS_TARGET_IDS, newsQuestion, type NewsItem } from "../core/news";
import { SOURCES } from "../core/asset-schema";
export { RECENT_KEY, addRecent, assetsFromLiveCatalog, explainAssetPrompt, findAsset, loadMarketData, readRecent } from "../core/catalog";
import { el, labelledButton } from "./dom";
import { icon } from "./icons";

export type CatalogPanelState =
  | { kind: "loading" }
  | { kind: "ready"; assets: Asset[]; notice?: string }
  | { kind: "error"; title: string; reason: string };

export interface CatalogPanelHandle {
  node: HTMLElement;
  update(state: CatalogPanelState): void;
  /** Re-reads recently viewed (after a page opens). */
  refreshRecent(): void;
}

/** What the views need from the watchlist store (src/core/watchlist.ts). */
export interface WatchView {
  ids(): string[];
  has(id: string): boolean;
  synced(): boolean;
  toggle(id: string): Promise<"added" | "removed" | "full">;
}

type Filter = ClassFilter | "watch";

export function catalogPanel(options: {
  onOpen: (asset: Asset) => void;
  onRetry: () => void;
  recent: () => string[];
  watchlist?: WatchView;
}): CatalogPanelHandle {
  const wrap = el("div", "stack catalog");
  const searchWrap = el("label", "search");
  searchWrap.append(icon("search", 16));
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Search any asset: Bitcoin, EUR/USD, 10-year yield…";
  input.setAttribute("aria-label", "Search assets");
  searchWrap.append(input);

  const filters = el("div", "filters");
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "Asset class");
  const recentRow = el("div", "recent-row");
  const meta = el("p", "fine count");
  meta.setAttribute("aria-live", "polite");
  const body = el("div", "stack");
  wrap.append(searchWrap, filters, recentRow, meta, body);

  let state: CatalogPanelState = { kind: "loading" };
  let klass: Filter = "all";
  input.addEventListener("input", render);
  document.addEventListener("keydown", (event) => {
    const typing = event.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName);
    if (event.key !== "/" || typing || !wrap.isConnected || wrap.closest("[hidden]")) return;
    event.preventDefault();
    input.focus();
  });
  render();

  function update(next: CatalogPanelState): void {
    state = next;
    render();
  }

  function renderFilters(assets: Asset[]): void {
    const classes = presentClasses(assets);
    const watching = watched(assets).length > 0;
    if (klass === "watch" ? !watching : klass !== "all" && !classes.includes(klass)) klass = "all";
    filters.hidden = classes.length < 2 && !watching;
    const ids: Filter[] = ["all", ...(watching ? (["watch"] as Filter[]) : []), ...classes];
    filters.replaceChildren(...ids.map((id) => {
      const b = el("button", "filter", id === "all" ? "All" : id === "watch" ? "Watchlist" : CLASS_INFO[id].label);
      b.type = "button";
      b.setAttribute("aria-pressed", id === klass ? "true" : "false");
      b.addEventListener("click", () => {
        klass = id;
        render();
      });
      return b;
    }));
  }

  function renderRecent(assets: Asset[]): void {
    const ids = options.recent();
    const items = ids.map((id) => assets.find((a) => a.id === id)).filter((a): a is Asset => Boolean(a)).slice(0, 6);
    recentRow.hidden = items.length === 0 || input.value.trim() !== "";
    if (recentRow.hidden) return;
    recentRow.replaceChildren(el("span", "fine recent-label", "Recently viewed"), ...items.map((a) => {
      const b = el("button", "chip recent-chip", a.symbol);
      b.type = "button";
      b.setAttribute("aria-label", `Open ${a.name}`);
      b.addEventListener("click", () => options.onOpen(a));
      return b;
    }));
  }

  function render(): void {
    if (state.kind === "loading") {
      filters.hidden = true;
      recentRow.hidden = true;
      meta.textContent = "Loading…";
      const list = el("ul", "asset-list");
      list.append(...[0, 1, 2, 3].map(() => skeletonRow()));
      body.replaceChildren(list);
      return;
    }
    if (state.kind === "error") {
      filters.hidden = true;
      recentRow.hidden = true;
      meta.textContent = "";
      const card = el("section", "card state state-error");
      card.setAttribute("role", "status");
      const retry = labelledButton("refresh", "Try again", "secondary small");
      retry.addEventListener("click", options.onRetry);
      card.append(el("p", "card-title", state.title), el("p", "fine", state.reason), retry);
      body.replaceChildren(card);
      return;
    }
    const assets = state.assets;
    const notice = state.notice;
    renderFilters(assets);
    renderRecent(assets);
    const query = input.value;
    const watchIds = new Set(options.watchlist?.ids() ?? []);
    const rows = searchAssets(assets, query, klass === "watch" ? { klass: "all", onlyIds: watchIds } : { klass });
    meta.replaceChildren(rows.length === assets.length ? `${assets.length} assets` : `${rows.length} of ${assets.length} assets`);
    if (assets.some((a) => a.logo?.startsWith("https://img.logo.dev/"))) meta.append(" · ", link(LOGO_CREDIT.text, LOGO_CREDIT.href));
    const noticeNode = notice ? [el("p", "fine notice-line", notice)] : [];
    if (rows.length === 0) {
      const none = el("section", "card state state-empty");
      none.append(el("p", "fine", "No asset matches. Try a name or a symbol like BTC or EUR/USD."));
      body.replaceChildren(none);
      return;
    }
    // All, no search: one calm section per class. Otherwise one list, with the class intro when filtered.
    if (klass === "all" && !query.trim()) {
      const mine = watched(assets);
      body.replaceChildren(...noticeNode, ...(mine.length ? [watchSection(mine)] : []), ...groupByClass(rows).map((g) => section(g.klass, g.assets)));
    } else if (klass === "watch") {
      body.replaceChildren(...noticeNode, watchSection(rows));
    } else if (klass !== "all") {
      body.replaceChildren(...noticeNode, section(klass, rows));
    } else {
      body.replaceChildren(...noticeNode, list(rows, true));
    }
  }

  /** Watchlist items in the order they were added (newest first). */
  function watched(assets: Asset[]): Asset[] {
    const ids = options.watchlist?.ids() ?? [];
    return ids.map((id) => assets.find((a) => a.id === id)).filter((a): a is Asset => Boolean(a));
  }

  function watchSection(assets: Asset[]): HTMLElement {
    const s = el("section", "cat-section");
    s.setAttribute("aria-labelledby", "cat-watch");
    const h = el("h2", "section-label", "Your watchlist");
    h.id = "cat-watch";
    const note = options.watchlist?.synced()
      ? "Kept in your account, on every device where you sign in."
      : "Saved on this device. Sign in to keep it on all your devices.";
    s.append(h, el("p", "fine cat-intro", note), list(assets, true));
    return s;
  }

  function section(k: AssetClass, assets: Asset[]): HTMLElement {
    const s = el("section", "cat-section");
    s.setAttribute("aria-labelledby", `cat-${k}`);
    const h = el("h2", "section-label", CLASS_INFO[k].label);
    h.id = `cat-${k}`;
    s.append(h, el("p", "fine cat-intro", CLASS_INFO[k].intro), list(assets, false));
    return s;
  }

  function list(assets: Asset[], showClass: boolean): HTMLElement {
    const ul = el("ul", "asset-list");
    ul.setAttribute("aria-label", "Assets");
    ul.append(...assets.map((a) => {
      const li = el("li");
      li.append(assetRow(a, showClass, () => options.onOpen(a)));
      return li;
    }));
    return ul;
  }

  return { node: wrap, update, refreshRecent: () => render() };
}

function skeletonRow(): HTMLElement {
  const li = el("li", "asset-row skeleton-row");
  li.setAttribute("aria-hidden", "true");
  li.append(el("span", "asset-icon"), el("span", "sk-line"), el("span", "sk-line short"));
  return li;
}

function badge(a: Asset): HTMLElement {
  // Forex shows its base currency (EUR), options a plain "OPT"; everything else its symbol.
  const raw = a.classData.class === "forex" ? a.classData.base : a.class === "option" ? "OPT" : a.symbol.replace(/[/:-]/g, "");
  const short = raw.slice(0, 4);
  const b = el("span", `asset-icon tone-${a.class}`, short.length > 4 ? short.slice(0, 3) : short);
  b.dataset.len = String(Math.min(4, short.length));
  b.setAttribute("aria-hidden", "true");
  if (a.logo) {
    // Decorative: the name is always written next to it. No referrer is sent to the image host.
    const img = document.createElement("img");
    img.src = a.logo;
    img.alt = "";
    img.width = 34;
    img.height = 34;
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      img.remove();
      b.classList.remove("has-logo");
    });
    b.classList.add("has-logo");
    b.append(img);
  }
  return b;
}

function modeBadge(a: Asset): HTMLElement | null {
  if (!a.quote) return null;
  const b = el("span", "fresh-badge", MODE_LABEL[a.quote.mode]);
  b.dataset.fresh = a.quote.mode;
  b.title = MODE_HELP[a.quote.mode];
  return b;
}

function assetRow(a: Asset, showClass: boolean, open: () => void): HTMLElement {
  const btn = el("button", "asset-row");
  btn.type = "button";
  btn.dataset.id = a.id;
  const value = formatValue(a);
  const change = formatChange(a);
  const spoken = value
    ? `${a.name}, ${a.symbol}. ${value}${change ? `, ${change.text} ${a.quote!.changeWindow}` : ""}. ${MODE_LABEL[a.quote!.mode]}, ${a.quote!.source.label}.`
    : `${a.name}, ${a.symbol}. Price not shown. ${a.noQuoteReason ?? ""}`;
  btn.setAttribute("aria-label", spoken);
  const who = el("span", "asset-who");
  const sub = el("span", "asset-sub");
  sub.append(el("span", "asset-sym", a.symbol));
  if (showClass) sub.append(el("span", "class-tag", CLASS_INFO[a.class].label));
  const mb = modeBadge(a);
  if (mb) sub.append(mb, el("span", "row-source", a.quote!.source.label));
  else if (a.facts.length) sub.append(el("span", "row-source", a.facts.some((f) => f.kind === "figure") ? "SEC figures" : "SEC filings"));
  who.append(el("span", "asset-name", a.name), sub);
  const nums = el("span", "asset-nums");
  if (value) {
    const ch = el("span", "asset-change", change?.text ?? "");
    if (change) ch.dataset.tone = change.tone;
    nums.append(el("span", "asset-price", value), ch);
  } else {
    nums.append(el("span", "no-price", "Price not shown"));
  }
  btn.append(badge(a), who, nums);
  btn.addEventListener("click", open);
  return btn;
}

/* ---------- the asset page ---------- */

export interface AssetPageHandle {
  nodes: Node[];
  /** Fresh figures for the same asset (live crypto refresh). */
  update(a: Asset): void;
  /** Draws the chart when a licensed, batched history exists; null keeps it hidden. */
  setSpark(points: readonly SparkPoint[] | null, caption: string): void;
}

export function assetPage(start: Asset, options: {
  onExplain: (a: Asset) => void;
  onTerm: (title: string) => void;
  watchlist?: WatchView;
  /** Loads today's headlines for an asset; null when they can't be read right now. */
  news?: (a: Asset) => Promise<NewsItem[] | null>;
  /** Sends a prepared question to Explain (used to summarise the headlines). */
  onAsk?: (question: string) => void;
}): AssetPageHandle {
  const hero = el("section", "card asset-hero");
  const spark = el("div", "spark");
  spark.hidden = true;
  const about = el("section", "card group");
  const facts = el("section", "card group");
  const filings = el("section", "card group");
  const status = el("p", "fine withheld-line");
  const explain = labelledButton("sparkle", "Explain this asset", "primary explain-asset");
  const terms = el("div", "follow-row related-row");
  const watchRow = el("div", "watch-row");
  const watchNote = el("p", "fine");
  watchNote.setAttribute("role", "status");
  let current = start;
  explain.addEventListener("click", () => options.onExplain(current));
  const watchButton = el("button", "secondary watch-btn");
  watchButton.type = "button";
  const paintWatch = () => {
    const on = options.watchlist?.has(current.id) ?? false;
    watchButton.setAttribute("aria-pressed", on ? "true" : "false");
    watchButton.replaceChildren(icon(on ? "check" : "pin", 16), el("span", undefined, on ? "In your watchlist" : "Add to watchlist"));
  };
  watchButton.addEventListener("click", () => {
    void options.watchlist?.toggle(current.id).then((r) => {
      paintWatch();
      watchNote.textContent = r === "full"
        ? "Your watchlist is full (50). Remove one to add another."
        : r === "added"
          ? options.watchlist?.synced() ? "Added to your watchlist." : "Added. It's saved on this device; sign in to keep it everywhere."
          : "Removed from your watchlist.";
    });
  });
  if (options.watchlist) {
    paintWatch();
    watchRow.append(watchButton, watchNote);
  } else {
    watchRow.hidden = true;
  }

  // "What was in the news today": linked headlines plus new SEC filings, summarised only on request.
  const newsBox = el("section", "card group news-box");
  const newsButton = labelledButton("doc", "What was in the news today", "secondary");
  const newsBody = el("div", "stack");
  newsBody.setAttribute("aria-live", "polite");
  newsBox.append(newsButton, newsBody);
  const canNews = Boolean(options.news) && (NEWS_TARGET_IDS.has(start.id) || recentFilingLines(start).length > 0);
  newsBox.hidden = !canNews;
  newsButton.addEventListener("click", () => void showNews());

  async function showNews(): Promise<void> {
    newsButton.disabled = true;
    newsBody.replaceChildren(el("p", "fine", "Looking for today's headlines…"));
    const items = NEWS_TARGET_IDS.has(current.id) ? await options.news?.(current) ?? null : [];
    const filings = recentFilingLines(current);
    newsButton.disabled = false;
    if (items === null && filings.length === 0) {
      newsBody.replaceChildren(el("p", "fine", "Headlines can't be loaded right now. Try again in a minute."));
      return;
    }
    const list = items ?? [];
    if (list.length === 0 && filings.length === 0) {
      newsBody.replaceChildren(el("p", "fine", `Nothing in the news or in new SEC filings for ${current.name} in the last day.`));
      return;
    }
    const ul = el("ol", "news-list");
    for (const n of list) {
      const li = el("li");
      li.append(link(n.title, n.url), el("span", "fine news-meta", ` ${n.domain} · ${ago(n.seenAt)}`));
      ul.append(li);
    }
    for (const f of filings) ul.append(el("li", undefined, `SEC filing: ${f}`));
    const summarise = labelledButton("sparkle", "Summarise these", "primary small");
    summarise.addEventListener("click", () => options.onAsk?.(newsQuestion(current.name, current.symbol, list, filings)));
    const credit = el("p", "fine");
    credit.append(link(SOURCES.gdelt.attribution.text, SOURCES.gdelt.attribution.href), ". Headlines link to their publishers; we don't check or endorse them.");
    newsBody.replaceChildren(ul, ...(options.onAsk ? [summarise] : []), ...(list.length ? [credit] : []));
  }
  paint(start);

  function paint(a: Asset): void {
    current = a;
    const top = el("div", "hero-top");
    const who = el("div", "asset-who");
    const sub = el("span", "asset-sub");
    sub.append(el("span", "asset-sym", a.symbol), el("span", "class-tag", CLASS_INFO[a.class].label));
    if (a.venue) sub.append(el("span", undefined, a.venue));
    who.append(el("span", "asset-name", a.name), sub);
    top.append(badge(a), who);
    hero.replaceChildren(top);
    const value = formatValue(a);
    if (value && a.quote) {
      const change = formatChange(a);
      const line = el("p", "hero-change");
      if (change) {
        const c = el("span", "asset-change", change.text);
        c.dataset.tone = change.tone;
        line.append(c, el("span", "fine", ` ${a.quote.changeWindow}`));
      }
      const mode = el("p", "fine fresh-line");
      const mb = modeBadge(a);
      if (mb) mode.append(mb, " ");
      mode.append(`${MODE_HELP[a.quote.mode]} ${formatAsOf(a) ? `As of ${formatAsOf(a)}.` : ""}`);
      const src = el("p", "fine source-line");
      src.append(link(a.quote.source.attribution.text, a.quote.source.attribution.href));
      hero.append(el("p", "hero-price", value), line, mode, src);
    } else {
      hero.append(el("p", "no-price-reason", a.noQuoteReason ?? "Price not shown."));
    }
    hero.append(spark);

    about.replaceChildren(el("h3", undefined, `About ${CLASS_INFO[a.class].label.toLowerCase()}`), el("p", "fine", CLASS_INFO[a.class].intro), ...classLines(a));
    const figures = a.facts.filter((f) => f.kind !== "filing");
    const recent = a.facts.filter((f) => f.kind === "filing");
    facts.hidden = figures.length === 0;
    const fromSec = a.class === "stock" || a.class === "etf";
    facts.replaceChildren(el("h3", undefined, fromSec ? "Official figures" : "Key facts"), ...figures.map((f) => {
      const p = el("p", "fact-line");
      p.append(el("span", "fact-label", `${f.label}${f.period ? ` (${f.period})` : ""}`), el("span", "fact-value", f.value), " ", link(f.source.label, f.source.attribution.href));
      return p;
    }), ...(fromSec ? [el("p", "fine", "As reported by the company to the US Securities and Exchange Commission.")] : []));
    filings.hidden = recent.length === 0;
    filings.replaceChildren(el("h3", undefined, "Recent filings"), ...recent.map((f) => {
      const p = el("p", "fact-line");
      p.append(el("span", "fact-value", f.label), el("span", "fact-label", `${f.value}${f.period ? `, ${f.period}` : ""}`), " ", link(f.source.label, f.source.attribution.href));
      return p;
    }));
    status.hidden = a.status.state !== "withheld";
    status.textContent = a.status.state === "withheld" ? a.status.reason : "";

    const found = a.relatedTerms.map((id) => ALL_TERMS.find((t) => t.id === id)).filter((t): t is (typeof ALL_TERMS)[number] => Boolean(t));
    terms.hidden = found.length === 0;
    terms.replaceChildren(el("p", "fine", "Related terms"), ...found.map((t) => {
      const b = labelledButton("book", t.title, "follow-chip related-chip");
      b.addEventListener("click", () => options.onTerm(t.title));
      return b;
    }));
  }

  function setSpark(points: readonly SparkPoint[] | null, caption: string): void {
    if (!points || points.length < 2) {
      spark.hidden = true;
      return;
    }
    const w = 312;
    const h = 64;
    const first = points[0]!.c;
    const last = points[points.length - 1]!.c;
    const holder = document.createElement("span");
    const d = sparkPath(points, w, h);
    holder.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path class="spark-line" d="${d}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
    spark.dataset.tone = last > first ? "up" : last < first ? "down" : "flat";
    spark.replaceChildren(holder.firstElementChild as Element, el("p", "fine spark-cap", `Chart: ${caption}`));
    spark.setAttribute("role", "img");
    spark.setAttribute("aria-label", `Price chart, ${caption}`);
    spark.hidden = false;
  }

  return {
    nodes: [hero, status, explain, watchRow, newsBox, terms, facts, filings, about],
    update: (a) => paint(a),
    setSpark,
  };
}

/** The part of the page that differs by class (docs/ux/MULTI_ASSET_CATALOG.md §5.4). */
function classLines(a: Asset): HTMLElement[] {
  const lines: string[] = [];
  const d = a.classData;
  if (a.session.hours) lines.push(`Trading hours: ${a.session.hours}.`);
  switch (d.class) {
    case "crypto":
      lines.push(`Priced in ${d.quote}. Trades on many exchanges at once, so prices can differ slightly between them.`);
      break;
    case "forex":
      if (a.quote) lines.push(`1 ${d.base} = ${formatValue(a)} ${d.quote}. ${d.base} is the base currency; ${d.quote} is the quote currency.`);
      if (d.derived) lines.push("This cross rate is calculated from two official reference rates.");
      break;
    case "rate":
      lines.push(`${d.tenor} yield on the ${d.curve} curve.`);
      break;
    case "commodity":
      lines.push(`Benchmark: ${d.benchmark}, priced per ${d.unit}.${d.publishLagDays > 0 ? ` Published with a delay of about ${d.publishLagDays} days.` : ""}`);
      break;
    case "stock":
    case "etf":
      if (d.exchange) lines.push(`Listed on ${d.exchange}.`);
      break;
    case "index":
      lines.push(`Owned and calculated by ${d.owner}.${d.constituents ? ` About ${d.constituents} members.` : ""}`);
      break;
    case "future":
      lines.push(`Underlying: ${d.underlying}. Traded on ${d.exchange}.`);
      break;
    case "option":
      lines.push(`Options on ${d.underlying}.`);
      break;
  }
  return lines.map((t) => el("p", "fine", t));
}

function ago(iso: string, now: number = Date.now()): string {
  const mins = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`;
}

function link(text: string, href: string): HTMLAnchorElement {
  const a = el("a", "price-attr", text) as HTMLAnchorElement;
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

import {
  HOSTED_BODY,
  NOT_CONNECTED_BODY,
  NOT_CONNECTED_TITLE,
  SHADOW_DISCLAIMER,
  filterAssets,
  changeWindowText,
  formatChange,
  formatPrice,
  hitLabel,
  sampleLabel,
  sparkPath,
  type AssetDetailView,
  type AssetView,
  type AssetsState,
  type ClassFilter,
  type LeanView,
} from "../core/assets";
import { MIN_HIT_RATE, MIN_SAMPLE_SIZE } from "../core/signal";
import { el, labelledButton, replay } from "./dom";
import { icon } from "./icons";

/* ---------- Assets tab: a wallet-style token list ---------- */

export interface AssetsPanelHandle {
  node: HTMLElement;
  update(state: AssetsState): void;
  rows(): AssetView[];
}

export function assetsPanel(options: {
  onOpen: (asset: AssetView) => void;
  onRetry: () => void;
  preview?: string;
}): AssetsPanelHandle {
  const wrap = el("div", "stack assets");
  const searchWrap = el("label", "search");
  searchWrap.append(icon("search", 16));
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Search assets: BTC, Apple, NVDA…";
  input.setAttribute("aria-label", "Search assets");
  searchWrap.append(input);

  const filters = el("div", "filters");
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "Asset class");
  let klass: ClassFilter = "all";
  const filterButtons: HTMLButtonElement[] = [];
  for (const [id, label] of [["all", "All"], ["crypto", "Crypto · Live"], ["stock", "Stocks · Daily"]] as const) {
    const b = el("button", "filter", label);
    b.type = "button";
    b.dataset.filter = id;
    b.setAttribute("aria-pressed", id === "all" ? "true" : "false");
    b.addEventListener("click", () => {
      klass = id;
      for (const x of filterButtons) x.setAttribute("aria-pressed", x === b ? "true" : "false");
      render();
    });
    filterButtons.push(b);
    filters.append(b);
  }

  const banner = el("p", "preview-banner");
  banner.hidden = !options.preview;
  if (options.preview) banner.append(icon("info", 14), el("span", undefined, options.preview));
  const meta = el("p", "fine count");
  meta.setAttribute("aria-live", "polite");
  const list = el("ul", "asset-list");
  list.setAttribute("aria-label", "Assets");
  const notes = el("div", "stack");

  input.addEventListener("input", render);
  wrap.append(banner, searchWrap, filters, meta, list, notes);

  let state: AssetsState = { kind: "loading" };
  let all: AssetView[] = [];
  render();

  function update(next: AssetsState): void {
    state = next;
    all = next.kind === "ready" ? next.catalog.assets : [];
    render();
  }

  function render(): void {
    const searchable = state.kind === "ready";
    input.disabled = !searchable;
    for (const b of filterButtons) b.disabled = !searchable;
    notes.replaceChildren();
    if (state.kind === "loading") {
      meta.textContent = "Reading ATLAS on this computer…";
      list.replaceChildren(...[0, 1, 2, 3].map(() => skeletonRow()));
      return;
    }
    if (state.kind === "not_connected" || state.kind === "hosted") {
      meta.textContent = "";
      list.replaceChildren();
      notes.append(connectCard(state.kind === "hosted" ? HOSTED_BODY : NOT_CONNECTED_BODY, state.kind === "hosted" ? null : state.reason, state.kind === "hosted" ? null : options.onRetry));
      return;
    }
    if (state.kind === "error") {
      meta.textContent = "";
      list.replaceChildren();
      const card = el("section", "card state state-error");
      card.append(el("p", "card-title", "ATLAS answered, but Explain could not use it"), el("p", "fine", state.reason));
      const retry = labelledButton("refresh", "Try again", "secondary small");
      retry.addEventListener("click", options.onRetry);
      card.append(retry);
      notes.append(card);
      return;
    }
    const rows = filterAssets(all, input.value, klass);
    const live = all.filter((a) => a.quote.freshness === "live").length;
    meta.textContent = `${rows.length} of ${all.length} assets · ${live} live`;
    if (rows.length === 0) {
      const none = el("li", "card state state-empty");
      none.append(el("p", "fine", all.length ? "No asset matches. Try a ticker like BTC or AAPL." : "ATLAS has no assets with data on this computer yet."));
      list.replaceChildren(none);
    } else {
      list.replaceChildren(...rows.map((a) => assetRow(a, () => options.onOpen(a))));
    }
    for (const m of state.catalog.missing) notes.append(noteCard(m.reason));
  }

  return { node: wrap, update, rows: () => filterAssets(all, input.value, klass) };
}

function skeletonRow(): HTMLElement {
  const li = el("li", "asset-row skeleton-row");
  li.setAttribute("aria-hidden", "true");
  li.append(el("span", "asset-icon"), el("span", "sk-line"), el("span", "sk-line short"));
  return li;
}

export function assetIcon(a: Pick<AssetView, "symbol" | "klass">): HTMLElement {
  const base = a.symbol.replace(/-USD$/, "");
  const badge = el("span", `asset-icon tone-${a.klass}`, base.slice(0, base.length > 4 ? 3 : 4));
  badge.dataset.len = String(Math.min(4, base.length));
  badge.setAttribute("aria-hidden", "true");
  return badge;
}

export function lightDot(l: LeanView, size: "sm" | "lg" = "sm"): HTMLElement {
  const dot = el("span", `light-dot ${size}`);
  dot.dataset.light = l.colour;
  dot.title = l.label;
  dot.setAttribute("aria-hidden", "true");
  return dot;
}

export function freshnessBadge(a: Pick<AssetView, "badge" | "quote">): HTMLElement {
  const b = el("span", "fresh-badge", a.badge);
  b.dataset.fresh = a.quote.freshness;
  b.title = a.quote.freshnessLabel;
  return b;
}

function assetRow(a: AssetView, open: () => void): HTMLElement {
  const li = el("li");
  const btn = el("button", "asset-row");
  btn.type = "button";
  btn.dataset.symbol = a.symbol;
  const ch = formatChange(a.quote.changePct);
  btn.setAttribute("aria-label", `${a.name}, ${a.symbol}. ${formatPrice(a.quote.price)}, ${ch.text}. ${a.quote.freshnessLabel}. Paper light: ${a.light.label}.`);
  const who = el("span", "asset-who");
  const line1 = el("span", "asset-name", a.name);
  const line2 = el("span", "asset-sub");
  line2.append(el("span", "asset-sym", a.symbol), freshnessBadge(a));
  who.append(line1, line2);
  const nums = el("span", "asset-nums");
  const price = el("span", "asset-price", formatPrice(a.quote.price));
  const change = el("span", "asset-change", ch.text);
  change.dataset.tone = ch.tone;
  nums.append(price, change);
  const light = lightDot(a.light);
  btn.append(assetIcon(a), who, nums, light);
  btn.addEventListener("click", open);
  li.append(btn);
  return li;
}

export function connectCard(body: string, reason: string | null, onRetry: (() => void) | null): HTMLElement {
  const card = el("section", "card state connect-card");
  card.dataset.light = "grey";
  const art = el("div", "state-art");
  art.append(icon("plug", 22));
  const text = el("div", "stack");
  text.append(el("p", "card-title", NOT_CONNECTED_TITLE), el("p", "fine", body));
  if (reason) text.append(el("p", "fine reason-line", reason));
  const steps = el("ol", "connect-steps");
  for (const s of ["Start ATLAS on this computer (it serves localhost:3000).", "Keep this popup open: the list fills in by itself.", "Lights stay grey until the models clear the evidence gate."]) {
    steps.append(el("li", undefined, s));
  }
  text.append(steps);
  if (onRetry) {
    const retry = labelledButton("refresh", "Check again", "secondary small");
    retry.addEventListener("click", onRetry);
    text.append(retry);
  }
  card.append(art, text);
  return card;
}

function noteCard(text: string): HTMLElement {
  const card = el("section", "card state state-info");
  card.append(el("p", "fine", text));
  return card;
}

/* ---------- detail sheet ---------- */

export interface AssetDetailHandle {
  nodes: Node[];
  update(detail: AssetDetailView): void;
}

export function assetDetail(a: AssetView, options: { onExplain: (a: AssetView) => void; onWhy?: (a: AssetView) => void }): AssetDetailHandle {
  const head = el("section", "card asset-hero");
  const spark = el("div", "spark");
  const leanCard = el("section", "card lean-card");
  const leansList = el("ul", "lean-list");
  const why = el("details", "why");
  const whySummary = el("summary");
  whySummary.append(el("span", undefined, "Why this colour?"), icon("chevron", 14));
  const whyBody = el("p", "why-body");
  const whyRule = el("p", "why-body", `The light turns green or red only when the ATLAS paper shadow gate has passed and this market has at least ${MIN_SAMPLE_SIZE} resolved samples at a ${Math.round(MIN_HIT_RATE * 100)}% hit rate on fresh data. Otherwise grey is the honest answer.`);
  why.append(whySummary, whyBody, whyRule);
  const disclaimer = el("p", "paper shadow-note");
  disclaimer.append(icon("shield", 12), el("span", undefined, SHADOW_DISCLAIMER));
  const source = el("p", "fine source-line");
  const explain = labelledButton("sparkle", "Explain this", "primary explain-asset");
  const actions = el("div", "stack");
  actions.append(explain);

  let current: AssetView | AssetDetailView = a;
  explain.addEventListener("click", () => options.onExplain(current));
  paint(a);

  function paint(v: AssetView | AssetDetailView): void {
    current = v;
    const ch = formatChange(v.quote.changePct);
    const top = el("div", "hero-top");
    const who = el("div", "asset-who");
    who.append(el("span", "asset-name", v.name), el("span", "asset-sub"));
    who.lastElementChild?.append(el("span", "asset-sym", v.symbol), freshnessBadge(v));
    top.append(assetIcon(v), who);
    const price = el("p", "hero-price", formatPrice(v.quote.price));
    const change = el("p", "hero-change");
    const changeNum = el("span", "asset-change", ch.text);
    changeNum.dataset.tone = ch.tone;
    change.append(changeNum, el("span", "fine", v.quote.price == null ? "" : ` ${changeWindowText(v.quote)}`));
    const fresh = el("p", "fine fresh-line", v.quote.freshnessLabel);
    head.replaceChildren(top, price, change, fresh);
    if (v.quote.reason) head.append(el("p", "fine reason-line", v.quote.reason));
    head.append(spark);
    paintSpark("spark" in v ? v : null);

    const l = v.light;
    leanCard.dataset.light = l.colour;
    const leanTop = el("div", "lean-top");
    const text = el("div");
    text.append(el("p", "eyebrow", `Paper lean · ${l.horizonLabel || "all horizons"}`), el("h3", "lean-label", l.label));
    leanTop.append(lightDot(l, "lg"), text);
    const chips = el("div", "chips");
    chips.append(el("span", "chip", hitLabel(l)), el("span", "chip", sampleLabel(l)));
    leansList.replaceChildren(...v.leans.map((x) => {
      const li = el("li");
      li.append(lightDot(x), el("span", "lean-h", x.horizonLabel), el("span", "fine", x.label));
      return li;
    }));
    whyBody.textContent = l.reason;
    leanCard.replaceChildren(leanTop, chips, leansList, why);
    if (options.onWhy) {
      const ask = labelledButton("sparkle", "Explain the light in depth", "link-btn");
      ask.addEventListener("click", () => options.onWhy?.(current));
      leanCard.append(ask);
    }
    source.textContent = `Source: ${v.sourceLabel}.${"citation" in v && v.citation ? ` ${v.citation}` : ""}`;
  }

  function paintSpark(d: AssetDetailView | null): void {
    if (!d) {
      spark.replaceChildren(el("span", "sk-line spark-sk"));
      spark.setAttribute("aria-label", "Loading recent prices");
      return;
    }
    if (!d.spark.points.length) {
      spark.replaceChildren(el("p", "fine", d.spark.reason ?? "No recent bars to draw."));
      spark.removeAttribute("aria-label");
      return;
    }
    const w = 312;
    const h = 64;
    const first = d.spark.points[0]?.c ?? 0;
    const last = d.spark.points[d.spark.points.length - 1]?.c ?? 0;
    const tone = last > first ? "up" : last < first ? "down" : "flat";
    const holder = document.createElement("span");
    holder.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="${sparkPath(d.spark.points, w, h)}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>`;
    spark.dataset.tone = tone;
    spark.replaceChildren(holder.firstElementChild as Element, el("p", "fine spark-cap", `Last ${d.spark.points.length} ${d.spark.interval} closes · ${d.sourceLabel}`));
    spark.setAttribute("role", "img");
    spark.setAttribute("aria-label", `Sparkline of the last ${d.spark.points.length} ${d.spark.interval} closes, from ${formatPrice(first)} to ${formatPrice(last)}`);
  }

  return {
    nodes: [head, leanCard, disclaimer, actions, source],
    update: (d) => {
      paint(d);
      replay(spark, "enter");
    },
  };
}

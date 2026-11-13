import type { PricingView } from "../core/billing";
import { BETA_BADGE } from "../core/billing";
import { EXTENSION_DISCLAIMER } from "../core/extension-prompt";
import {
  ATLAS_DESK_URL,
  EMPTY_BODY,
  EMPTY_TITLE,
  OFFLINE_ANSWER,
  STEP_CLOUD,
  STEP_DEVICE,
  STEP_READ,
  shortSelection,
  signalCopy,
} from "../core/popup-copy";
import type { SignalView } from "../core/signal";
import { ALL_TERMS, TERM_GROUP_LABEL, searchTerms, type TermEntry } from "../core/terms";
import { el, externalLink, iconButton, labelledButton, replay } from "./dom";
import { icon, type IconName } from "./icons";
import { isTheme, type ThemeChoice } from "./shell";

/* ---------- signal card ---------- */

export interface SignalCardHandle {
  node: HTMLElement;
  update(view: SignalView): void;
  setWhyOpen(open: boolean): void;
}

export function signalCard(options: {
  compact?: boolean;
  onWhy?: () => void;
  onRefresh?: () => Promise<void>;
  deskHint?: string;
}): SignalCardHandle {
  const card = el("section", "card signal");
  card.dataset.state = "grey";
  if (options.compact) card.classList.add("compact");
  const headlineId = `signal-headline-${Math.random().toString(36).slice(2, 7)}`;
  card.setAttribute("aria-labelledby", headlineId);

  const orb = el("div", "orb");
  orb.setAttribute("aria-hidden", "true");
  const core = el("span", "orb-core");
  orb.append(el("span", "orb-ring"), el("span", "orb-ring orb-ring-2"), core);

  const text = el("div", "signal-text");
  const headline = el("h2", "headline", "Connect ATLAS");
  headline.id = headlineId;
  text.append(el("p", "eyebrow", "Paper signal light"), headline);

  const top = el("div", "signal-top");
  top.append(orb, text);
  if (options.onRefresh) {
    const refresh = iconButton("refresh", "Read the signal again", "icon-btn ghost refresh");
    refresh.addEventListener("click", () => {
      refresh.classList.add("spin");
      void options.onRefresh?.().finally(() => window.setTimeout(() => refresh.classList.remove("spin"), 450));
    });
    top.append(refresh);
  }

  const chips = el("div", "chips");
  const hit = el("span", "chip");
  const sample = el("span", "chip");
  const gate = el("span", "chip chip-gate");
  chips.append(hit, sample, gate);

  const paper = el("p", "paper");

  const legend = el("ul", "legend");
  legend.setAttribute("aria-label", "What the colours mean");
  for (const [state, label] of [["green", "leans up"], ["red", "leans down"], ["grey", "not enough evidence"]] as const) {
    const item = el("li");
    item.dataset.state = state;
    item.append(el("span", "legend-dot"), el("span", undefined, label));
    legend.append(item);
  }

  const why = el("details", "why");
  const summary = el("summary");
  summary.append(el("span", undefined, "Why this colour?"), icon("chevron", 14));
  const detail = el("p", "why-body");
  const desk = el("p", "why-body desk-says");
  desk.hidden = true;
  const actions = el("div", "why-actions");
  if (options.onWhy) {
    const ask = labelledButton("sparkle", "Explain it in depth", "link-btn");
    ask.addEventListener("click", () => options.onWhy?.());
    actions.append(ask);
  }
  const deskLink = externalLink("Open the ATLAS desk", ATLAS_DESK_URL);
  actions.append(deskLink);
  why.append(summary, detail, desk, actions);

  const hint = options.deskHint ? el("p", "fine hint-line", options.deskHint) : null;

  card.append(top, chips, paper, legend, why);
  if (hint) card.append(hint);

  let colour = "";
  function update(view: SignalView): void {
    const copy = signalCopy(view);
    card.dataset.state = view.colour;
    core.replaceChildren(icon(copy.icon, 22));
    headline.textContent = copy.headline;
    hit.textContent = view.hitRateLabel;
    sample.textContent = view.sampleLabel;
    gate.textContent = copy.gate;
    paper.textContent = view.paperLabel;
    detail.textContent = copy.detail;
    desk.hidden = !view.deskReason;
    desk.textContent = view.deskReason ? `ATLAS desk: ${view.deskReason}` : "";
    deskLink.hidden = view.connected;
    if (hint) hint.hidden = view.connected;
    if (colour && colour !== view.colour) replay(orb, "pop");
    colour = view.colour;
  }

  return {
    node: card,
    update,
    setWhyOpen: (open) => {
      why.open = open;
    },
  };
}

/* ---------- result states ---------- */

export function emptyCard(note?: string, hint?: string): HTMLElement {
  const card = el("div", "card state state-empty");
  const art = el("div", "state-art");
  art.append(icon("highlight", 22));
  const body = el("div");
  body.append(el("p", "card-title", EMPTY_TITLE), el("p", "fine", note ?? EMPTY_BODY));
  if (hint) body.append(el("p", "hint", hint));
  card.append(art, body);
  return card;
}

export function loadingCard(step: 0 | 1 | 2, labels: [string, string, string] = [STEP_READ, STEP_DEVICE, STEP_CLOUD]): HTMLElement {
  const card = el("div", "card state state-loading");
  card.setAttribute("aria-busy", "true");
  const steps = el("ol", "steps");
  labels.forEach((text, index) => {
    const item = el("li");
    item.dataset.status = index < step ? "done" : index === step ? "active" : "todo";
    const mark = el("span", "step-mark");
    if (index < step) mark.append(icon("check", 12));
    item.append(mark, el("span", undefined, text));
    steps.append(item);
  });
  const skeleton = el("div", "skeleton");
  skeleton.setAttribute("aria-hidden", "true");
  skeleton.append(el("span"), el("span"), el("span"));
  card.append(steps, skeleton);
  return card;
}

export function messageCard(kind: "error" | "offline" | "limit" | "info", title: string, text: string, retry?: () => void): HTMLElement {
  const card = el("div", `card state state-${kind}`);
  card.setAttribute("role", kind === "error" ? "alert" : "status");
  const iconName: IconName = kind === "error" ? "alert" : kind === "offline" ? "offline" : "info";
  const head = el("p", "card-title");
  head.append(icon(iconName, 16), el("span", undefined, title));
  card.append(head, el("p", "fine strong", text));
  if (kind === "limit") card.append(el("p", "fine", EXTENSION_DISCLAIMER));
  if (retry) {
    const again = labelledButton("refresh", "Try again", "secondary small");
    again.addEventListener("click", retry);
    card.append(again);
  }
  return card;
}

export function offlineCard(): HTMLElement {
  return messageCard("offline", "You are offline", OFFLINE_ANSWER);
}

export function limitCard(text: string): HTMLElement {
  return messageCard("limit", BETA_BADGE, text);
}

/* ---------- explanation card ---------- */

export function sourceChip(source: "on_device" | "in_cloud" | "unknown", detail?: string): HTMLElement {
  const chip = el("span", source === "on_device" ? "source source-device" : "source source-cloud");
  chip.append(
    icon(source === "on_device" ? "chip" : "cloud", 14),
    el("span", undefined, source === "on_device" ? "On-device · Gemini Nano" : source === "in_cloud" ? `Cloud · ${detail ?? "Firebase AI Logic"}` : "Path not reported"),
  );
  return chip;
}

export function explanationCard(options: {
  source: "on_device" | "in_cloud" | "unknown";
  sourceDetail?: string;
  selection?: string;
  text?: string;
  body?: Node[];
  copyText: string;
  notes?: string[];
  onClear?: () => void;
}): HTMLElement {
  const card = el("article", "card explain-card");
  const head = el("div", "card-head");
  const tools = el("div", "card-tools");
  const copy = iconButton("copy", "Copy explanation", "icon-btn ghost");
  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(options.copyText).then(() => {
      copy.replaceChildren(icon("check"));
      copy.setAttribute("aria-label", "Copied");
      window.setTimeout(() => {
        copy.replaceChildren(icon("copy"));
        copy.setAttribute("aria-label", "Copy explanation");
      }, 1400);
    });
  });
  tools.append(copy);
  if (options.onClear) {
    const clear = iconButton("close", "Clear explanation", "icon-btn ghost");
    clear.addEventListener("click", () => options.onClear?.());
    tools.append(clear);
  }
  head.append(sourceChip(options.source, options.sourceDetail), tools);
  card.append(head);
  if (options.selection?.trim()) card.append(el("blockquote", "quote", shortSelection(options.selection)));
  if (options.text) {
    const body = el("div", "answer-body");
    body.textContent = options.text;
    card.append(body);
  }
  if (options.body) card.append(...options.body);
  for (const note of options.notes ?? []) {
    const line = el("p", "note");
    line.append(icon("shield", 14), el("span", undefined, note));
    card.append(line);
  }
  return card;
}

/* ---------- glossary ---------- */

export function glossaryPanel(options: { onAsk: (term: TermEntry) => void; askLabel: string }): HTMLElement {
  const wrap = el("div", "stack");
  const searchWrap = el("label", "search");
  searchWrap.append(icon("search", 16));
  const input = document.createElement("input");
  input.type = "search";
  input.placeholder = "Search terms";
  input.setAttribute("aria-label", "Search glossary terms");
  searchWrap.append(input);
  const filters = el("div", "filters");
  filters.setAttribute("role", "group");
  filters.setAttribute("aria-label", "Term groups");
  let group: TermEntry["group"] | "all" = "all";
  const groupButtons: HTMLButtonElement[] = [];
  for (const id of ["all", "atlas", "orders", "market", "risk"] as const) {
    const button = el("button", "filter", id === "all" ? "All" : TERM_GROUP_LABEL[id]);
    button.type = "button";
    button.setAttribute("aria-pressed", id === "all" ? "true" : "false");
    button.addEventListener("click", () => {
      group = id;
      for (const b of groupButtons) b.setAttribute("aria-pressed", b === button ? "true" : "false");
      render();
    });
    groupButtons.push(button);
    filters.append(button);
  }
  const list = el("ul", "term-list");
  const count = el("p", "fine count");
  count.setAttribute("aria-live", "polite");
  input.addEventListener("input", render);
  wrap.append(searchWrap, filters, count, list);
  render();
  return wrap;

  function render(): void {
    const items = searchTerms(input.value, ALL_TERMS).filter((t) => group === "all" || t.group === group);
    count.textContent = items.length === 1 ? "1 term" : `${items.length} terms`;
    if (items.length === 0) {
      const none = el("li", "card state state-empty");
      none.append(el("p", "fine", "No term matches. Try a shorter word, or ask Explain directly."));
      list.replaceChildren(none);
      return;
    }
    list.replaceChildren(...items.map(termCard));
  }

  function termCard(term: TermEntry): HTMLElement {
    const item = el("li", "card term");
    const details = el("details");
    const summary = el("summary");
    const title = el("span", "term-title", term.title);
    summary.append(el("span", `term-tag tag-${term.group}`, TERM_GROUP_LABEL[term.group]), title, icon("chevron", 14));
    const body = el("p", "term-body", term.summary);
    const ask = labelledButton("sparkle", options.askLabel, "link-btn");
    ask.addEventListener("click", () => options.onAsk(term));
    details.append(summary, body, ask);
    item.append(details);
    return item;
  }
}

/* ---------- settings building blocks ---------- */

export function group(title: string, nodes: Node[]): HTMLElement {
  const section = el("section", "card group");
  section.append(el("h3", undefined, title), ...nodes);
  return section;
}

export function themePicker(current: ThemeChoice, onPick: (choice: ThemeChoice) => void): HTMLElement {
  const wrap = el("div", "segmented");
  wrap.setAttribute("role", "radiogroup");
  wrap.setAttribute("aria-label", "Appearance");
  const buttons: HTMLButtonElement[] = [];
  for (const [choice, label, name] of [["system", "System", "monitor"], ["light", "Light", "sun"], ["dark", "Dark", "moon"]] as const) {
    const button = labelledButton(name, label, "seg");
    button.setAttribute("role", "radio");
    button.dataset.choice = choice;
    button.setAttribute("aria-checked", choice === current ? "true" : "false");
    button.addEventListener("click", () => {
      for (const b of buttons) b.setAttribute("aria-checked", b === button ? "true" : "false");
      const picked = button.dataset.choice;
      if (isTheme(picked)) onPick(picked);
    });
    buttons.push(button);
    wrap.append(button);
  }
  return wrap;
}

export function planCard(view: PricingView, extras: Node[] = []): HTMLElement {
  const card = el("section", "card plan-card");
  const head = el("div", "card-head");
  const title = el("div");
  title.append(el("p", "eyebrow", "Plan"), el("p", "plan-name", view.badge));
  const art = el("span", "plan-art");
  art.append(icon("card", 20));
  head.append(title, art);
  card.append(head);
  if (view.betaNote) card.append(el("p", "fine", view.betaNote));
  const rows = el("ul", "plan-rows");
  for (const row of view.rows) {
    const item = el("li");
    item.append(el("span", undefined, row.label), el("span", "plan-free", view.showCheckout ? row.free : row.pro));
    rows.append(item);
  }
  card.append(rows, el("p", "fine", `${view.priceLabel}. On-device explanations are unlimited on every plan.`), ...extras);
  return card;
}

export function row(iconName: IconName, label: string, run: () => void): HTMLButtonElement {
  const button = labelledButton(iconName, label, "row-btn");
  button.addEventListener("click", run);
  return button;
}

/* ---------- onboarding ---------- */

const ONBOARDING: { icon: IconName; title: string; body: string; light?: "grey" | "green" | "red" }[] = [
  {
    icon: "sparkle",
    title: "Understand the move, not a tip",
    body: "ATLAS Explain turns trading jargon and market moves into plain language. It is education only, never a trade instruction.",
  },
  {
    icon: "signal",
    title: "An honest three-colour light",
    body: "Green: the model leans up. Red: it leans down. Grey: not enough evidence. Grey is the default until paper results clear the gate.",
    light: "grey",
  },
  {
    icon: "shield",
    title: "Private by design",
    body: "Only the text you highlight, the page title, and the site name are used. Never balances, account numbers, or form fields. On-device AI runs first.",
  },
];

export function onboarding(onDone: () => void): HTMLElement {
  const wrap = el("div", "onboarding");
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.setAttribute("aria-label", "Welcome to ATLAS Explain");
  const slide = el("div", "ob-slide");
  slide.setAttribute("aria-live", "polite");
  const dots = el("div", "ob-dots");
  dots.setAttribute("aria-hidden", "true");
  const skip = el("button", "link-btn ob-skip", "Skip");
  skip.type = "button";
  const next = labelledButton("chevron", "Next", "primary ob-next");
  skip.addEventListener("click", onDone);
  let index = 0;
  next.addEventListener("click", () => {
    if (index >= ONBOARDING.length - 1) onDone();
    else show(index + 1);
  });
  wrap.addEventListener("keydown", (event) => {
    if (event.key === "Escape") onDone();
  });
  const logo = document.createElement("img");
  logo.src = document.querySelector<HTMLImageElement>(".logo")?.src ?? "./logo.svg";
  logo.alt = "";
  logo.className = "ob-logo";
  logo.width = 44;
  logo.height = 44;
  const foot = el("div", "ob-foot");
  foot.append(skip, dots, next);
  wrap.append(logo, slide, foot);
  ONBOARDING.forEach(() => dots.append(el("span")));
  show(0);
  requestAnimationFrame(() => next.focus());
  return wrap;

  function show(at: number): void {
    index = at;
    const step = ONBOARDING[at];
    if (!step) return;
    const art = el("div", "ob-art");
    if (step.light) {
      for (const state of ["green", "red", "grey"] as const) {
        const dot = el("span", "ob-light");
        dot.dataset.state = state;
        art.append(dot);
      }
    } else {
      art.append(icon(step.icon, 28));
    }
    slide.replaceChildren(art, el("h2", "ob-title", step.title), el("p", "ob-body", step.body));
    replay(slide, "enter");
    [...dots.children].forEach((dot, i) => dot.classList.toggle("on", i === at));
    const label = next.querySelector("span");
    if (label) label.textContent = at === ONBOARDING.length - 1 ? "Get started" : "Next";
    skip.hidden = at === ONBOARDING.length - 1;
  }
}

export const ONBOARDING_STEPS = ONBOARDING.length;

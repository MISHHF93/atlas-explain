import { ALL_TERMS, TERM_GROUP_LABEL, searchTerms, type TermEntry } from "../core/terms";
import { el, labelledButton } from "./dom";
import { icon } from "./icons";

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
  for (const id of ["all", "orders", "market", "risk"] as const) {
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

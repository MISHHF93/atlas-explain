import { LEARN_PATH, learnProgress, learnTerms } from "../core/learn";
import type { TermEntry } from "../core/terms";
import { el, labelledButton } from "./dom";
import { icon } from "./icons";

/** Guided path through the glossary with on-device progress. */
export function learnCard(options: {
  learned: ReadonlySet<string>;
  onAsk: (term: TermEntry) => void;
  onMark: (term: TermEntry) => void;
  onReset: () => void;
}): HTMLElement {
  const progress = learnProgress(options.learned);
  const card = el("section", "card learn");
  card.setAttribute("aria-label", "Learn path");
  const head = el("div", "card-head");
  const title = el("h3", "card-title");
  title.append(icon("book", 16), el("span", undefined, "Learn path"));
  head.append(title, el("span", "fine", `${progress.done} of ${progress.total}`));
  const bar = el("div", "learn-bar");
  bar.setAttribute("role", "progressbar");
  bar.setAttribute("aria-valuemin", "0");
  bar.setAttribute("aria-valuemax", String(progress.total));
  bar.setAttribute("aria-valuenow", String(progress.done));
  bar.setAttribute("aria-label", "Terms learned");
  const fill = el("span", "learn-fill");
  fill.style.width = `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`;
  bar.append(fill);
  const steps = el("ol", "learn-steps");
  for (const step of LEARN_PATH) {
    const terms = learnTerms(step);
    const done = terms.filter((t) => options.learned.has(t.id)).length;
    const item = el("li", done === terms.length ? "learn-step done" : progress.next?.step.id === step.id ? "learn-step current" : "learn-step");
    item.append(el("span", "learn-dot"), el("span", undefined, step.title), el("span", "fine", `${done}/${terms.length}`));
    steps.append(item);
  }
  card.append(head, bar, steps);
  if (progress.next) {
    const { term, step } = progress.next;
    const lesson = el("div", "learn-lesson");
    lesson.append(el("p", "fine", `Next in “${step.title}”`), el("p", "learn-term", term.title), el("p", "term-body", term.summary));
    const actions = el("div", "button-row");
    const mark = labelledButton("check", "Got it", "primary");
    mark.addEventListener("click", () => options.onMark(term));
    const ask = labelledButton("sparkle", "Explain more", "secondary");
    ask.addEventListener("click", () => options.onAsk(term));
    actions.append(mark, ask);
    lesson.append(actions);
    card.append(lesson);
  } else {
    const doneLine = el("p", "fine", "Path complete. Every term stays in the list below.");
    const reset = labelledButton("refresh", "Start again", "link-btn");
    reset.addEventListener("click", options.onReset);
    card.append(doneLine, reset);
  }
  return card;
}

/**
 * The Learn section, built once for both surfaces: the learn path (progress kept on this
 * device) above the searchable glossary. Loaded on demand, because the glossary text is the
 * largest static part of the app and the popup has a strict size budget.
 *
 * Asking about a term explains it straight away on both surfaces: pressing "Explain this" is
 * the request, so nothing is sent without the reader asking.
 */
import { parseLearned } from "../core/learn";
import { relatedTerms } from "../core/related-terms";
import type { TermEntry } from "../core/terms";
import { glossaryPanel } from "./glossary-panel";
import { learnCard } from "./learn-card";

export { relatedTerms };

/** The one label for asking about a glossary term, everywhere. */
export const EXPLAIN_TERM_LABEL = "Explain this";

export function mountLearn(host: HTMLElement, deps: {
  /** Saved progress (term ids), as stored by `save`. */
  storedLearned: unknown;
  onAsk: (term: TermEntry) => void;
  /** Keep progress: the list of learned term ids. */
  save: (ids: string[]) => void;
  announce: (text: string) => void;
  /** Show only this many glossary terms until the reader searches, filters or asks for all. */
  initialCount?: number;
}): void {
  let learned = parseLearned(deps.storedLearned);
  const slot = document.createElement("div");
  const render = (): void => {
    slot.replaceChildren(learnCard({
      learned,
      onAsk: deps.onAsk,
      onMark: (term) => {
        learned = new Set([...learned, term.id]);
        deps.save([...learned]);
        render();
        deps.announce(`${term.title} marked as learned.`);
      },
      onReset: () => {
        learned = new Set();
        deps.save([]);
        render();
      },
    }));
  };
  render();
  host.replaceChildren(slot, glossaryPanel({ askLabel: EXPLAIN_TERM_LABEL, onAsk: deps.onAsk, initialCount: deps.initialCount }));
}

/**
 * The Learn section, built once for both surfaces: topics due for review, then the learn path
 * (progress kept on this device), above the searchable glossary. Loaded on demand, because the
 * glossary text is the largest static part of the app and the app has a strict first-load budget.
 *
 * Asking about a term explains it straight away on both surfaces: pressing "Explain this" is
 * the request, so nothing is sent without the reader asking.
 */
import { LEARN_PATH, learnTerms, parseLearned } from "../core/learn";
import { relatedTerms } from "../core/related-terms";
import { parseReview, startReview, type ReviewState } from "../core/review";
import type { TermEntry } from "../core/terms";
import { glossaryPanel } from "./glossary-panel";
import { learnCard } from "./learn-card";
import { reviewCard } from "./review-card";

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
  /** Saved review schedule, as stored by `saveReview` (src/core/review.ts). */
  storedReview?: unknown;
  saveReview?: (state: ReviewState) => void;
  now?: () => number;
}): void {
  const now = deps.now ?? Date.now;
  let learned = parseLearned(deps.storedLearned);
  let review = parseReview(deps.storedReview);
  /** A topic whose every term is learned starts its review schedule (1, 7, 28 days). */
  const startFinished = (): void => {
    let next = review;
    for (const step of LEARN_PATH) if (learnTerms(step).every((t) => learned.has(t.id))) next = startReview(next, step.id, now());
    if (next !== review) {
      review = next;
      deps.saveReview?.(review);
    }
  };
  startFinished();
  const slot = document.createElement("div");
  const render = (): void => {
    const due = reviewCard({
      review,
      now: now(),
      onDone: (next, line) => {
        review = next;
        deps.saveReview?.(review);
        render();
        deps.announce(line);
      },
    });
    const path = learnCard({
      learned,
      onAsk: deps.onAsk,
      onMark: (term) => {
        learned = new Set([...learned, term.id]);
        deps.save([...learned]);
        startFinished();
        render();
        deps.announce(`${term.title} marked as learned.`);
      },
      onReset: () => {
        learned = new Set();
        deps.save([]);
        render();
      },
    });
    slot.replaceChildren(...(due ? [due] : []), path);
  };
  render();
  host.replaceChildren(slot, glossaryPanel({ askLabel: EXPLAIN_TERM_LABEL, onAsk: deps.onAsk, initialCount: deps.initialCount }));
}

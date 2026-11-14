/**
 * The popup's Learn tab and the glossary-based "related terms" chips, loaded on demand.
 * The glossary text is the largest static part of the popup, so it stays out of popup.js:
 * this chunk loads when Learn first opens, or quietly once the popup is idle.
 */
import { LEARN_KEY, parseLearned } from "../../src/core/learn";
import { relatedTerms } from "../../src/core/related-terms";
import type { TermEntry } from "../../src/core/terms";
import { glossaryPanel } from "../../src/wallet/glossary-panel";
import { learnCard } from "../../src/wallet/learn-card";

export { relatedTerms };

export function mountLearn(host: HTMLElement, deps: {
  storedLearned: unknown;
  onAsk: (term: TermEntry) => void;
  save: (patch: Record<string, unknown>) => void;
  announce: (text: string) => void;
}): void {
  let learned = parseLearned(deps.storedLearned);
  const slot = document.createElement("div");
  const render = (): void => {
    slot.replaceChildren(learnCard({
      learned,
      onAsk: deps.onAsk,
      onMark: (term) => {
        learned = new Set([...learned, term.id]);
        deps.save({ [LEARN_KEY]: [...learned] });
        render();
        deps.announce(`${term.title} marked as learned.`);
      },
      onReset: () => {
        learned = new Set();
        deps.save({ [LEARN_KEY]: [] });
        render();
      },
    }));
  };
  render();
  host.replaceChildren(slot, glossaryPanel({ askLabel: "Explain in more depth", onAsk: deps.onAsk }));
}

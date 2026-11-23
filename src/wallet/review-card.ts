import { LEARN_PATH, learnTerms } from "../core/learn";
import { checkQuestions, dueTopics, nextReview, passMark, recordCheck, REVIEW_DAYS, type ReviewState } from "../core/review";
import { el, labelledButton } from "./dom";
import { icon } from "./icons";

/**
 * "Due for review": a finished topic comes back after 1, 7 and 28 days for three quick questions
 * from the glossary (src/core/review.ts). Shown above the learn path once any topic is finished.
 */
export function reviewCard(options: {
  review: ReviewState;
  now: number;
  /** Keep the new schedule after a check. */
  onDone: (next: ReviewState, line: string) => void;
}): HTMLElement | null {
  const due = dueTopics(options.review, options.now);
  const upcoming = nextReview(options.review, options.now);
  if (!due.length && !upcoming) return null;
  const card = el("section", "card review");
  card.setAttribute("aria-label", "Due for review");
  const head = el("div", "card-head");
  const title = el("h3", "card-title");
  title.append(icon("refresh", 16), el("span", undefined, due.length ? "Due for review" : "Review"));
  head.append(title, el("span", "fine", due.length ? `${due.length} ${due.length === 1 ? "topic" : "topics"}` : ""));
  card.append(head);
  if (!due.length) {
    card.append(el("p", "fine", `Nothing due. Next: “${upcoming!.step.title}” on ${new Date(upcoming!.due).toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`));
    return card;
  }
  const body = el("div", "review-body");
  const intro = (): void => {
    const step = due[0]!;
    const lead = el("p", "term-body", `“${step.title}” is due: three quick questions from the glossary. Going over a topic again after ${REVIEW_DAYS.join(", then ")} days is what makes it stick.`);
    const start = labelledButton("check", "Check yourself", "primary");
    start.addEventListener("click", () => run(step.id));
    body.replaceChildren(lead, start);
  };
  const run = (topic: string): void => {
    const step = LEARN_PATH.find((s) => s.id === topic)!;
    const terms = learnTerms(step);
    const questions = checkQuestions(topic, Math.floor(options.now % 1_000_000_007));
    let i = 0;
    let right = 0;
    const show = (): void => {
      const q = questions[i]!;
      const opts = el("div", "review-options");
      const feedback = el("p", "term-body");
      feedback.setAttribute("aria-live", "polite");
      const next = el("div", "button-row");
      for (const o of q.options) {
        const b = el("button", "review-option", o.title);
        b.type = "button";
        b.dataset.id = o.id;
        b.addEventListener("click", () => {
          const ok = o.id === q.answerId;
          if (ok) right += 1;
          for (const x of opts.querySelectorAll("button")) {
            x.disabled = true;
            if (x.dataset.id === q.answerId) x.classList.add("right");
          }
          if (!ok) b.classList.add("wrong");
          const term = terms.find((t) => t.id === q.answerId)!;
          feedback.textContent = `${ok ? "Right." : `Not quite: it's ${term.title}.`} ${term.summary}`;
          const more = labelledButton("chevron", i + 1 < questions.length ? "Next question" : "See how I did", "primary");
          more.addEventListener("click", () => {
            i += 1;
            if (i < questions.length) show();
            else finish();
          });
          next.replaceChildren(more);
        });
        opts.append(b);
      }
      body.replaceChildren(el("p", "fine", `Question ${i + 1} of ${questions.length}: which term is this?`), el("p", "review-q", q.prompt), opts, feedback, next);
    };
    const finish = (): void => {
      const state = recordCheck(options.review, topic, right, questions.length, Date.now());
      const s = state[topic]!;
      const passed = right >= passMark(questions.length);
      const when = s.due ? new Date(s.due).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null;
      const line = `${right} of ${questions.length} right on “${step.title}”. ` + (passed ? (when ? `Next review ${when}.` : "Every review done: it's kept.") : "It comes back tomorrow to try again.");
      options.onDone(state, line);
    };
    show();
  };
  intro();
  card.append(body);
  return card;
}

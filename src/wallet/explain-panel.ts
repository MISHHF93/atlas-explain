/**
 * The Explain panel, built once for both surfaces: the box, the button, where answers run,
 * progress, the answer with its follow-ups and related terms, errors, and recent explanations.
 *
 * A surface supplies only `ask`: how it gets an answer. The extension popup reads the page
 * highlight, tries Gemini Nano and falls back to the cloud bridge; the web app calls its
 * backend. Everything the reader sees and does is the same code.
 */
import { composerAction } from "../core/composer";
import { EXTENSION_DISCLAIMER } from "../core/extension-prompt";
import { FOLLOW_UPS, followUpQuestion } from "../core/follow-ups";
import { makeEntry, addToHistory, type HistoryEntry } from "../core/history";
import { parseTwoSided, twoSidedCopyText } from "../core/two-sided";
import { emptyCard, explanationCard, limitCard, loadingCard, messageCard, offlineCard } from "./cards";
import { el, labelledButton, prefersReducedMotion } from "./dom";
import { engineStrip, type EngineStripHandle } from "./engine";
import { historyCard } from "./history-learn";
import { icon } from "./icons";
import { twoSidedNodes } from "./two-sided";

export type AnswerSource = "on_device" | "in_cloud" | "unknown";

export interface ExplainRequest {
  /** What to explain: the typed text, or the topic of a follow-up. Empty when the page highlight should be read. */
  text: string;
  /** A follow-up question about `text`. Empty for a first ask. */
  question: string;
  /** Read the highlighted text from the page (extension only). */
  fromPage: boolean;
  /** Where the text came from, when the surface already knows (the right-click menu). */
  page?: { title: string; url: string };
  /** Report the stage: 0 reading, 1 first attempt, 2 second attempt; with an optional line of detail. */
  progress: (step: 0 | 1 | 2, message?: string) => void;
  /** Show what is being explained in the box (the highlight, once it has been read). */
  setSubject: (text: string) => void;
}

export type ExplainOutcome =
  | { kind: "answer"; rawText: string; source: AnswerSource; subject: string; contextLine?: string; notes?: string[] }
  /** Nothing to explain, for example no highlight on the page. */
  | { kind: "nothing"; message: string }
  | { kind: "limit"; message: string }
  | { kind: "offline" }
  | { kind: "error"; title?: string; message: string; retry: boolean; onRetry?: () => void };

export interface ExplainPanelOptions {
  ask: (request: ExplainRequest) => Promise<ExplainOutcome>;
  /** The main button reads the page highlight while the box is empty (extension). */
  readsPage: boolean;
  placeholder: string;
  /** The quiet line shown where the answer will appear. */
  hint: string;
  rows?: number;
  maxLength?: number;
  /** Terms offered as one-tap examples under the box. */
  examples?: readonly string[];
  /** The three progress labels. Defaults to reading, on-device, cloud. */
  steps?: [string, string, string];
  /** Hide the "Explain" title visually (the popup's tab already says it). */
  headHidden?: boolean;
  history: { initial: HistoryEntry[]; save: (list: HistoryEntry[]) => void; limit: number };
  relatedTerms: (text: string, topic: string) => { title: string }[];
  announce: (text: string) => void;
  onAnswered?: (info: { source: AnswerSource; followUp: boolean }) => void;
}

export type ExplainAsk = (request: ExplainRequest) => Promise<ExplainOutcome>;

export interface ExplainRunOptions {
  /**
   * Get this answer another way (the web app's market-move card). Follow-ups and Try again
   * keep using it, so a follow-up about a move stays about that move.
   */
  ask?: ExplainAsk;
  fromPage?: boolean;
  page?: { title: string; url: string };
  /** Explain this instead of what is in the box (follow-ups). */
  subject?: string;
  question?: string;
}

export interface ExplainPanelHandle {
  head: HTMLElement;
  composer: HTMLElement;
  engine: EngineStripHandle;
  examples: HTMLElement | null;
  status: HTMLElement;
  result: HTMLElement;
  history: HTMLElement;
  input: HTMLTextAreaElement;
  /** Put text in the box without asking. `note` says what happened ("Added to Explain…"). */
  setText: (text: string, note?: string) => void;
  /** Put text in the box and ask. */
  explain: (text: string) => void;
  run: (options?: ExplainRunOptions) => Promise<void>;
  setHistory: (list: HistoryEntry[]) => void;
  /** Show an outcome directly (reopened history, screenshots). `remember` also adds an answer to Recent. */
  show: (outcome: ExplainOutcome, remember?: boolean) => void;
  showLoading: (step: 0 | 1 | 2) => void;
  /** Switch asking off, with an optional card that says why. */
  disable: (card?: HTMLElement) => void;
  focus: () => void;
}

const WHERE_IT_RAN: Record<AnswerSource, string> = {
  on_device: "Answered on your device with Gemini Nano. Nothing was sent.",
  in_cloud: "Answered in the cloud with Gemini.",
  unknown: "Where this answer ran was not reported.",
};

export function explainPanel(options: ExplainPanelOptions): ExplainPanelHandle {
  const head = el("div", options.headHidden ? "panel-title sr-only" : "panel-title");
  head.append(el("h1", undefined, "Explain"), el("span", "fine", "Education only"));

  const input = document.createElement("textarea");
  input.id = "explain-text";
  input.rows = options.rows ?? 2;
  if (options.maxLength) input.maxLength = options.maxLength;
  input.autocomplete = "off";
  input.placeholder = options.placeholder;
  input.setAttribute("aria-label", "Term or text to explain");
  // One primary action. On the extension it reads the highlight while the box is empty.
  const button = labelledButton("sparkle", "Explain", "primary composer-go");
  const composer = el("section", "composer");
  composer.setAttribute("aria-label", "Ask Explain");
  composer.append(input, button);

  const engine = engineStrip({ compact: true });

  let examples: HTMLElement | null = null;
  if (options.examples?.length) {
    examples = el("div", "samples");
    examples.setAttribute("role", "group");
    examples.setAttribute("aria-label", "Try an example");
    for (const term of options.examples) {
      const chip = el("button", "chip", term);
      chip.type = "button";
      chip.addEventListener("click", () => explain(term));
      examples.append(chip);
    }
  }

  const status = el("p", "fine");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const result = el("div", "stack result");
  result.setAttribute("aria-live", "polite");
  const historySlot = el("div");

  let entries: HistoryEntry[] = options.history.initial;
  let busy = false;
  let disabled = false;
  let last: ExplainRunOptions = {};
  /** The way the answer on screen was asked, reused by its follow-ups. */
  let lastAsk: ExplainAsk = options.ask;

  function sync(): void {
    const action = options.readsPage ? composerAction(input.value) : { mode: "typed" as const, label: "Explain", icon: "sparkle" as const };
    button.dataset.mode = action.mode;
    button.replaceChildren(icon(action.icon, 16), el("span", undefined, action.label));
  }

  function hintLine(): HTMLElement {
    return el("p", "state-empty composer-hint", options.hint);
  }

  function showCard(card: HTMLElement): void {
    card.classList.add("enter");
    result.replaceChildren(card);
    if (!card.classList.contains("state-empty")) {
      requestAnimationFrame(() => card.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" }));
    }
  }

  function setBusy(next: boolean): void {
    busy = next;
    result.setAttribute("aria-busy", next ? "true" : "false");
    button.disabled = next || disabled;
    button.classList.toggle("loading", next);
  }

  function renderHistory(): void {
    historySlot.replaceChildren(historyCard({
      entries,
      limit: options.history.limit,
      onOpen: (entry) => {
        setText(entry.selection);
        show({ kind: "answer", rawText: entry.text, source: entry.source, subject: entry.selection, contextLine: entry.contextLine });
      },
      onRemove: (entry) => {
        entries = entries.filter((item) => item.id !== entry.id);
        options.history.save(entries);
        renderHistory();
      },
      onClear: () => {
        entries = [];
        options.history.save(entries);
        renderHistory();
        options.announce("Recent explanations cleared.");
      },
    }));
  }

  function remember(outcome: Extract<ExplainOutcome, { kind: "answer" }>): void {
    entries = addToHistory(entries, makeEntry({ selection: outcome.subject, text: outcome.rawText, source: outcome.source, contextLine: outcome.contextLine }));
    options.history.save(entries);
    renderHistory();
  }

  function showAnswer(outcome: Extract<ExplainOutcome, { kind: "answer" }>): void {
    // Two sides when the model kept the shape; its plain text otherwise.
    const twoSided = parseTwoSided(outcome.rawText);
    const plain = outcome.rawText.trim();
    const subject = outcome.subject.trim();
    // Plain answers sometimes end with the education line already; never show it twice.
    const carriesDisclaimer = !twoSided && plain.includes(EXTENSION_DISCLAIMER);
    showCard(explanationCard({
      source: outcome.source,
      selection: outcome.subject,
      contextLine: outcome.contextLine,
      ...(twoSided ? { body: twoSidedNodes(twoSided) } : { text: plain }),
      copyText: twoSided ? twoSidedCopyText(twoSided, EXTENSION_DISCLAIMER) : carriesDisclaimer ? plain : `${plain}\n\n${EXTENSION_DISCLAIMER}`,
      notes: [...(outcome.notes ?? []), WHERE_IT_RAN[outcome.source], ...(carriesDisclaimer ? [] : [EXTENSION_DISCLAIMER])],
      onClear: () => {
        showCard(hintLine());
        button.focus();
      },
      // Follow-ups re-ask about the same topic; related chips explain a glossary term found in the answer.
      ...(subject
        ? {
            followUps: FOLLOW_UPS.map((item) => ({ label: item.label, run: () => void run({ subject, question: followUpQuestion(item.kind, subject), ask: lastAsk }) })),
            related: options.relatedTerms(`${subject}\n${plain}`, subject).map((term) => ({ title: term.title, run: () => explain(term.title) })),
          }
        : {}),
    }));
    options.announce("Explanation ready.");
  }

  function show(outcome: ExplainOutcome, alsoRemember = false): void {
    if (outcome.kind === "answer") {
      if (alsoRemember) remember(outcome);
      showAnswer(outcome);
    } else if (outcome.kind === "nothing") {
      showCard(emptyCard(outcome.message));
      input.focus();
    } else if (outcome.kind === "limit") {
      showCard(limitCard(outcome.message));
    } else if (outcome.kind === "offline") {
      showCard(offlineCard(() => void run(last)));
    } else {
      const retry = outcome.retry ? outcome.onRetry ?? (() => void run(last)) : undefined;
      showCard(messageCard("error", outcome.title ?? "That did not work", outcome.message, retry));
    }
  }

  async function run(runOptions: ExplainRunOptions = {}): Promise<void> {
    if (busy || disabled) return;
    const fromPage = runOptions.fromPage === true;
    const text = (runOptions.subject ?? input.value).trim();
    if (!text && !fromPage) {
      status.textContent = "Paste or type a term, a sentence or a headline first.";
      input.focus();
      return;
    }
    last = runOptions;
    const ask = runOptions.ask ?? options.ask;
    lastAsk = ask;
    const followUp = Boolean(runOptions.question);
    setBusy(true);
    status.textContent = "";
    showCard(loadingCard(0, options.steps));
    let outcome: ExplainOutcome;
    try {
      outcome = await ask({
        text,
        question: runOptions.question ?? "",
        fromPage,
        page: runOptions.page,
        progress: (step, message) => {
          showCard(loadingCard(step, options.steps));
          status.textContent = message ?? "";
        },
        setSubject: (subject) => setText(subject),
      });
    } catch (error) {
      outcome = { kind: "error", message: error instanceof Error && error.message ? error.message : "That did not finish. Try again.", retry: true };
    }
    setBusy(false);
    status.textContent = "";
    if (outcome.kind === "answer") {
      engine.markRun(outcome.source);
      options.onAnswered?.({ source: outcome.source, followUp });
    }
    // A follow-up refines the answer on screen; only the first ask is kept in Recent.
    show(outcome, outcome.kind === "answer" && !followUp);
  }

  function setText(text: string, note?: string): void {
    input.value = text;
    sync();
    if (note !== undefined) status.textContent = note;
  }

  function explain(text: string): void {
    setText(text);
    void run();
  }

  input.addEventListener("input", sync);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && input.value.trim()) {
      event.preventDefault();
      void run();
    }
  });
  button.addEventListener("click", () => void run(options.readsPage && !input.value.trim() ? { fromPage: true } : {}));

  sync();
  showCard(hintLine());
  renderHistory();

  return {
    head,
    composer,
    engine,
    examples,
    status,
    result,
    history: historySlot,
    input,
    setText,
    explain,
    run,
    setHistory: (list) => {
      entries = list;
      renderHistory();
    },
    show,
    showLoading: (step) => showCard(loadingCard(step, options.steps)),
    disable: (card) => {
      disabled = true;
      button.disabled = true;
      if (card) result.replaceChildren(card);
    },
    focus: () => button.focus(),
  };
}

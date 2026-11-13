import { applyPrivateFields, parseMoveCardJson } from "../core/move-card";
import { buildPrompt } from "../core/prompt";
import { describePathReason, selectInferencePath } from "../core/inference-path";
import { hasPrivateContext } from "../core/move-card";
import { SAMPLE_MOVES, type SampleMove } from "../core/samples";
import { DEFAULT_SETTINGS } from "../core/settings";
import type { AppSettings, ExplanationRun, MoveCard } from "../core/types";
import { CloudAllowanceUsed, WatchlistAllowance, pricingView } from "../core/billing";
import { OnDeviceUnavailableError } from "../core/run-explanation";
import { ExplanationParseError } from "../core/parse-explanation";
import type { WebBackend } from "../platform/web/backend";
import { h } from "./dom";
import { fillPricingDialog } from "./pricing";
import { brand, disclaimer } from "./setup";

export function mountDesk(root: HTMLElement, backend: WebBackend): void {
  root.replaceChildren();

  const cardInput = h("textarea", {
    className: "editor",
    attrs: {
      id: "move-card",
      spellcheck: "false",
      "aria-describedby": "card-help",
    },
  });
  cardInput.rows = 16;
  cardInput.value = JSON.stringify(SAMPLE_MOVES[0]?.card ?? {}, null, 2);

  const questionInput = h("input", {
    attrs: { id: "question", type: "text", maxlength: "600", autocomplete: "off" },
  });
  questionInput.placeholder = "Why might some traders buy this dip while others sell?";

  const notesInput = h("textarea", { attrs: { id: "notes" } });
  notesInput.rows = 3;
  notesInput.placeholder = "Kept on this device when the on-device model runs. Omitted from cloud calls and from Firestore.";

  const watchlistInput = h("input", {
    attrs: { id: "watchlist", type: "text", autocomplete: "off" },
  });
  watchlistInput.placeholder = "AMD, AVGO";

  const sampleNote = h("div", { className: "sample-note", attrs: { id: "sample-note" } });
  const errors = h("ul", { className: "errors", attrs: { id: "errors" } });
  const status = h("p", { className: "status", attrs: { id: "status", role: "status", "aria-live": "polite" } });
  const result = h("div", { className: "result", attrs: { id: "result" } });
  const preview = h("pre", { className: "prompt", attrs: { id: "prompt-preview" } });
  const historyList = h("ul", { className: "history", attrs: { id: "history" } });
  const historyNote = h("p", { className: "fine", attrs: { id: "history-note" } });
  const settingsNote = h("p", { className: "fine", attrs: { id: "settings-note" }, text: "Loading Remote Config…" });

  const explainButton = h("button", {
    className: "primary",
    attrs: { type: "button", id: "explain" },
    text: "Explain the move",
  });
  const previewButton = h("button", {
    className: "secondary",
    attrs: { type: "button", id: "preview" },
    text: "Preview prompt",
  });
  const pricingButton = h("button", {
    className: "badge",
    attrs: { type: "button", id: "pricing-badge" },
    text: "Free during beta",
  });
  const pricingDialog = h("dialog", { attrs: { id: "pricing", "aria-labelledby": "pricing-title" } });
  pricingButton.addEventListener("click", () => {
    void openPricing();
  });

  const refreshButton = h("button", {
    className: "secondary",
    attrs: { type: "button", id: "refresh-history" },
    text: "Refresh saved explanations",
  });

  const sampleButtons = SAMPLE_MOVES.map((sample) => {
    const button = h("button", {
      className: "chip",
      attrs: { type: "button" },
      text: sample.title,
    });
    button.addEventListener("click", () => {
      cardInput.value = JSON.stringify(sample.card, null, 2);
      showSample(sampleNote, sample);
      errors.replaceChildren();
      cardInput.removeAttribute("aria-invalid");
    });
    return button;
  });

  showSample(sampleNote, SAMPLE_MOVES[0]);

  explainButton.addEventListener("click", () => {
    void onExplain();
  });
  previewButton.addEventListener("click", () => {
    void onPreview();
  });
  refreshButton.addEventListener("click", () => {
    void loadHistory();
  });

  root.append(
    h("header", { className: "top" },
      h("div", { className: "top-row" },
        brand(),
        h("nav", { className: "top-actions", attrs: { "aria-label": "Account" } },
          pricingButton,
          h("a", { attrs: { href: "#/terms" }, text: "Terms" }),
          h("a", { attrs: { href: "#/privacy" }, text: "Privacy" }),
        ),
      ),
      disclaimer(),
    ),
    h(
      "main",
      { className: "wrap", attrs: { id: "main" } },
      settingsNote,
      h("div", { className: "layout" },
        h("section", { className: "panel", attrs: { "aria-labelledby": "card-heading" } },
          h("h2", { attrs: { id: "card-heading" }, text: "Move card" }),
          h("p", { className: "fine", attrs: { id: "card-help" }, text: "Paste your own JSON, or load an illustrative sample. Historical samples use rounded figures from public news reports. They are not a data feed." }),
          h("div", { className: "chips", attrs: { role: "group", "aria-label": "Sample move cards" } }, ...sampleButtons),
          h("label", { attrs: { for: "move-card" }, text: "Move card JSON" }),
          cardInput,
          sampleNote,
          errors,
          h("label", { attrs: { for: "question" }, text: "Question (optional)" }),
          questionInput,
          h("details", {},
            h("summary", { text: "Private notes and watchlist" }),
            h("p", { className: "fine", text: "Included only when the on-device model runs. A cloud fallback, a long document, or a saved explanation drops them." }),
            h("label", { attrs: { for: "notes" }, text: "Notes" }),
            notesInput,
            h("label", { attrs: { for: "watchlist" }, text: "Watchlist symbols" }),
            watchlistInput,
          ),
          h("div", { className: "actions" }, previewButton, explainButton),
          status,
        ),
        h("section", { className: "panel", attrs: { "aria-labelledby": "result-heading" } },
          h("h2", { attrs: { id: "result-heading" }, text: "Explanation" }),
          h("p", { className: "fine", text: "Three reasons a buyer might see opportunity, three reasons a seller might see risk, and what would change the picture. The badge names the path that actually ran." }),
          result,
          h("details", { attrs: { id: "prompt-details" } },
            h("summary", { text: "Prompt that will be sent" }),
            preview,
          ),
        ),
      ),
      h("section", { className: "panel", attrs: { "aria-labelledby": "history-heading" } },
        h("div", { className: "row" },
          h("h2", { attrs: { id: "history-heading" }, text: "Saved explanations" }),
          refreshButton,
        ),
        historyNote,
        historyList,
      ),
    ),
    pricingDialog,
    h("footer", { className: "wrap foot" },
      h("p", { text: "ATLAS Explain is a public companion to a private research desk. This app contains none of that desk’s models or data. On-device inference needs Chrome on desktop, version 139 or newer, with the Prompt API flag enabled." }),
    ),
  );

  void backend.loadSettings().then(({ settings, warnings }) => {
    settingsNote.textContent = settingsLine(settings, warnings);
    pricingButton.textContent = pricingView({
      billingEnabled: settings.billingEnabled,
      plan: "free",
      freeCloudDailyLimit: settings.freeCloudDailyLimit,
    }).badge;
  }).catch(() => {
    settingsNote.textContent = "Remote Config could not be read. Built-in defaults will be used when you explain a move.";
  });

  void loadHistory();

  async function onPreview(): Promise<void> {
    const prepared = await prepareCard();
    if (!prepared.ok) {
      renderErrors(errors, cardInput, prepared.errors);
      return;
    }
    renderErrors(errors, cardInput, []);
    const settings = await safeSettings();
    const decision = decide(prepared.card, questionInput.value, settings);
    const built = buildPrompt({
      card: prepared.card,
      question: questionInput.value,
      template: settings.promptTemplate,
      topics: settings.topics,
      includePrivateContext: decision.includePrivateContext,
    });
    preview.textContent = `${decision.mode}\n${describePathReason(decision.reason)}\n\n${built.prompt}`;
    const promptDetails = document.querySelector("#prompt-details");
    if (promptDetails instanceof HTMLDetailsElement) promptDetails.open = true;
    status.textContent = "Prompt built on this device. Nothing was sent.";
  }

  async function onExplain(): Promise<void> {
    const prepared = await prepareCard();
    if (!prepared.ok) {
      renderErrors(errors, cardInput, prepared.errors);
      return;
    }
    renderErrors(errors, cardInput, []);
    explainButton.disabled = true;
    previewButton.disabled = true;
    status.textContent = "Checking the card and starting hybrid inference…";
    result.replaceChildren();
    try {
      const run = await backend.explain(prepared.card, questionInput.value, {
        onProgress(message) {
          status.textContent = message;
        },
      });
      renderRun(result, run);
      status.textContent = pathStatus(run);
      try {
        await backend.save(run, prepared.card, questionInput.value);
        historyNote.textContent = "Saved to your anonymous Firestore history.";
        await loadHistory();
      } catch (error) {
        historyNote.textContent = error instanceof Error ? error.message : "The explanation was not saved.";
      }
    } catch (error) {
      status.textContent = "";
      if (error instanceof CloudAllowanceUsed || error instanceof WatchlistAllowance) {
        result.replaceChildren(h("p", { className: "limit-note", attrs: { role: "status" }, text: error.message }));
      } else {
        result.replaceChildren(h("p", { className: "alert", attrs: { role: "alert" }, text: friendlyError(error) }));
      }
    } finally {
      explainButton.disabled = false;
      previewButton.disabled = false;
    }
  }

  async function prepareCard(): Promise<
    { ok: true; card: MoveCard } | { ok: false; errors: { path: string; message: string }[] }
  > {
    const parsed = parseMoveCardJson(cardInput.value);
    if (!parsed.ok) return parsed;
    const question = questionInput.value.trim();
    if (question.length > 600) {
      return { ok: false, errors: [{ path: "question", message: "Question must be 600 characters or fewer." }] };
    }
    const withPrivate = applyPrivateFields(parsed.card, notesInput.value, watchlistInput.value);
    if (withPrivate.errors.length > 0) return { ok: false, errors: withPrivate.errors };
    return { ok: true, card: withPrivate.card };
  }

  async function safeSettings(): Promise<AppSettings> {
    try {
      return (await backend.loadSettings()).settings;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  async function openPricing(): Promise<void> {
    let snapshot;
    try {
      snapshot = await backend.loadBilling();
    } catch {
      const settings = await safeSettings();
      snapshot = {
        billingEnabled: settings.billingEnabled,
        plan: "free" as const,
        cloudCallsToday: 0,
        entitlements: {
          cloudExplanationsPerDay: "unlimited" as const,
          watchlistSize: "unlimited" as const,
          dailyBrief: !settings.billingEnabled,
          extensionHighlightToExplain: !settings.billingEnabled,
          onDeviceExplanations: "unlimited" as const,
        },
        pricing: pricingView({
          billingEnabled: settings.billingEnabled,
          plan: "free",
          freeCloudDailyLimit: settings.freeCloudDailyLimit,
        }),
      };
    }
    fillPricingDialog(pricingDialog, snapshot, {
      onLink: () => backend.linkGoogle(),
      ...(snapshot.pricing.showCheckout ? { onCheckout: () => backend.startCheckout() } : {}),
    });
    if (!pricingDialog.open) pricingDialog.showModal();
  }

  async function loadHistory(): Promise<void> {
    try {
      const entries = await backend.list();
      historyList.replaceChildren();
      if (entries.length === 0) {
        historyNote.textContent = "No saved explanations yet. After a successful explanation, it appears here for this browser’s anonymous user.";
        return;
      }
      historyNote.textContent = "These stay in Firestore under your anonymous user id. Private notes are not stored.";
      for (const entry of entries) {
        const load = h("button", { className: "secondary", attrs: { type: "button" }, text: "Load card" });
        load.addEventListener("click", () => {
          if (entry.cardJson) {
            cardInput.value = pretty(entry.cardJson);
            sampleNote.replaceChildren(h("p", { text: "Loaded from your saved history. Notes were not stored." }));
          }
        });
        historyList.append(
          h("li", {},
            h("p", { className: "history-title", text: `${entry.symbol} ${formatPct(entry.movePct)} · ${sourceLabel(entry.inferenceSource)}` }),
            entry.createdAtLabel ? h("p", { className: "fine", text: entry.createdAtLabel }) : "",
            h("p", { text: entry.summary }),
            load,
          ),
        );
      }
    } catch (error) {
      historyNote.textContent = error instanceof Error ? error.message : "History could not be loaded.";
    }
  }
}

function decide(card: MoveCard, question: string, settings: AppSettings) {
  const topics = settings.topics;
  const hasPrivate = hasPrivateContext(card);
  const publicPrompt = buildPrompt({
    card,
    question,
    template: settings.promptTemplate,
    topics,
    includePrivateContext: false,
  });
  const privatePrompt = hasPrivate
    ? buildPrompt({
        card,
        question,
        template: settings.promptTemplate,
        topics,
        includePrivateContext: true,
      })
    : publicPrompt;
  return selectInferencePath({
    preference: settings.inferenceMode,
    headlineCount: card.headlines.length,
    documentChars: card.document?.length ?? 0,
    publicPromptChars: publicPrompt.charLength,
    privatePromptChars: privatePrompt.charLength,
    hasPrivateContext: hasPrivate,
    limits: {
      maxHeadlinesOnDevice: settings.maxHeadlinesOnDevice,
      maxCharsOnDevice: settings.maxCharsOnDevice,
      longDocumentChars: settings.longDocumentChars,
    },
  });
}

function renderRun(result: HTMLElement, run: ExplanationRun): void {
  const pathClass = run.inferenceSource === "on_device" ? "path path-device" : "path path-cloud";
  const topics = run.explanation.headlineTopics.map((item) =>
    h("li", {},
      h("span", { className: "topic", text: item.coerced ? `${item.topic} (mapped)` : item.topic }),
      h("p", { text: item.headline }),
      item.note ? h("p", { className: "fine", text: item.note }) : "",
    ),
  );

  result.replaceChildren(
    h("p", { className: "card-disclaimer", text: "Educational information, not investment advice." }),
    h("p", { className: pathClass, text: pathStatus(run) }),
    h("p", { className: "summary", text: run.explanation.summary }),
    h("div", { className: "cases" },
      h("section", {},
        h("h3", { text: "Why a buyer might see opportunity" }),
        h("ol", {}, ...run.explanation.buyerReasons.map((reason) => h("li", { text: reason }))),
      ),
      h("section", {},
        h("h3", { text: "Why a seller might see risk" }),
        h("ol", {}, ...run.explanation.sellerReasons.map((reason) => h("li", { text: reason }))),
      ),
    ),
    h("h3", { text: "What would change the picture" }),
    h("p", { text: run.explanation.whatWouldChange }),
    topics.length ? h("h3", { text: "Headline topics" }) : "",
    topics.length ? h("ul", { className: "topics" }, ...topics) : "",
    run.explanation.truncatedReasons
      ? h("p", { className: "fine", text: "The model returned more than three reasons. The first three are shown." })
      : "",
  );
}

function pathStatus(run: ExplanationRun): string {
  const where =
    run.inferenceSource === "on_device"
      ? "On-device. Gemini Nano via Firebase AI Logic ran in Chrome."
      : run.inferenceSource === "in_cloud"
        ? `Cloud. Gemini (${run.cloudModel}) via Firebase AI Logic answered.`
        : "The SDK did not report whether inference ran on-device or in the cloud.";
  const privacy = run.privateContextUsed
    ? " Your notes and watchlist were part of the on-device prompt and were not saved."
    : " Private notes and watchlist were not sent.";
  const fallback = run.fellBackToCloud
    ? " On-device inference was unavailable, so the cloud model ran without private notes."
    : "";
  return `${where}${fallback}${privacy} ${describePathReason(run.pathReason)}`;
}

function showSample(host: HTMLElement, sample: SampleMove | undefined): void {
  if (!sample) {
    host.replaceChildren();
    return;
  }
  const links = sample.sources.map((source) =>
    h("a", { attrs: { href: source.url, rel: "noreferrer", target: "_blank" }, text: source.label }),
  );
  const line = h("p", {});
  line.append(sample.kind === "historical" ? "Illustrative historical sample. " : "Not a historical record. ", sample.summary);
  host.replaceChildren(line);
  if (links.length > 0) {
    const list = h("ul", { className: "sources" });
    for (const link of links) list.append(h("li", {}, link));
    host.append(list);
  }
}

function renderErrors(
  list: HTMLElement,
  cardInput: HTMLTextAreaElement,
  items: { path: string; message: string }[],
): void {
  list.replaceChildren(
    ...items.map((item) => h("li", { text: `${item.path}: ${item.message}` })),
  );
  if (items.length > 0) {
    list.setAttribute("role", "alert");
    cardInput.setAttribute("aria-invalid", "true");
  } else {
    list.removeAttribute("role");
    cardInput.removeAttribute("aria-invalid");
  }
}

function settingsLine(settings: AppSettings, warnings: string[]): string {
  const base = `Remote Config inference preference: ${settings.inferenceMode}. Cloud model: ${settings.cloudModel}.`;
  if (warnings.length === 0) return base;
  return `${base} ${warnings.join(" ")}`;
}

function sourceLabel(source: string): string {
  if (source === "on_device") return "on-device";
  if (source === "in_cloud") return "cloud";
  return "path unknown";
}

function formatPct(value: number): string {
  const text = Number.isInteger(value) ? value.toString() : String(value);
  return value > 0 ? `+${text}%` : `${text}%`;
}

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function friendlyError(error: unknown): string {
  if (error instanceof ExplanationParseError) {
    console.error(error.rawText);
    return `${error.message} The raw model text is in the browser console.`;
  }
  const message = error instanceof Error ? error.message : "The explanation could not be completed.";
  if (/API key not valid|API_KEY_INVALID/i.test(message)) {
    return "Firebase AI Logic rejected the API key. Check the web app config in .env.local, and confirm AI Logic is enabled for this project.";
  }
  if (/app.?check|recaptcha|unauthenticated|permission-denied/i.test(message)) {
    return "App Check blocked the cloud model. On localhost the dev build sets self.FIREBASE_APPCHECK_DEBUG_TOKEN. Copy the debug token from the console and register it under App Check → Manage debug tokens, then reload.";
  }
  if (error instanceof OnDeviceUnavailableError) {
    return `${message} Use Chrome on desktop (version 139 or newer) and enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input. With no private notes, prefer_on_device can fall back to the cloud.`;
  }
  return message.length > 500 ? `${message.slice(0, 500)}…` : message;
}

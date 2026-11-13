import { CloudAllowanceUsed, WatchlistAllowance, pricingActions, pricingView, type BillingSnapshot } from "../core/billing";
import { parseContextHash, type ParsedContextLink } from "../core/context-link";
import { conceptQuestion, getConcept, isGlossaryId } from "../core/glossary";
import { EXPLAIN_LOAD_MESSAGE, inboundReply, readInboundMessage } from "../core/inbound";
import { describePathReason, selectInferencePath } from "../core/inference-path";
import { applyPrivateFields, hasPrivateContext, parseMoveCardJson, publicMoveCard } from "../core/move-card";
import { ExplanationParseError } from "../core/parse-explanation";
import { ATLAS_DESK_URL } from "../core/popup-copy";
import { buildPrompt } from "../core/prompt";
import { OnDeviceUnavailableError } from "../core/run-explanation";
import { SAMPLE_MOVES, type SampleMove } from "../core/samples";
import { DEFAULT_SETTINGS } from "../core/settings";
import { mapSignal, readPublicSignal, type SignalView } from "../core/signal";
import type { AppSettings, ExplanationRun, MoveCard } from "../core/types";
import type { HistoryEntry, WebBackend } from "../platform/web/backend";
import type { PublicEnvConfig } from "../platform/web/env";
import {
  emptyCard,
  explanationCard,
  glossaryPanel,
  group,
  limitCard,
  loadingCard,
  messageCard,
  onboarding,
  planCard,
  row,
  signalCard,
  themePicker,
} from "../wallet/cards";
import { el, labelledButton, prefersReducedMotion } from "../wallet/dom";
import { icon } from "../wallet/icons";
import { extensionNodes, privacyNodes, termsNodes } from "../wallet/legal";
import { canReachLocalAtlas } from "../core/assets";
import { loadDigest, todayToronto } from "../core/digest";
import { digestCard } from "../wallet/digest";
import { mountAssets } from "../wallet/assets-controller";
import { applyTheme, createWalletShell, isTheme, type ThemeChoice } from "../wallet/shell";
import { twoSidedNodes } from "../wallet/two-sided";

const THEME_KEY = "atlas-explain-theme";
const ONBOARDED_KEY = "atlas-explain-onboarded";
const QUESTION_PLACEHOLDER = "What might different traders read into this move?";
const STEP_LABELS: [string, string, string] = ["Checking the card", "Running hybrid inference", "Saving to your history"];

export interface WebWalletOptions {
  env: PublicEnvConfig;
  startBackend: () => Promise<WebBackend>;
}

/** The hosted ATLAS Explain app: the same wallet frame as the extension, centred on the page. */
export function mountWebWallet(host: HTMLElement, options: WebWalletOptions): void {
  host.replaceChildren();
  const preview = new URLSearchParams(location.search);
  let backend: WebBackend | null = null;
  let backendError: string | null = null;

  const shell = createWalletShell({
    host,
    surface: "web",
    menu: [
      { label: "How ATLAS Explain works", icon: "help", run: () => showOnboarding() },
      { label: "Get the Chrome extension", icon: "panel", run: () => shell.openSheet("Chrome extension", extensionNodes()) },
      { label: "Open the ATLAS desk", icon: "external", run: () => window.open(ATLAS_DESK_URL, "_blank", "noreferrer") },
      { label: "Terms", icon: "doc", run: () => openLegal("terms") },
      { label: "Privacy", icon: "shield", run: () => openLegal("privacy") },
    ],
  });

  /* ---------- Explain tab ---------- */

  const cardInput = el("textarea", "code");
  cardInput.id = "move-card";
  cardInput.spellcheck = false;
  cardInput.setAttribute("aria-label", "Move card JSON");
  cardInput.value = JSON.stringify(SAMPLE_MOVES[0]?.card ?? {}, null, 2);
  const questionInput = el("input");
  questionInput.type = "text";
  questionInput.id = "question";
  questionInput.maxLength = 600;
  questionInput.autocomplete = "off";
  questionInput.placeholder = QUESTION_PLACEHOLDER;
  questionInput.setAttribute("aria-label", "Question (optional)");
  const notesInput = el("textarea");
  notesInput.id = "notes";
  notesInput.rows = 2;
  notesInput.placeholder = "Kept on this device when the on-device model runs. Never sent to the cloud or saved.";
  const watchlistInput = el("input");
  watchlistInput.type = "text";
  watchlistInput.id = "watchlist";
  watchlistInput.autocomplete = "off";
  watchlistInput.placeholder = "AMD, AVGO";

  const fromDesk = el("p", "from-desk");
  fromDesk.hidden = true;
  const moveSlot = el("div");
  const sampleNote = el("p", "fine");
  const errors = el("ul", "errors");
  const status = el("p", "fine");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  const result = el("div", "stack");
  result.setAttribute("aria-live", "polite");
  const promptPreview = el("pre", "prompt-preview");
  const promptBox = disclosure("Prompt that will be sent", [promptPreview]);
  promptBox.hidden = true;

  const sampleRow = el("div", "samples");
  sampleRow.setAttribute("role", "group");
  sampleRow.setAttribute("aria-label", "Sample move cards");
  const sampleButtons = SAMPLE_MOVES.map((sample) => {
    const button = el("button", "chip", sample.title);
    button.type = "button";
    button.setAttribute("aria-pressed", "false");
    button.addEventListener("click", () => loadSample(sample));
    sampleRow.append(button);
    return button;
  });

  const explainButton = labelledButton("sparkle", "Explain the move", "primary");
  const previewButton = labelledButton("doc", "Preview prompt", "secondary");
  const actions = el("div", "button-row");
  actions.append(explainButton, previewButton);

  const historyList = el("ul", "history");
  const historyNote = el("p", "fine");
  const recent = el("section", "stack");
  const recentHead = el("div", "panel-title");
  const refreshHistory = el("button", "link-btn", "Refresh");
  refreshHistory.type = "button";
  refreshHistory.addEventListener("click", () => void loadHistory());
  recentHead.append(el("h2", "card-title", "Recent explanations"), refreshHistory);
  recent.append(recentHead, historyNote, historyList);

  const explainHead = el("div", "panel-title");
  explainHead.append(el("h1", undefined, "Explain a move"), el("span", "fine", "Education only"));
  const brief = digestCard();
  void (canReachLocalAtlas(location, false)
    ? loadDigest()
    : Promise.resolve({ kind: "not_connected" as const, today: todayToronto(), reason: "Today's digest is not ready yet. Open ATLAS on this computer to load today's digest." })
  ).then((v) => brief.show(v));

  shell.panels.explain.append(
    explainHead,
    brief.node,
    fromDesk,
    moveSlot,
    sampleRow,
    sampleNote,
    questionInput,
    disclosure("Edit the move card (JSON)", [el("p", "fine", "Paste your own figures, or start from a sample. Samples use rounded figures from public news reports. They are not a data feed."), cardInput, errors]),
    disclosure("Private notes and watchlist", [
      el("p", "fine", "Included only when the on-device model runs. A cloud fallback or a saved explanation drops them."),
      fieldLabel("notes", "Notes"),
      notesInput,
      fieldLabel("watchlist", "Watchlist symbols"),
      watchlistInput,
    ]),
    actions,
    status,
    result,
    promptBox,
    recent,
  );

  /* ---------- Signal tab ---------- */

  const signal = signalCard({
    onWhy: () => openLegal("signal"),
    deskHint: "The live light is read by the Chrome extension on the ATLAS desk. Here it stays grey unless the desk sends its public signal.",
  });
  const signalHead = el("div", "panel-title");
  signalHead.append(el("h1", undefined, "Signal"), el("span", "fine", "Paper only"));
  const getExtension = row("panel", "Get the Chrome extension", () => shell.openSheet("Chrome extension", extensionNodes()));
  shell.panels.signal.append(signalHead, signal.node, getExtension);

  /* ---------- Assets tab ---------- */

  // The hosted app cannot read ATLAS on the visitor's computer, so it shows the honest
  // "Connect ATLAS" state and never calls localhost. A local dev build may read it.
  let assets: ReturnType<typeof mountAssets> | null = null;
  async function startAssets(): Promise<void> {
    const mode = preview.get("assets");
    const data = mode ? (await import("../wallet/box-preview.json")).default : null;
    assets = mountAssets({
      shell,
      canReachAtlas: canReachLocalAtlas(location, false),
      preview: data
        ? {
            label: mode === "box"
              ? `Box preview: real Kraken and IEX bars run through the ATLAS route on the build box (${data.capturedAt.slice(0, 16).replace("T", " ")} UTC), not your computer.`
              : "Preview of the state shown when ATLAS is not reachable.",
            list: data.list,
            details: data.details,
            state: mode === "box" ? "ready" : mode === "hosted" ? "hosted" : "not_connected",
          }
        : undefined,
      onExplain: (text) => {
        questionInput.value = text;
        shell.select("explain");
        questionInput.focus();
      },
    });
    await assets.refresh();
    const sheet = preview.get("asset");
    if (sheet) await assets.open(sheet);
  }

  /* ---------- Glossary tab ---------- */

  const glossaryHead = el("div", "panel-title");
  glossaryHead.append(el("h1", undefined, "Glossary"), el("span", "fine", "Plain language"));
  shell.panels.glossary.append(
    glossaryHead,
    glossaryPanel({
      askLabel: "Ask about this in my explanation",
      onAsk: (term) => {
        questionInput.value = isGlossaryId(term.id)
          ? conceptQuestion(term.id)
          : `In educational terms, what does "${term.title}" add to a reading of this move? Do not give trade advice.`;
        shell.select("explain");
        status.textContent = `${term.title} added to your question. Press Explain the move when ready. Nothing was sent.`;
        questionInput.focus();
      },
    }),
  );

  /* ---------- Settings tab ---------- */

  const planSlot = el("div");
  const accountNote = el("p", "fine");
  accountNote.setAttribute("role", "status");
  const settingsNote = el("p", "fine", "Loading Remote Config…");
  const themeChoice = readTheme();
  applyTheme(themeChoice);
  const settingsHead = el("div", "panel-title");
  settingsHead.append(el("h1", undefined, "Settings"), el("span", "fine", "Web"));
  shell.panels.settings.append(
    settingsHead,
    planSlot,
    group("Appearance", [themePicker(themeChoice, (choice) => {
      applyTheme(choice);
      try {
        localStorage.setItem(THEME_KEY, choice);
      } catch {
        // Private mode: theme lasts for this visit.
      }
    })]),
    group("AI", [
      el("p", "fine", "Gemini Nano runs on this device when Chrome has it. Otherwise Gemini answers in the cloud through Firebase AI Logic, with App Check in front."),
      settingsNote,
    ]),
    group("Legal", [row("doc", "Terms", () => openLegal("terms")), row("shield", "Privacy", () => openLegal("privacy"))]),
    group("About", [
      el("p", "fine", "ATLAS Explain is a public, Apache-2.0 companion to a private research desk. It contains none of that desk's models or data."),
      row("panel", "Get the Chrome extension", () => shell.openSheet("Chrome extension", extensionNodes())),
    ]),
  );
  renderPlan(pricingView({ billingEnabled: false, plan: "free", freeCloudDailyLimit: DEFAULT_SETTINGS.freeCloudDailyLimit }), null);

  /* ---------- wiring ---------- */

  explainButton.addEventListener("click", () => void onExplain());
  previewButton.addEventListener("click", () => void onPreview());
  cardInput.addEventListener("input", () => renderMove());
  window.addEventListener("hashchange", () => applyHash(location.hash));
  window.addEventListener("message", onInboundMessage);
  window.addEventListener("online", () => shell.setConnection("none"));
  window.addEventListener("offline", () => shell.setConnection("offline"));

  let currentSignal: SignalView = mapSignal({ connected: false });
  applySignal(currentSignal);
  shell.setConnection(navigator.onLine ? "none" : "offline");
  loadSample(SAMPLE_MOVES[0]);
  showResult(emptyCard("Pick a sample, paste a card, or open a move from the ATLAS desk. Then press Explain the move.", "Nothing is sent until you press Explain.", "Ready when you are"));

  void start();

  async function start(): Promise<void> {
    if (!options.env.ready) {
      backendError = "missing-config";
      renderSetup();
    } else {
      try {
        backend = await options.startBackend();
      } catch (error) {
        backendError = error instanceof Error ? error.message : "Firebase did not start.";
        renderSetup();
      }
    }
    applyHash(location.hash);
    void startAssets();
    applyPreview();
    if (!readFlag(ONBOARDED_KEY) && !preview.has("tab") && !preview.has("demo")) showOnboarding();
    if (!backend) return;
    void backend.loadSettings().then(({ settings, warnings }) => {
      settingsNote.textContent = settingsLine(settings, warnings);
    }).catch(() => {
      settingsNote.textContent = "Remote Config could not be read. Built-in defaults are used.";
    });
    void refreshPlan();
    void loadHistory();
  }

  function renderSetup(): void {
    explainButton.disabled = true;
    const missing = options.env.missing;
    const steps = el("ol");
    for (const text of [
      "Create a Firebase project and register a Web app.",
      "Finish AI Services → AI Logic setup (Gemini Developer API). Leave App Check enforced.",
      "Copy the web config into .env.local using the names in .env.example.",
      "Register a reCAPTCHA Enterprise key with App Check.",
      "Enable Anonymous Auth, create Firestore, and publish firestore.rules.",
      "Run npm run dev and reload.",
    ]) steps.append(el("li", undefined, text));
    const card = messageCard(
      "info",
      "Connect a Firebase project",
      backendError && backendError !== "missing-config"
        ? backendError
        : `Explanations need Firebase. Still needed: ${missing.join(", ") || "a working config"}. The glossary and signal tabs work without it.`,
    );
    card.append(disclosure("Setup steps", [steps]));
    showResult(card);
    historyNote.textContent = "History appears once Firebase is connected.";
  }

  function showOnboarding(): void {
    shell.overlay(onboarding(() => {
      shell.overlay(null);
      writeFlag(ONBOARDED_KEY);
      explainButton.focus();
    }));
  }

  function openLegal(page: "terms" | "privacy" | "signal"): void {
    if (page === "terms") shell.openSheet("Terms", termsNodes());
    else if (page === "privacy") shell.openSheet("Privacy", privacyNodes());
    else {
      shell.openSheet("About the signal light", [
        el("p", undefined, "Green means a paper shadow model leans up and has cleared the evidence gate. Red means it leans down and has cleared it. Grey means not enough evidence, which is the honest default today."),
        el("p", undefined, "The gate needs at least 200 resolved paper samples and a 55% hit rate. The light describes a model, never a trade."),
        el("p", "fine", "Paper prediction from ATLAS shadow models - not investment advice."),
      ]);
    }
  }

  /* ---------- move card ---------- */

  function loadSample(sample: SampleMove | undefined): void {
    if (!sample) return;
    cardInput.value = JSON.stringify(sample.card, null, 2);
    for (const button of sampleButtons) button.setAttribute("aria-pressed", button.textContent === sample.title ? "true" : "false");
    sampleNote.replaceChildren(sample.kind === "historical" ? "" : "Not a historical record. ", sample.summary);
    const link = sample.sources[0];
    if (link) {
      const a = el("a", undefined, ` Source: ${link.label}`);
      a.href = link.url;
      a.target = "_blank";
      a.rel = "noreferrer";
      sampleNote.append(a);
    }
    fromDesk.hidden = true;
    renderErrors([]);
    renderMove();
  }

  function renderMove(): void {
    const parsed = parseMoveCardJson(cardInput.value);
    if (!parsed.ok) {
      const card = el("div", "card move-card");
      const badge = el("span", "move-symbol");
      badge.append(icon("alert", 18));
      const text = el("div");
      text.append(el("p", "move-name", "Card needs a fix"), el("p", "move-meta", parsed.errors[0]?.message ?? "The JSON is not valid."));
      card.append(badge, text);
      moveSlot.replaceChildren(card);
      return;
    }
    const card = parsed.card;
    const node = el("div", "card move-card");
    node.append(el("span", "move-symbol", card.symbol.slice(0, 5)));
    const text = el("div");
    const meta = [card.marketLabel, card.asOf].filter(Boolean).join(" · ") || "Session move";
    text.append(el("p", "move-name", card.symbol), el("p", "move-meta", meta));
    const pct = el("span", "move-pct");
    pct.append(icon(card.movePct >= 0 ? "up" : "down", 14), formatPct(card.movePct));
    pct.setAttribute("aria-label", `Session move ${formatPct(card.movePct)}`);
    node.append(text, pct);
    moveSlot.replaceChildren(node);
  }

  function onInboundMessage(event: MessageEvent): void {
    if (!event.data || typeof event.data !== "object" || (event.data as { type?: string }).type !== EXPLAIN_LOAD_MESSAGE) return;
    const parsed = readInboundMessage(event.data, event.origin);
    const reply = inboundReply(parsed);
    if (event.source && "postMessage" in event.source) event.source.postMessage(reply, { targetOrigin: event.origin });
    if (!parsed.ok) {
      renderErrors(parsed.errors);
      status.textContent = "The inbound card was not loaded.";
      return;
    }
    const light = readPublicSignal((event.data as { payload?: unknown }).payload);
    if (light) applySignal(mapSignal({ connected: true, signal: light }));
    applyInbound(parsed.value, "message");
  }

  function applyHash(hash: string): void {
    if (hash === "#/terms") return openLegal("terms");
    if (hash === "#/privacy") return openLegal("privacy");
    const parsed = parseContextHash(hash);
    if (!parsed.ok) {
      renderErrors(parsed.errors);
      status.textContent = "That link could not be loaded.";
      return;
    }
    if (!parsed.value.context && !parsed.value.conceptId) return;
    applyInbound(parsed.value, "link");
  }

  function applyInbound(parsed: ParsedContextLink, via: "link" | "message"): void {
    notesInput.value = "";
    watchlistInput.value = "";
    shell.select("explain");
    if (parsed.context) {
      cardInput.value = JSON.stringify(publicMoveCard(parsed.context.card), editorKeys, 2);
      for (const button of sampleButtons) button.setAttribute("aria-pressed", "false");
      sampleNote.textContent = parsed.context.card.sourceNote ?? "";
      fromDesk.replaceChildren(icon("signal", 14), el("span", undefined, via === "link" ? "Opened from the ATLAS desk" : "Sent by an allowed ATLAS page"));
      fromDesk.hidden = false;
      renderMove();
    }
    if (parsed.context?.question) questionInput.value = parsed.context.question;
    else if (parsed.conceptId) questionInput.value = conceptQuestion(parsed.conceptId);
    renderErrors(parsed.warnings.map((message) => ({ path: "context", message })));
    const concept = parsed.conceptId ? getConcept(parsed.conceptId) : undefined;
    const stripped = parsed.warnings.length > 0 ? " Private or account fields were removed." : "";
    status.textContent = parsed.context
      ? `Public move card loaded.${stripped} Press Explain the move when you want a reading. Nothing was sent.`
      : `Concept loaded: ${concept?.title ?? parsed.conceptId}. Nothing was sent.`;
  }

  /* ---------- explain ---------- */

  async function prepareCard(): Promise<{ ok: true; card: MoveCard } | { ok: false; errors: { path: string; message: string }[] }> {
    const parsed = parseMoveCardJson(cardInput.value);
    if (!parsed.ok) return parsed;
    if (questionInput.value.trim().length > 600) return { ok: false, errors: [{ path: "question", message: "Question must be 600 characters or fewer." }] };
    const withPrivate = applyPrivateFields(parsed.card, notesInput.value, watchlistInput.value);
    if (withPrivate.errors.length > 0) return { ok: false, errors: withPrivate.errors };
    return { ok: true, card: withPrivate.card };
  }

  async function onPreview(): Promise<void> {
    const prepared = await prepareCard();
    if (!prepared.ok) return renderErrors(prepared.errors);
    renderErrors([]);
    const settings = await safeSettings();
    const decision = decide(prepared.card, questionInput.value, settings);
    const built = buildPrompt({
      card: prepared.card,
      question: questionInput.value,
      template: settings.promptTemplate,
      topics: settings.topics,
      includePrivateContext: decision.includePrivateContext,
    });
    promptPreview.textContent = `${decision.mode}\n${describePathReason(decision.reason)}\n\n${built.prompt}`;
    promptBox.hidden = false;
    promptBox.open = true;
    status.textContent = "Prompt built on this device. Nothing was sent.";
    requestAnimationFrame(() => promptBox.scrollIntoView({ block: "nearest", behavior: smooth() }));
  }

  async function onExplain(): Promise<void> {
    if (!backend) return renderSetup();
    const prepared = await prepareCard();
    if (!prepared.ok) return renderErrors(prepared.errors);
    renderErrors([]);
    setBusy(true);
    showResult(loadingCard(0, STEP_LABELS));
    status.textContent = "Checking the card and starting hybrid inference…";
    try {
      showResult(loadingCard(1, STEP_LABELS));
      const run = await backend.explain(prepared.card, questionInput.value, {
        onProgress(message) {
          status.textContent = message;
        },
      });
      showResult(runCard(run));
      status.textContent = "";
      shell.announce("Explanation ready.");
      try {
        await backend.save(run, prepared.card, questionInput.value);
        await loadHistory();
      } catch (error) {
        historyNote.textContent = error instanceof Error ? error.message : "The explanation was not saved.";
      }
    } catch (error) {
      status.textContent = "";
      if (error instanceof CloudAllowanceUsed || error instanceof WatchlistAllowance) showResult(limitCard(error.message));
      else if (!navigator.onLine) showResult(messageCard("offline", "You are offline", "On-device inference was not available and the cloud cannot be reached. Reconnect and try again.", () => void onExplain()));
      else showResult(messageCard("error", "That did not work", friendlyError(error), () => void onExplain()));
    } finally {
      setBusy(false);
    }
  }

  function runCard(run: ExplanationRun): HTMLElement {
    const ex = run.explanation;
    const body: Node[] = twoSidedNodes(ex);
    if (ex.headlineTopics.length > 0) {
      const topics = el("div", "chips");
      for (const item of ex.headlineTopics) {
        const chip = el("span", "chip", item.coerced ? `${item.topic} (mapped)` : item.topic);
        chip.title = item.headline;
        topics.append(chip);
      }
      body.push(topics);
    }
    const notes = [pathNote(run)];
    if (ex.truncatedReasons) notes.push("The model returned more than three reasons. The first three are shown.");
    notes.push("Educational information, not investment advice.");
    const copyText = [ex.summary, "", "Opportunity case:", ...ex.buyerReasons.map((r) => `- ${r}`), "", "Risk case:", ...ex.sellerReasons.map((r) => `- ${r}`), "", `What would change: ${ex.whatWouldChange}`, "", "Educational information, not investment advice."].join("\n");
    return explanationCard({
      source: run.inferenceSource === "on_device" ? "on_device" : run.inferenceSource === "in_cloud" ? "in_cloud" : "unknown",
      sourceDetail: run.cloudModel,
      body,
      copyText,
      notes,
      onClear: () => showResult(emptyCard("Pick another sample or edit the card, then explain again.", undefined, "Cleared")),
    });
  }

  async function loadHistory(): Promise<void> {
    if (!backend) return;
    try {
      const entries = await backend.list();
      if (entries.length === 0) {
        historyNote.textContent = "No saved explanations yet. They appear here for this browser's anonymous user.";
        historyList.replaceChildren();
        return;
      }
      historyNote.textContent = "Saved under your anonymous id. Private notes are never stored.";
      historyList.replaceChildren(...entries.map(historyItem));
    } catch (error) {
      historyNote.textContent = error instanceof Error ? error.message : "History could not be loaded.";
    }
  }

  function historyItem(entry: HistoryEntry): HTMLElement {
    const item = el("li", "card history-item");
    const load = el("button", "link-btn", "Load");
    load.type = "button";
    load.addEventListener("click", () => {
      if (!entry.cardJson) return;
      cardInput.value = pretty(entry.cardJson);
      sampleNote.textContent = "Loaded from your saved history. Notes were not stored.";
      renderMove();
      shell.panels.explain.scrollIntoView({ behavior: smooth() });
    });
    item.append(
      el("p", "move-name", `${entry.symbol} ${formatPct(entry.movePct)}`),
      load,
      el("p", "move-meta", [entry.createdAtLabel, sourceLabel(entry.inferenceSource)].filter(Boolean).join(" · ")),
      el("p", undefined, entry.summary),
    );
    return item;
  }

  /* ---------- plan ---------- */

  async function refreshPlan(): Promise<void> {
    if (!backend) return;
    let snapshot: BillingSnapshot;
    try {
      snapshot = await backend.loadBilling();
    } catch {
      const settings = await safeSettings();
      renderPlan(pricingView({ billingEnabled: settings.billingEnabled, plan: "free", freeCloudDailyLimit: settings.freeCloudDailyLimit }), null);
      return;
    }
    renderPlan(snapshot.pricing, snapshot);
  }

  function renderPlan(view: ReturnType<typeof pricingView>, snapshot: BillingSnapshot | null): void {
    const extras: Node[] = [];
    const acts = pricingActions(view);
    if (backend && acts.includes("link-google")) {
      const link = labelledButton("key", "Link a Google account", "secondary small");
      link.addEventListener("click", () => {
        accountNote.textContent = "Opening Google…";
        void backend?.linkGoogle().then(
          (res) => {
            accountNote.textContent = res === "already" ? "This browser is already linked to Google." : "Google is linked. Saved explanations stay with this account.";
          },
          (error: unknown) => {
            accountNote.textContent = error instanceof Error ? error.message : "Google sign-in did not finish.";
          },
        );
      });
      extras.push(link);
    }
    if (backend && acts.includes("checkout") && snapshot?.pricing.showCheckout) {
      const checkout = labelledButton("card", "Continue to checkout", "primary");
      checkout.addEventListener("click", () => {
        accountNote.textContent = "Starting checkout…";
        void backend?.startCheckout().catch((error: unknown) => {
          accountNote.textContent = error instanceof Error ? error.message : "Checkout did not start.";
        });
      });
      extras.push(checkout);
    }
    extras.push(accountNote);
    planSlot.replaceChildren(planCard(view, extras));
  }

  /* ---------- helpers ---------- */

  function applySignal(view: SignalView): void {
    currentSignal = view;
    signal.update(view);
    shell.setSignal(view);
    shell.setConnection(!navigator.onLine ? "offline" : view.connected ? "desk" : "none");
  }

  function setBusy(busy: boolean): void {
    explainButton.disabled = busy;
    previewButton.disabled = busy;
    explainButton.classList.toggle("loading", busy);
    result.setAttribute("aria-busy", busy ? "true" : "false");
  }

  function showResult(card: HTMLElement): void {
    card.classList.add("enter");
    result.replaceChildren(card);
    if (!card.classList.contains("state-empty")) {
      requestAnimationFrame(() => card.scrollIntoView({ block: "nearest", behavior: smooth() }));
    }
  }

  function renderErrors(items: { path: string; message: string }[]): void {
    errors.replaceChildren(...items.map((item) => el("li", undefined, `${item.path}: ${item.message}`)));
    if (items.length > 0) {
      errors.setAttribute("role", "alert");
      cardInput.setAttribute("aria-invalid", "true");
      const box = cardInput.closest("details");
      if (box) box.open = true;
    } else {
      errors.removeAttribute("role");
      cardInput.removeAttribute("aria-invalid");
    }
  }

  async function safeSettings(): Promise<AppSettings> {
    try {
      return backend ? (await backend.loadSettings()).settings : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  function applyPreview(): void {
    const tab = preview.get("tab");
    if (tab === "assets" || tab === "signal" || tab === "glossary" || tab === "settings") shell.select(tab);
    const demo = preview.get("demo");
    if (demo === "run") showResult(runCard(DEMO_RUN));
    if (demo === "loading") showResult(loadingCard(1, STEP_LABELS));
    if (demo === "error") showResult(messageCard("error", "That did not work", "The cloud model could not be reached. Check your connection and retry.", () => undefined));
    if (preview.get("onboarding") === "1") showOnboarding();
    if (preview.get("sheet") === "terms") openLegal("terms");
    if (preview.get("sheet") === "extension") shell.openSheet("Chrome extension", extensionNodes());
    if (preview.get("menu") === "open") document.querySelector<HTMLButtonElement>(".bar .icon-btn")?.click();
  }

  function smooth(): ScrollBehavior {
    return prefersReducedMotion() ? "auto" : "smooth";
  }
}

/* ---------- pure helpers ---------- */

function disclosure(title: string, nodes: Node[]): HTMLDetailsElement {
  const box = el("details", "disclosure");
  const summary = el("summary");
  summary.append(icon("chevron", 14), el("span", undefined, title));
  const body = el("div", "disclosure-body");
  body.append(...nodes);
  box.append(summary, body);
  return box;
}

function fieldLabel(id: string, text: string): HTMLLabelElement {
  const label = el("label", "field-label", text);
  label.htmlFor = id;
  return label;
}

function editorKeys(key: string, value: unknown): unknown {
  if (key === "notes" || key === "watchlist") return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;
  return value;
}

function decide(card: MoveCard, question: string, settings: AppSettings) {
  const hasPrivate = hasPrivateContext(card);
  const publicPrompt = buildPrompt({ card, question, template: settings.promptTemplate, topics: settings.topics, includePrivateContext: false });
  const privatePrompt = hasPrivate
    ? buildPrompt({ card, question, template: settings.promptTemplate, topics: settings.topics, includePrivateContext: true })
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

function pathNote(run: ExplanationRun): string {
  const where = run.inferenceSource === "on_device"
    ? "Ran on this device."
    : run.inferenceSource === "in_cloud"
      ? `Ran in the cloud (${run.cloudModel}).`
      : "The SDK did not report where it ran.";
  const fallback = run.fellBackToCloud ? " On-device was unavailable, so the cloud ran without private notes." : "";
  const privacy = run.privateContextUsed ? " Notes stayed on this device and were not saved." : " Private notes were not sent.";
  return `${where}${fallback}${privacy}`;
}

function settingsLine(settings: AppSettings, warnings: string[]): string {
  const base = `Inference preference: ${settings.inferenceMode}. Cloud model: ${settings.cloudModel}.`;
  return warnings.length ? `${base} ${warnings.join(" ")}` : base;
}

function sourceLabel(source: string): string {
  if (source === "on_device") return "on-device";
  if (source === "in_cloud") return "cloud";
  return "path unknown";
}

export function formatPct(value: number): string {
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

function readTheme(): ThemeChoice {
  const q = new URLSearchParams(location.search).get("theme");
  if (isTheme(q)) return q;
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return true;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // Private mode: onboarding shows again next visit.
  }
}

function friendlyError(error: unknown): string {
  if (error instanceof ExplanationParseError) {
    console.error(error.rawText);
    return `${error.message} The raw model text is in the browser console.`;
  }
  const message = error instanceof Error ? error.message : "The explanation could not be completed.";
  if (/API key not valid|API_KEY_INVALID/i.test(message)) return "Firebase AI Logic rejected the API key. Check the web app config.";
  if (/app.?check|recaptcha|unauthenticated|permission-denied/i.test(message)) return "App Check blocked the cloud model. Register this browser's debug token, or try again on the hosted site.";
  if (error instanceof OnDeviceUnavailableError) return `${message} Use desktop Chrome 139 or newer with the Prompt API flag on, or let the cloud answer.`;
  return message.length > 400 ? `${message.slice(0, 400)}…` : message;
}

/** Preview-only run for screenshots (?demo=run). Labelled sample text, not a market call. */
const DEMO_RUN: ExplanationRun = {
  explanation: {
    summary: "Sample explanation. A sharp one-day drop in a large chip maker after news that cheaper AI models might need fewer chips.",
    buyerReasons: [
      "Some read the fall as an over-reaction to one headline about long-run demand.",
      "The company's existing orders and margins were unchanged on the day.",
      "Cheaper models could widen AI use overall, which can lift total chip demand.",
    ],
    sellerReasons: [
      "If training gets cheaper, spending plans for top-end chips may be cut.",
      "The stock carried a high valuation that leaves little room for doubt.",
      "Peers fell together, which suggests a sector-wide reassessment, not noise.",
    ],
    whatWouldChange: "Updated spending plans from the largest cloud providers, or evidence on how much compute the cheaper models really need.",
    headlineTopics: [],
    truncatedReasons: false,
  },
  inferenceSource: "on_device",
  requestedMode: "prefer_on_device",
  pathReason: "short_public_prompt",
  privateContextUsed: false,
  fellBackToCloud: false,
  cloudModel: "gemini-2.5-flash-lite",
  prompt: "",
} as unknown as ExplanationRun;

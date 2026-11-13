import { CloudAllowanceUsed, pricingView } from "../../src/core/billing";
import {
  EXTENSION_DISCLAIMER,
  EXTENSION_PRIVACY_NOTE,
  LOCAL_ATLAS_PERMISSION_NOTE,
  buildExtensionPrompt,
  extensionHighlightAllowed,
  toPageContext,
  withDisclaimer,
} from "../../src/core/extension-prompt";
import {
  ATLAS_DESK_URL,
  BILLING_NOTE,
  EXPLAIN_WEB_URL,
  SAMPLE_EXPLANATION,
  SHORTCUT_HINT,
  whyQuestion,
} from "../../src/core/popup-copy";
import { DEFAULT_PRICE_FEED, isLivePriceSource, type PriceFeedOptions } from "../../src/core/price-feed";
import { DEFAULT_SETTINGS, parseRemoteSettings } from "../../src/core/settings";
import { mapSignal, readPublicSignal, type SignalView } from "../../src/core/signal";
import {
  emptyCard,
  explanationCard,
  glossaryPanel,
  group,
  limitCard,
  loadingCard,
  messageCard,
  offlineCard,
  onboarding,
  planCard,
  row,
  signalCard,
  themePicker,
} from "../../src/wallet/cards";
import { EXPLAIN_DEADLINE_MS, cloudErrorCopy, withDeadline } from "../../src/core/timeouts";
import { addMonitorSink, classifyCloudError, consoleSink, report } from "../../src/core/monitor";
addMonitorSink(consoleSink);
import { mountAssets, type AssetsPreview } from "../../src/wallet/assets-controller";
import { loadDigest, todayToronto } from "../../src/core/digest";
import { digestCard } from "../../src/wallet/digest";
import { canReachLocalAtlas } from "../../src/core/assets";
import { el, labelledButton, prefersReducedMotion } from "../../src/wallet/dom";
import { installErrorBoundary } from "../../src/wallet/error-boundary";
import { applyTheme, createWalletShell, isTheme, type ThemeChoice } from "../../src/wallet/shell";
import { HISTORY_KEY, addToHistory, makeEntry, parseHistory, type HistoryEntry } from "../../src/core/history";
import { LEARN_KEY, parseLearned } from "../../src/core/learn";
import { pageKindLine } from "../../src/core/page-kind";
import { TWO_SIDED_SCHEMA, parseTwoSided, twoSidedCopyText } from "../../src/core/two-sided";
import { twoSidedNodes } from "../../src/wallet/two-sided";
import { historyCard, learnCard } from "../../src/wallet/history-learn";
import { engineStrip } from "../../src/wallet/engine";
import { todayRow } from "../../src/wallet/today-row";
import { marketDigestCard } from "../../src/wallet/market-digest";
import { buildMarketDigest } from "../../src/core/market-digest";
import type { CatalogView } from "../../src/core/assets";
import type { DigestView } from "../../src/core/digest";
import { icon } from "../../src/wallet/icons";
import { COMPOSER_PLACEHOLDER, composerAction, composerHint } from "../../src/core/composer";
import { FOLLOW_UPS, followUpQuestion, relatedTerms } from "../../src/core/follow-ups";
import { isEngineState } from "../../src/core/hybrid-engine";
import { explainOnDevice } from "./on-device";
import { pinExplainButton, probeAtlasDesk, readSelectionInPage } from "./read-selection";

interface PendingExplain {
  selection: string;
  title: string;
  url: string;
  auto?: boolean;
}

type RunOptions = { highlight: boolean; fromPage: boolean; pending?: PendingExplain; followUp?: string };

const hasChrome = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
const preview = new URLSearchParams(location.search);
// The side panel reuses popup.html; it fills the panel instead of the fixed 360 x 600 popup frame.
// Chrome caps popups at 600px tall, so a taller window is the side panel (or a tab).
if (preview.get("view") === "panel" || window.innerHeight > 640) document.documentElement.dataset.view = "panel";
const host = document.querySelector("#app");
if (!(host instanceof HTMLElement)) throw new Error("Missing #app");
installErrorBoundary(host);

const store = {
  async get(): Promise<{ theme?: unknown; appCheckDebugToken?: unknown; onboarded?: unknown; history?: unknown; learned?: unknown }> {
    if (hasChrome) return chrome.storage.local.get(["theme", "appCheckDebugToken", "onboarded", HISTORY_KEY, LEARN_KEY]);
    return {};
  },
  async set(patch: Record<string, unknown>): Promise<void> {
    if (hasChrome) await chrome.storage.local.set(patch);
  },
};

/* ---------- shell ---------- */

const shell = createWalletShell({
  host,
  surface: "extension",
  onAccount: () => void openAccount(),
  menu: [
    { label: "How ATLAS Explain works", icon: "help", run: () => showOnboarding() },
    { label: "Open the ATLAS desk", icon: "external", run: () => openUrl(ATLAS_DESK_URL) },
    { label: "Open the web app", icon: "external", run: () => openUrl(`${EXPLAIN_WEB_URL}/app`) },
    { label: "Privacy", icon: "shield", run: () => shell.openSheet("Privacy", [el("p", undefined, EXTENSION_PRIVACY_NOTE), el("p", undefined, LOCAL_ATLAS_PERMISSION_NOTE), el("p", "fine", EXTENSION_DISCLAIMER)]) },
    { label: "Settings", icon: "gear", run: () => shell.select("settings", { focus: true }) },
  ],
});

/* ---------- Explain tab ---------- */

const question = document.createElement("textarea");
question.id = "question";
question.rows = 2;
question.placeholder = COMPOSER_PLACEHOLDER;
question.setAttribute("aria-label", "Term or text to explain");
// One primary action: reads the highlight while the box is empty, explains typed text once you type.
const explainButton = labelledButton("highlight", "Explain highlight", "primary composer-go");
const composer = el("section", "composer");
composer.setAttribute("aria-label", "Ask Explain");
composer.append(question, explainButton);
function syncComposer(): void {
  const action = composerAction(question.value);
  explainButton.dataset.mode = action.mode;
  explainButton.replaceChildren(icon(action.icon, 16), el("span", undefined, action.label));
}
const result = el("div", "stack result");
result.setAttribute("aria-live", "polite");
// The title stays for screen readers; sighted readers already see the Explain tab and the brand.
const explainHead = el("div", "panel-title sr-only");
explainHead.append(el("h1", undefined, "Explain"), el("span", "fine", "Education only"));
const engine = engineStrip({ compact: true });
const brief = digestCard();
// Grounded digest: only the live ATLAS catalog on this computer feeds it, never a preview file.
let marketCatalog: CatalogView | null = null;
let briefView: DigestView = { kind: "loading" };
let marketCard: HTMLElement | null = null;
const today = todayRow(() => {
  marketCard = marketDigestCard(buildMarketDigest(marketCatalog));
  shell.openSheet("Today's digest", [marketCard, brief.node]);
});
function refreshToday(): void {
  today.show(briefView, marketCatalog != null);
  // If the digest sheet is open when ATLAS answers, swap in the fresh card.
  if (marketCard?.isConnected) {
    const next = marketDigestCard(buildMarketDigest(marketCatalog));
    marketCard.replaceWith(next);
    marketCard = next;
  }
}
void (canReachLocalAtlas(location, true)
  ? loadDigest()
  : Promise.resolve({ kind: "not_connected" as const, today: todayToronto(), reason: "Today's digest is not ready yet. Open ATLAS on this computer to load today's digest." })
).then((v) => { briefView = v; brief.show(v); refreshToday(); });
// Recent explanations live in chrome.storage.local on this device. Never uploaded.
const recentSlot = el("div");
let history: HistoryEntry[] = [];
shell.panels.explain.append(explainHead, composer, engine.node, today.node, result, recentSlot);
syncComposer();

function renderHistory(): void {
  recentSlot.replaceChildren(historyCard({
    entries: history,
    limit: 3,
    onOpen: (entry) => {
      question.value = entry.selection;
      syncComposer();
      showExplanation(entry.text, entry.source, entry.selection, false, entry.contextLine);
    },
    onClear: () => {
      history = [];
      void store.set({ [HISTORY_KEY]: [] });
      renderHistory();
      shell.announce("Recent explanations cleared.");
    },
  }));
}

function remember(text: string, source: "on_device" | "in_cloud", selection: string, contextLine?: string): void {
  history = addToHistory(history, makeEntry({ selection, text, source, contextLine }));
  void store.set({ [HISTORY_KEY]: history });
  renderHistory();
}

/* ---------- Assets tab ---------- */

// Reads ATLAS on this computer (http://localhost:3000, host permission), or live crypto
// prices from the configured public feed when ATLAS is not running. The no-Chrome
// preview page shows captured box data instead, under a banner, and never fetches.
let assets: ReturnType<typeof mountAssets> | null = null;
let atlasLocal = false;
let livePrices = false;

function startAssets(previewData?: AssetsPreview, priceFeed: PriceFeedOptions = DEFAULT_PRICE_FEED): void {
  assets = mountAssets({
    shell,
    canReachAtlas: hasChrome,
    preview: previewData,
    priceFeed,
    onState: (state) => {
      atlasLocal = state.kind === "ready" && !previewData && !isLivePriceSource(state.catalog.source);
      livePrices = state.kind === "ready" && !previewData && isLivePriceSource(state.catalog.source);
      if (state.kind !== "loading") marketCatalog = state.kind === "ready" && !previewData && !isLivePriceSource(state.catalog.source) ? state.catalog : null;
      refreshToday();
      updateConnection();
    },
    onExplain: (text) => {
      question.value = text;
      syncComposer();
      shell.select("explain");
      void run({ highlight: false, fromPage: false });
    },
  });
  void assets.refresh();
}

/* ---------- Signal tab ---------- */

let currentSignal: SignalView = mapSignal({ connected: false });
const signal = signalCard({
  onRefresh: () => refreshSignal(),
  onWhy: () => {
    question.value = whyQuestion(currentSignal);
    syncComposer();
    shell.select("explain");
    void run({ highlight: false, fromPage: false });
  },
  deskHint: "Tip: open http://localhost:3000/markets in this tab, then reopen the popup.",
});
const signalHead = el("div", "panel-title");
signalHead.append(el("h1", undefined, "Signal"), el("span", "fine", "Paper only"));
shell.panels.signal.append(signalHead, signal.node);

/* ---------- Glossary tab ---------- */

const glossaryHead = el("div", "panel-title");
glossaryHead.append(el("h1", undefined, "Glossary"), el("span", "fine", "Plain language"));
// Learn path progress is a list of term ids in chrome.storage.local.
const learnSlot = el("div");
let learned = new Set<string>();
function askTerm(term: { title: string }): void {
  question.value = `Explain "${term.title}" in plain language with a short example. Do not recommend a trade.`;
  syncComposer();
  shell.select("explain");
  void run({ highlight: false, fromPage: false });
}
function renderLearn(): void {
  learnSlot.replaceChildren(learnCard({
    learned,
    onAsk: askTerm,
    onMark: (term) => {
      learned = new Set([...learned, term.id]);
      void store.set({ [LEARN_KEY]: [...learned] });
      renderLearn();
      shell.announce(`${term.title} marked as learned.`);
    },
    onReset: () => {
      learned = new Set();
      void store.set({ [LEARN_KEY]: [] });
      renderLearn();
    },
  }));
}
shell.panels.glossary.append(
  glossaryHead,
  learnSlot,
  glossaryPanel({
    askLabel: "Explain in more depth",
    onAsk: askTerm,
  }),
);

/* ---------- Settings tab ---------- */

const toolsStatus = el("p", "fine");
toolsStatus.setAttribute("role", "status");
const themeSlot = el("div");
const version = hasChrome ? chrome.runtime.getManifest().version : "preview";
const settingsHead = el("div", "panel-title");
settingsHead.append(el("h1", undefined, "Settings"), el("span", "fine", hasChrome ? `v${version}` : "Preview"));
shell.panels.settings.append(
  settingsHead,
  planCard(pricingView({ billingEnabled: false, plan: "free", freeCloudDailyLimit: DEFAULT_SETTINGS.freeCloudDailyLimit }), [el("p", "fine", BILLING_NOTE)]),
  group("Appearance", [themeSlot]),
  group("On this page", [
    row("pin", "Show Explain button on this page", () => void pin()),
    row("panel", "Open in side panel", () => void openSidePanel()),
    toolsStatus,
  ]),
  group("AI", [
    el("p", "fine", "Explanations run on this device first with Gemini Nano. If Chrome does not have it, Gemini answers in the cloud through Firebase AI Logic, via the ATLAS Explain web app with App Check in front. No setup needed."),
  ]),
  group("Account", [
    el("p", "fine", "Sign in on atlas-explain.web.app in this Chrome profile and the extension uses the same account."),
    row("user", "Account and sign-in", () => void openAccount()),
  ]),
  group("Privacy", [el("p", "fine", EXTENSION_PRIVACY_NOTE), el("p", "fine", LOCAL_ATLAS_PERMISSION_NOTE)]),
  group("About", [el("p", "fine", `ATLAS Explain ${version} · Apache-2.0 · ${SHORTCUT_HINT}`), row("external", "Open the web app", () => openUrl(EXPLAIN_WEB_URL))]),
);

/* ---------- events ---------- */

let lastRun: RunOptions | null = null;
question.addEventListener("input", () => {
  syncComposer();
});
question.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && question.value.trim()) {
    event.preventDefault();
    void run({ highlight: false, fromPage: false });
  }
});
explainButton.addEventListener("click", () => {
  void run(composerAction(question.value).mode === "typed" ? { highlight: false, fromPage: false } : { highlight: true, fromPage: true });
});
window.addEventListener("online", () => { updateConnection(); refreshEngine(); });
window.addEventListener("offline", () => { updateConnection(); refreshEngine(); });

function refreshEngine(): void {
  const forced = preview.get("engine");
  if (!hasChrome && isEngineState(forced)) engine.set(forced);
  else void engine.refresh();
}

void boot();

async function boot(): Promise<void> {
  showResult(composerHintLine());
  refreshEngine();
  applySignal(previewSignal());
  const stored = await store.get();
  const theme: ThemeChoice = isTheme(stored.theme) ? stored.theme : hasChrome ? "system" : readPreviewTheme();
  applyTheme(theme);
  themeSlot.replaceChildren(themePicker(theme, (choice) => {
    applyTheme(choice);
    void store.set({ theme: choice });
  }));
  history = parseHistory(stored.history);
  learned = parseLearned(stored.learned);
  if (!hasChrome) {
    const done = preview.get("learned");
    if (done) learned = parseLearned(done.split(","));
  }
  renderHistory();
  renderLearn();
  if (!hasChrome) {
    startAssets(await previewAssets());
    applyPreviewState();
    return;
  }
  const priceFeed: PriceFeedOptions = { ...DEFAULT_PRICE_FEED };
  startAssets(undefined, priceFeed);
  void import("./cloud").then(async (cloud) => {
    const next = await cloud.loadExtensionPriceFeed();
    const changed = next.provider !== priceFeed.provider || next.coinGeckoDemoKey !== priceFeed.coinGeckoDemoKey;
    priceFeed.provider = next.provider;
    priceFeed.coinGeckoDemoKey = next.coinGeckoDemoKey;
    if (changed) void assets?.refresh();
  }).catch(() => undefined);
  if (stored.onboarded !== true) showOnboarding();
  await refreshSignal();
  void chrome.action.setBadgeText({ text: "" });
  void chrome.action.setTitle({ title: "ATLAS Explain" });
  const session = await chrome.storage.session.get("pending");
  const pending = session.pending as PendingExplain | undefined;
  if (!pending) return;
  await chrome.storage.session.remove("pending");
  question.value = pending.selection;
  syncComposer();
  if (pending.auto) await run({ highlight: true, fromPage: false, pending });
}

function showOnboarding(): void {
  shell.overlay(onboarding(() => {
    shell.overlay(null);
    void store.set({ onboarded: true });
    explainButton.focus();
  }));
}

/* ---------- explain flow ---------- */

async function run(options: RunOptions): Promise<void> {
  lastRun = options;
  setBusy(true);
  showResult(loadingCard(0));
  let raw = { selection: question.value, title: "", url: "" };
  if (options.pending) {
    raw = options.pending;
  } else if (options.fromPage && hasChrome) {
    const tab = await activeTab();
    if (!tab?.id) {
      fail("Open a normal web page, highlight some text, then try again.", false);
      return;
    }
    try {
      const [injected] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readSelectionInPage });
      raw = {
        selection: injected?.result?.selection || question.value,
        title: injected?.result?.title || tab.title || "",
        url: tab.url || "",
      };
      if (raw.selection) {
        question.value = raw.selection;
        syncComposer();
      }
    } catch {
      fail("Chrome does not let extensions read this page. Paste the term in the box instead.", false);
      return;
    }
  }
  if (!raw.selection.trim() && !question.value.trim()) {
    setBusy(false);
    showResult(emptyCard("Nothing is highlighted yet. Select a word or sentence on the page, or type a term above."));
    question.focus();
    return;
  }

  const context = toPageContext(raw);
  const built = buildExtensionPrompt({ context, question: options.followUp ?? (options.highlight ? "" : question.value) });

  // Entitlements come from Remote Config. Firebase loads only now, never when the popup opens.
  const cloudModule = navigator.onLine ? await import("./cloud").catch(() => null) : null;
  const settingsNow = cloudModule ? await cloudModule.loadExtensionSettings() : parseRemoteSettings({}).settings;
  if (options.highlight && !extensionHighlightAllowed({
    billingEnabled: settingsNow.billingEnabled,
    plan: "free",
    freeCloudDailyLimit: settingsNow.freeCloudDailyLimit,
  })) {
    setBusy(false);
    showResult(limitCard("Highlight-to-explain is a Pro entitlement. Pro is coming after beta."));
    return;
  }

  showResult(loadingCard(1));
  const local = await explainOnDevice(built.prompt, TWO_SIDED_SCHEMA);
  if (local) {
    answer(local, "on_device", context.selection, context.redacted, pageKindLine(context.page, context.host));
    return;
  }
  if (!cloudModule || !navigator.onLine) {
    setBusy(false);
    showResult(offlineCard());
    return;
  }

  showResult(loadingCard(2));
  try {
    const cloud = await withDeadline(cloudModule.explainInCloud(built.prompt), EXPLAIN_DEADLINE_MS, "The answer took too long.");
    if (cloud.blocked) {
      setBusy(false);
      showResult(limitCard(cloud.text));
      return;
    }
    answer(cloud.text, "in_cloud", context.selection, context.redacted, pageKindLine(context.page, context.host));
  } catch (error) {
    if (error instanceof CloudAllowanceUsed) {
      setBusy(false);
      showResult(limitCard(error.message));
      return;
    }
    const message = error instanceof Error && error.message ? error.message : "The cloud model did not answer.";
    fail(friendlyCloudError(message), true);
  }
}

function answer(text: string, source: "on_device" | "in_cloud", selection: string, redacted: boolean, contextLine?: string): void {
  engine.markRun(source);
  remember(text, source, selection || question.value, contextLine);
  showExplanation(text, source, selection, redacted, contextLine);
}

function showExplanation(text: string, source: "on_device" | "in_cloud", selection: string, redacted: boolean, contextLine?: string): void {
  setBusy(false);
  // Same two-sided layout as the web app when the model kept the shape; plain text otherwise.
  const twoSided = parseTwoSided(text);
  const plain = withDisclaimer(text);
  const notes = redacted ? ["Account-like numbers were removed before anything was sent."] : [];
  if (twoSided) notes.push(EXTENSION_DISCLAIMER);
  showResult(explanationCard({
    source,
    selection,
    contextLine,
    ...(twoSided ? { body: twoSidedNodes(twoSided) } : { text: plain }),
    copyText: twoSided ? twoSidedCopyText(twoSided, EXTENSION_DISCLAIMER) : plain,
    notes,
    ...keepGoingFor(selection || question.value, text),
    onClear: () => {
      showResult(composerHintLine());
      explainButton.focus();
    },
  }));
  shell.announce("Explanation ready.");
}

/** Follow-ups re-ask about the same topic; related chips explain a glossary term found in the answer. */
function keepGoingFor(topic: string, answerText: string) {
  const subject = topic.trim();
  if (!subject) return {};
  return {
    followUps: FOLLOW_UPS.map((item) => ({
      label: item.label,
      run: () => void run({
        highlight: false,
        fromPage: false,
        pending: { selection: subject, title: "", url: "" },
        followUp: followUpQuestion(item.kind, subject),
      }),
    })),
    related: relatedTerms(`${subject}\n${answerText}`, subject).map((term) => ({
      title: term.title,
      run: () => askTerm(term),
    })),
  };
}

function fail(text: string, retry: boolean): void {
  setBusy(false);
  const replay = lastRun;
  showResult(messageCard("error", "That did not work", text, retry && replay ? () => void run(replay) : undefined));
}

function friendlyCloudError(message: string): string {
  report(classifyCloudError(message), "extension", message.includes("throttl") ? "app_check_throttled" : "cloud_failed");
  return cloudErrorCopy(message, "extension");
}

function composerHintLine(): HTMLElement {
  return el("p", "state-empty composer-hint", composerHint(SHORTCUT_HINT));
}

function setBusy(busy: boolean): void {
  result.setAttribute("aria-busy", busy ? "true" : "false");
  explainButton.disabled = busy;
  explainButton.classList.toggle("loading", busy);
}

function showResult(card: HTMLElement): void {
  card.classList.add("enter");
  result.replaceChildren(card);
  if (!card.classList.contains("state-empty")) {
    requestAnimationFrame(() => card.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" }));
  }
}

/* ---------- signal ---------- */

function previewSignal(): SignalView {
  const requested = preview.get("signal");
  if (requested === "green" || requested === "red") {
    return mapSignal({
      connected: true,
      modelsClearGate: true,
      signal: { lean: requested === "green" ? "up" : "down", hitRate: 0.62, sampleSize: 240 },
    });
  }
  if (requested === "thin") {
    return mapSignal({
      connected: true,
      signal: {
        lean: "none",
        hitRate: 0.23,
        sampleSize: 13,
        reason: "Not enough evidence: below the evidence gate; thin data (13 of 200 labelled outcomes). The light stays grey.",
      },
    });
  }
  return mapSignal({ connected: false });
}

async function refreshSignal(): Promise<void> {
  if (!hasChrome) {
    applySignal(previewSignal());
    return;
  }
  const tab = await activeTab();
  if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
    applySignal(mapSignal({ connected: false }));
    return;
  }
  try {
    const [injected] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: probeAtlasDesk });
    const found = injected?.result;
    applySignal(found?.connected ? mapSignal({ connected: true, signal: readPublicSignal(found.payload) }) : mapSignal({ connected: false }));
  } catch {
    applySignal(mapSignal({ connected: false }));
  }
}

function applySignal(view: SignalView): void {
  currentSignal = view;
  signal.update(view);
  shell.setSignal(view);
  updateConnection();
}

function updateConnection(): void {
  shell.setConnection(!navigator.onLine ? "offline" : currentSignal.connected ? "desk" : atlasLocal ? "local" : livePrices ? "live" : "none");
  shell.setSignal(currentSignal);
}

/* ---------- page tools ---------- */

async function pin(): Promise<void> {
  if (!hasChrome) {
    toolsStatus.textContent = "The page button is available in Chrome.";
    return;
  }
  const tab = await activeTab();
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pinExplainButton });
    toolsStatus.textContent = "Button added. Highlight text on the page, then click it.";
  } catch {
    toolsStatus.textContent = "This page does not allow the button. Use the popup instead.";
  }
}

async function openSidePanel(): Promise<void> {
  if (!hasChrome) {
    toolsStatus.textContent = "The side panel is available in Chrome.";
    return;
  }
  const granted = await chrome.permissions.request({ permissions: ["sidePanel"] });
  if (!granted) {
    toolsStatus.textContent = "Side panel permission was not granted.";
    return;
  }
  const tab = await activeTab();
  if (tab?.id == null) return;
  await chrome.sidePanel.setOptions({ tabId: tab.id, path: "popup.html?view=panel", enabled: true });
  await chrome.sidePanel.open({ tabId: tab.id });
}

/* ---------- account (shared with the web app through the bridge) ---------- */

async function openAccount(): Promise<void> {
  const signInUrl = `${EXPLAIN_WEB_URL}/signin`;
  const status = el("p", "fine", "Checking your account…");
  status.setAttribute("role", "status");
  const open = labelledButton("user", "Sign in on atlas-explain.web.app", "primary");
  open.addEventListener("click", () => openUrl(signInUrl));
  shell.openSheet("Account", [status, open, el("p", "fine", "The extension uses the account signed in on the ATLAS Explain web app in this Chrome profile. You can keep using it signed out.")]);
  if (!hasChrome || !navigator.onLine) {
    status.textContent = navigator.onLine ? "Account is available in Chrome." : "You are offline. Account status will show when you reconnect.";
    return;
  }
  try {
    const { readAccount } = await import("./cloud");
    const view = await readAccount();
    shell.setAccount(view);
    if (view?.signedIn) {
      status.textContent = `Signed in as ${view.label}.`;
      open.replaceChildren(document.createTextNode("Manage account or sign out"));
    } else {
      status.textContent = "Signed out. Explanations still work; history stays in this browser.";
    }
  } catch {
    status.textContent = "Account status could not be read right now. Explanations still work.";
  }
}

function openUrl(url: string): void {
  if (hasChrome) void chrome.tabs.create({ url });
  else window.open(url, "_blank", "noreferrer");
}

/* ---------- preview page (no Chrome APIs) ---------- */

async function previewAssets(): Promise<AssetsPreview | undefined> {
  const mode = preview.get("assets");
  if (!mode) return { label: "", list: null, details: {}, state: "hosted" };
  const data = (await import("../../src/wallet/box-preview.json")).default;
  const state = mode === "offline" ? "not_connected" : mode === "hosted" ? "hosted" : mode === "loading" ? "loading" : "ready";
  const label = state === "ready"
    ? `Box preview: real Kraken and IEX bars run through the ATLAS route on the build box (${data.capturedAt.slice(0, 16).replace("T", " ")} UTC), not your computer.`
    : "Preview of the state shown when ATLAS is not running on this computer.";
  return { label, list: data.list, details: data.details, state };
}

function readPreviewTheme(): ThemeChoice {
  const value = preview.get("theme");
  return isTheme(value) ? value : "system";
}

function applyPreviewState(): void {
  const tab = preview.get("tab");
  if (tab === "assets" || tab === "signal" || tab === "glossary" || tab === "settings") shell.select(tab);
  const sheet = preview.get("asset");
  if (sheet) void assets?.open(sheet);
  const demo = preview.get("demo");
  if (demo === "answer") {
    question.value = SAMPLE_EXPLANATION.selection;
    syncComposer();
    answer(SAMPLE_EXPLANATION.text, "on_device", SAMPLE_EXPLANATION.selection, false);
  } else if (demo === "loading") {
    showResult(loadingCard(1));
  } else if (demo === "error") {
    lastRun = { highlight: false, fromPage: false };
    fail("The cloud model could not be reached. Check your connection and retry.", true);
  } else if (demo === "offline") {
    showResult(offlineCard());
  } else if (demo === "limit") {
    showResult(limitCard("Today's free cloud explanations are used up. Explanations that run on this device are still unlimited. Pro is coming after beta."));
  }
  if (preview.get("why") === "open") signal.setWhyOpen(true);
  if (preview.get("onboarding") === "1") showOnboarding();
  if (preview.get("menu") === "open") document.querySelector<HTMLButtonElement>(".bar .icon-btn")?.click();
  if (preview.get("sheet") === "today") today.node.click();
  if (preview.get("term") === "open") document.querySelector<HTMLDetailsElement>(".term details")?.setAttribute("open", "");
}

function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
}

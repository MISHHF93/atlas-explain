import { CloudAllowanceUsed, pricingView } from "../../src/core/billing";
import {
  EXTENSION_DISCLAIMER,
  EXTENSION_PRIVACY_NOTE,
  LOCAL_ATLAS_PERMISSION_NOTE,
  buildExtensionPrompt,
  toPageContext,
} from "../../src/core/extension-prompt";
import {
  ATLAS_DESK_URL,
  EXPLAIN_WEB_URL,
  SAMPLE_EXPLANATION,
  SAMPLE_TERM,
  SHORTCUT_HINT,
  connectionFor,
  whyQuestion,
} from "../../src/core/popup-copy";
import { DEFAULT_PRICE_FEED, isLivePriceSource, type PriceFeedOptions } from "../../src/core/price-feed";
import { DEFAULT_SETTINGS } from "../../src/core/settings";
import { mapSignal, readPublicSignal, type SignalView } from "../../src/core/signal";
import {
  onboarding,
  planCard,
  signalCard,
} from "../../src/wallet/cards";
import { EXPLAIN_DEADLINE_MS, cloudErrorCopy, withDeadline } from "../../src/core/timeouts";
import { addMonitorSink, classifyCloudError, consoleSink, report } from "../../src/core/monitor";
// The extension sends no analytics; errors are logged to the console in development builds only.
if (import.meta.env.DEV) addMonitorSink(consoleSink);
import { mountAssets } from "../../src/wallet/assets-controller";
import { createWatchlist, localKeyValue } from "../../src/core/watchlist";
import { loadDigest, todayToronto } from "../../src/core/digest";
import { digestCard } from "../../src/wallet/digest";
import { canReachLocalAtlas } from "../../src/core/assets";
import { el, labelledButton } from "../../src/wallet/dom";
import { installErrorBoundary } from "../../src/wallet/error-boundary";
import { applyTheme, createWalletShell, isTheme, type ThemeChoice } from "../../src/wallet/shell";
import { buildSettings } from "../../src/wallet/settings";
import { explainPanel, type ExplainOutcome, type ExplainRequest } from "../../src/wallet/explain-panel";
import { HISTORY_KEY, parseHistory } from "../../src/core/history";
import { LEARN_KEY } from "../../src/core/learn-key";
import { pageKindLine } from "../../src/core/page-kind";
import { TWO_SIDED_SCHEMA } from "../../src/core/two-sided";
import { todayRow } from "../../src/wallet/today-row";
import { marketDigestCard } from "../../src/wallet/market-digest";
import { buildMarketDigest } from "../../src/core/market-digest";
import type { CatalogView } from "../../src/core/assets";
import type { DigestView } from "../../src/core/digest";
import { COMPOSER_PLACEHOLDER, composerHint } from "../../src/core/composer";
import { isEngineState } from "../../src/core/hybrid-engine";
import { explainOnDevice } from "./on-device";
import { pinExplainButton, probeAtlasDesk, readSelectionInPage } from "./read-selection";

interface PendingExplain {
  selection: string;
  title: string;
  url: string;
  auto?: boolean;
}


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
  onSelect: (tab) => {
    if (tab === "glossary") void ensureLearn();
  },
  menu: [
    { label: "How ATLAS Explain works", icon: "help", run: () => showOnboarding() },
    { id: "desk", hidden: true, label: "Open the ATLAS desk", icon: "external", run: () => openUrl(ATLAS_DESK_URL) },
    { label: "Open the web app", icon: "external", run: () => openUrl(`${EXPLAIN_WEB_URL}/app`) },
    { label: "Privacy", icon: "shield", run: () => shell.openSheet("Privacy", [el("p", undefined, EXTENSION_PRIVACY_NOTE), el("p", undefined, LOCAL_ATLAS_PERMISSION_NOTE), privacyLink(), el("p", "fine", EXTENSION_DISCLAIMER)]) },
    { label: "Settings", icon: "gear", run: () => openSettings() },
  ],
});

/* ---------- Explain tab ---------- */

// The Explain panel is the same code as the web app's. The popup supplies only how it gets an
// answer: read the page highlight, try Gemini Nano, then the cloud bridge (askPopup below).
// Recent explanations live in chrome.storage.local on this device. Never uploaded.
const panel = explainPanel({
  ask: askPopup,
  readsPage: true,
  placeholder: COMPOSER_PLACEHOLDER,
  hint: composerHint(SHORTCUT_HINT),
  headHidden: true,
  history: { initial: [], save: (list) => void store.set({ [HISTORY_KEY]: list }), limit: 3 },
  relatedTerms: (text, topic) => relatedTermsFn?.(text, topic) ?? [],
  announce: (text) => shell.announce(text),
});
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
  : Promise.resolve({ kind: "not_connected" as const, today: todayToronto(), reason: "Today's ATLAS digest isn't ready yet." })
).then((v) => { briefView = v; brief.show(v); refreshToday(); });
// The ATLAS digest row and the Signal tab exist only for people running ATLAS research software.
today.node.hidden = true;
shell.setTabHidden("signal", true);
shell.panels.explain.append(panel.head, panel.composer, panel.engine.node, today.node, panel.status, panel.result, panel.history);

/* ---------- Assets tab ---------- */

// Reads ATLAS on this computer (http://localhost:3000, host permission), or live crypto
// prices from the configured public feed when ATLAS is not running. The no-Chrome
// preview page shows captured box data instead, under a banner, and never fetches.
let assets: ReturnType<typeof mountAssets> | null = null;
let atlasLocal = false;
let livePrices = false;

/** ATLAS on this computer is read only after its owner grants this optional permission (Settings). */
const ATLAS_ORIGINS = ["http://localhost:3000/*"];
let atlasAllowed = false;

function startAssets(priceFeed: PriceFeedOptions = DEFAULT_PRICE_FEED): void {
  assets = mountAssets({
    shell,
    canReachAtlas: hasChrome && atlasAllowed,
    priceFeed,
    // Kept on this device in the extension; account sync for the extension comes through the website later.
    watchlist: createWatchlist(localKeyValue(), null),
    onState: (state) => {
      atlasLocal = state.kind === "ready" && !isLivePriceSource(state.catalog.source);
      livePrices = state.kind === "ready" && isLivePriceSource(state.catalog.source);
      if (state.kind !== "loading") marketCatalog = state.kind === "ready" && !isLivePriceSource(state.catalog.source) ? state.catalog : null;
      refreshToday();
      updateConnection();
    },
    onExplain: (text) => {
      shell.select("explain");
      panel.explain(text);
    },
  });
  void assets.refresh();
}

/* ---------- Signal tab ---------- */

let currentSignal: SignalView = mapSignal({ connected: false });
const signal = signalCard({
  onRefresh: () => refreshSignal(),
  onWhy: () => {
    shell.select("explain");
    panel.explain(whyQuestion(currentSignal));
  },
  deskHint: "Open the ATLAS Markets desk in this tab, then reopen ATLAS Explain.",
});
const signalHead = el("div", "panel-title");
signalHead.append(el("h1", undefined, "Signal"), el("span", "fine", "Paper only"));
shell.panels.signal.append(signalHead, signal.node);

/* ---------- Glossary tab ---------- */

const glossaryHead = el("div", "panel-title");
glossaryHead.append(el("h1", undefined, "Learn"), el("span", "fine", "Plain language"));
// Learn path progress is a list of term ids in chrome.storage.local. The glossary itself loads on demand.
const learnSlot = el("div");
learnSlot.append(el("p", "fine", "Loading the glossary…"));
let storedLearned: unknown = [];
let learnModule: Promise<typeof import("./learn-tab")> | null = null;
let learnMounted = false;
function loadLearnModule(): Promise<typeof import("./learn-tab")> {
  learnModule ??= import("./learn-tab");
  return learnModule;
}
async function ensureLearn(): Promise<void> {
  const mod = await loadLearnModule();
  if (learnMounted) return;
  learnMounted = true;
  mod.mountLearn(learnSlot, {
    storedLearned,
    onAsk: askTerm,
    save: (patch) => void store.set(patch),
    announce: (text) => shell.announce(text),
  });
}
/** Set once the learn chunk has loaded, so answers can show related-term chips. */
let relatedTermsFn: ((text: string, topic?: string) => { id: string; title: string }[]) | null = null;
function askTerm(term: { title: string }): void {
  shell.select("explain");
  panel.explain(term.title);
}
shell.panels.glossary.append(glossaryHead, learnSlot);

/* ---------- Settings (a sheet from the menu, not a tab) ---------- */

const toolsStatus = el("p", "fine");
toolsStatus.setAttribute("role", "status");
const version = hasChrome ? chrome.runtime.getManifest().version : "preview";
const settings = buildSettings({
  plan: planCard(pricingView({ billingEnabled: false, plan: "free", freeCloudDailyLimit: DEFAULT_SETTINGS.freeCloudDailyLimit })),
  theme: "system",
  onTheme: (choice) => void store.set({ theme: choice }),
  pageTools: { onPin: () => void pin(), onSidePanel: () => void openSidePanel(), status: toolsStatus },
  onAccount: () => void openAccount(),
  yourData: { onOpenWebsite: () => openUrl(`${EXPLAIN_WEB_URL}/app/account`) },
  legal: { note: EXTENSION_PRIVACY_NOTE, onPrivacy: () => openUrl(`${EXPLAIN_WEB_URL}/privacy`) },
  atlas: {
    icon: "plug",
    label: "Connect ATLAS on this computer",
    // Asks for the optional localhost permission in the click itself (Chrome requires a user gesture).
    run: () => {
      if (!hasChrome) return;
      const change = atlasAllowed
        ? chrome.permissions.remove({ origins: ATLAS_ORIGINS })
        : chrome.permissions.request({ origins: ATLAS_ORIGINS });
      void change.then(() => location.reload()).catch(() => undefined);
    },
  },
  about: { version, hint: SHORTCUT_HINT, action: { icon: "external", label: "Open the web app", run: () => openUrl(EXPLAIN_WEB_URL) } },
});
function openSettings(): void {
  shell.openSheet("Settings", settings.nodes);
}

/* ---------- events ---------- */

window.addEventListener("online", () => { updateConnection(); refreshEngine(); });
window.addEventListener("offline", () => { updateConnection(); refreshEngine(); });

function refreshEngine(): void {
  const forced = preview.get("engine");
  if (!hasChrome && isEngineState(forced)) panel.engine.set(forced);
  else void panel.engine.refresh();
}

void boot();

async function boot(): Promise<void> {
  refreshEngine();
  applySignal(previewSignal());
  const stored = await store.get();
  const theme: ThemeChoice = isTheme(stored.theme) ? stored.theme : hasChrome ? "system" : readPreviewTheme();
  applyTheme(theme);
  settings.setTheme(theme);
  panel.setHistory(parseHistory(stored.history));
  storedLearned = stored[LEARN_KEY as "learned"] ?? [];
  if (import.meta.env.DEV && !hasChrome) {
    const done = preview.get("learned");
    if (done) storedLearned = done.split(",");
  }
  // Load the glossary chunk once the popup is idle, so related-term chips are ready for the first answer.
  const warm = () => void loadLearnModule().then((mod) => { relatedTermsFn = mod.relatedTerms; }).catch(() => undefined);
  if ("requestIdleCallback" in window) requestIdleCallback(warm, { timeout: 2_000 });
  else setTimeout(warm, 800);
  if (!hasChrome) {
    // Opened as a plain page (development screenshots): live prices only, no Chrome APIs.
    startAssets();
    if (import.meta.env.DEV) applyPreviewState();
    return;
  }
  atlasAllowed = await chrome.permissions.contains({ origins: ATLAS_ORIGINS }).catch(() => false);
  if (atlasAllowed) settings.setAtlasLabel("Disconnect ATLAS on this computer");
  const priceFeed: PriceFeedOptions = { ...DEFAULT_PRICE_FEED };
  startAssets(priceFeed);
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
  panel.setText(pending.selection);
  if (pending.auto) await panel.run({ page: { title: pending.title, url: pending.url } });
}

function showOnboarding(): void {
  const close = (): void => {
    shell.overlay(null);
    void store.set({ onboarded: true });
  };
  shell.overlay(onboarding(() => {
    close();
    panel.focus();
  }, {
    onTry: () => {
      close();
      shell.select("explain");
      panel.explain(SAMPLE_TERM);
    },
  }));
}

/* ---------- explain flow ---------- */

/** How the popup gets an answer: the page highlight (when asked), Gemini Nano first, then the cloud bridge. */
async function askPopup(request: ExplainRequest): Promise<ExplainOutcome> {
  let raw = { selection: request.text, title: request.page?.title ?? "", url: request.page?.url ?? "" };
  if (request.fromPage && hasChrome) {
    const tab = await activeTab();
    if (!tab?.id) return { kind: "error", message: "Open a normal web page, highlight some text, then try again.", retry: false };
    try {
      const [injected] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readSelectionInPage });
      raw = {
        selection: injected?.result?.selection || request.text,
        title: injected?.result?.title || tab.title || "",
        url: tab.url || "",
      };
      if (raw.selection) request.setSubject(raw.selection);
    } catch {
      return { kind: "error", message: "Chrome does not let extensions read this page. Paste the term in the box instead.", retry: false };
    }
  }
  if (!raw.selection.trim()) {
    return { kind: "nothing", message: "Nothing is highlighted yet. Select a word or sentence on the page, or type a term above." };
  }

  const context = toPageContext(raw);
  const built = buildExtensionPrompt({ context, question: request.question });
  const answered = (rawText: string, source: "on_device" | "in_cloud"): ExplainOutcome => ({
    kind: "answer",
    rawText,
    source,
    subject: context.selection || request.text,
    contextLine: pageKindLine(context.page, context.host),
    notes: context.redacted ? ["Account-like numbers were removed before anything was sent."] : [],
  });

  // Firebase loads only now, never when the popup opens. Highlight-to-explain is free on every plan.
  const cloudModule = navigator.onLine ? await import("./cloud").catch(() => null) : null;

  request.progress(1);
  const local = await explainOnDevice(built.prompt, TWO_SIDED_SCHEMA);
  if (local) return answered(local, "on_device");
  if (!cloudModule || !navigator.onLine) return { kind: "offline" };

  request.progress(2);
  try {
    const cloud = await withDeadline(cloudModule.explainInCloud(built.prompt), EXPLAIN_DEADLINE_MS, "The answer took too long.");
    return cloud.blocked ? { kind: "limit", message: cloud.text } : answered(cloud.text, "in_cloud");
  } catch (error) {
    if (error instanceof CloudAllowanceUsed) return { kind: "limit", message: error.message };
    return { kind: "error", message: friendlyCloudError(error instanceof Error && error.message ? error.message : ""), retry: true };
  }
}

function friendlyCloudError(message: string): string {
  report(classifyCloudError(message), "extension", message.includes("throttl") ? "app_check_throttled" : "cloud_failed");
  return cloudErrorCopy(message, "extension");
}

/* ---------- signal ---------- */

function previewSignal(): SignalView {
  const requested = import.meta.env.DEV ? preview.get("signal") : null;
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
  const atlasPresent = atlasLocal || currentSignal.connected;
  today.node.hidden = !atlasPresent;
  shell.setTabHidden("signal", !atlasPresent);
  shell.setMenuItemHidden("desk", !atlasPresent);
  shell.setConnection(connectionFor({ online: navigator.onLine, deskConnected: currentSignal.connected, atlasLocal, livePrices }));
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
  const open = labelledButton("user", "Sign in on the website", "primary");
  open.addEventListener("click", () => openUrl(signInUrl));
  shell.openSheet("Account", [status, open, el("p", "fine", "The extension uses the account you sign in with on the ATLAS Explain website in this Chrome profile. You can keep using it without an account.")]);
  if (!hasChrome || !navigator.onLine) {
    status.textContent = navigator.onLine ? "Account details show in Chrome." : "You're offline. Your account status will show when you reconnect.";
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
    status.textContent = "We couldn't check your account just now. Explanations still work.";
  }
}

function openUrl(url: string): void {
  if (hasChrome) void chrome.tabs.create({ url });
  else window.open(url, "_blank", "noreferrer");
}

function privacyLink(): HTMLElement {
  const p = el("p", "fine");
  const a = el("a", undefined, "Read the full privacy policy") as HTMLAnchorElement;
  a.href = `${EXPLAIN_WEB_URL}/privacy`;
  a.target = "_blank";
  a.rel = "noopener";
  p.append(a);
  return p;
}

/* ---------- development screenshots (no Chrome APIs; compiled out of production) ---------- */

function readPreviewTheme(): ThemeChoice {
  const value = preview.get("theme");
  return isTheme(value) ? value : "system";
}

function applyPreviewState(): void {
  const tab = preview.get("tab");
  if (tab === "assets" || tab === "signal" || tab === "glossary") shell.select(tab);
  if (tab === "settings") openSettings();
  const sheet = preview.get("asset");
  if (sheet) void assets?.open(sheet);
  const demo = preview.get("demo");
  if (demo === "answer") {
    panel.setText(SAMPLE_EXPLANATION.selection);
    panel.engine.markRun("on_device");
    panel.show({ kind: "answer", rawText: SAMPLE_EXPLANATION.text, source: "on_device", subject: SAMPLE_EXPLANATION.selection }, true);
  } else if (demo === "loading") {
    panel.showLoading(1);
  } else if (demo === "error") {
    panel.show({ kind: "error", message: "We couldn't reach the cloud. Check your connection and try again.", retry: true });
  } else if (demo === "offline") {
    panel.show({ kind: "offline" });
  } else if (demo === "limit") {
    panel.show({ kind: "limit", message: new CloudAllowanceUsed().message });
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

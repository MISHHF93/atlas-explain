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
import { mountAssets, type AssetsPreview } from "../../src/wallet/assets-controller";
import { el, labelledButton, prefersReducedMotion } from "../../src/wallet/dom";
import { installErrorBoundary } from "../../src/wallet/error-boundary";
import { applyTheme, createWalletShell, isTheme, type ThemeChoice } from "../../src/wallet/shell";
import { explainOnDevice } from "./on-device";
import { pinExplainButton, probeAtlasDesk, readSelectionInPage } from "./read-selection";

interface PendingExplain {
  selection: string;
  title: string;
  url: string;
  auto?: boolean;
}

type RunOptions = { highlight: boolean; fromPage: boolean; pending?: PendingExplain };

const hasChrome = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
const preview = new URLSearchParams(location.search);
const host = document.querySelector("#app");
if (!(host instanceof HTMLElement)) throw new Error("Missing #app");
installErrorBoundary(host);

const store = {
  async get(): Promise<{ theme?: unknown; appCheckDebugToken?: unknown; onboarded?: unknown }> {
    if (hasChrome) return chrome.storage.local.get(["theme", "appCheckDebugToken", "onboarded"]);
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
  menu: [
    { label: "How ATLAS Explain works", icon: "help", run: () => showOnboarding() },
    { label: "Open the ATLAS desk", icon: "external", run: () => openUrl(ATLAS_DESK_URL) },
    { label: "Open the web app", icon: "external", run: () => openUrl(EXPLAIN_WEB_URL) },
    { label: "Privacy", icon: "shield", run: () => shell.openSheet("Privacy", [el("p", undefined, EXTENSION_PRIVACY_NOTE), el("p", undefined, LOCAL_ATLAS_PERMISSION_NOTE), el("p", "fine", EXTENSION_DISCLAIMER)]) },
    { label: "Settings", icon: "gear", run: () => shell.select("settings", { focus: true }) },
  ],
});

/* ---------- Explain tab ---------- */

const question = document.createElement("textarea");
question.id = "question";
question.rows = 2;
question.placeholder = "Or type a term: stop-limit, margin, spread, IV…";
question.setAttribute("aria-label", "Term or text to explain");
const explainSelection = labelledButton("highlight", "Explain highlight", "primary");
const explainTyped = labelledButton("sparkle", "Explain text", "secondary");
explainTyped.disabled = true;
const buttons = el("div", "button-row");
buttons.append(explainSelection, explainTyped);
const result = el("div", "stack result");
result.setAttribute("aria-live", "polite");
const explainHead = el("div", "panel-title");
explainHead.append(el("h1", undefined, "Explain"), el("span", "fine", "Education only"));
shell.panels.explain.append(explainHead, question, buttons, result);

/* ---------- Assets tab ---------- */

// Reads ATLAS on this computer (http://localhost:3000, host permission). The no-Chrome
// preview page shows captured box data instead, under a banner, and never fetches.
let assets: ReturnType<typeof mountAssets> | null = null;
let atlasLocal = false;

function startAssets(previewData?: AssetsPreview): void {
  assets = mountAssets({
    shell,
    canReachAtlas: hasChrome,
    preview: previewData,
    onState: (state) => {
      atlasLocal = state.kind === "ready" && !previewData;
      updateConnection();
    },
    onExplain: (text) => {
      question.value = text;
      explainTyped.disabled = false;
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
    explainTyped.disabled = false;
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
shell.panels.glossary.append(
  glossaryHead,
  glossaryPanel({
    askLabel: "Explain in more depth",
    onAsk: (term) => {
      question.value = `Explain "${term.title}" in plain language with a short example. Do not recommend a trade.`;
      explainTyped.disabled = false;
      shell.select("explain");
      void run({ highlight: false, fromPage: false });
    },
  }),
);

/* ---------- Settings tab ---------- */

const toolsStatus = el("p", "fine");
toolsStatus.setAttribute("role", "status");
const debugToken = document.createElement("input");
debugToken.type = "password";
debugToken.id = "debug-token";
debugToken.placeholder = "App Check debug token";
debugToken.autocomplete = "off";
debugToken.spellcheck = false;
debugToken.addEventListener("change", () => void store.set({ appCheckDebugToken: debugToken.value.trim() }));
const debugLabel = el("label", "field-label", "Cloud fallback token");
debugLabel.htmlFor = "debug-token";
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
    el("p", "fine", "Explanations run on this device first with Gemini Nano. If Chrome does not have it, Firebase AI Logic answers in the cloud."),
    debugLabel,
    debugToken,
    el("p", "fine", "The reCAPTCHA key does not cover extension pages, so cloud fallback needs a registered App Check debug token once."),
  ]),
  group("Privacy", [el("p", "fine", EXTENSION_PRIVACY_NOTE), el("p", "fine", LOCAL_ATLAS_PERMISSION_NOTE)]),
  group("About", [el("p", "fine", `ATLAS Explain ${version} · Apache-2.0 · ${SHORTCUT_HINT}`), row("external", "Open the web app", () => openUrl(EXPLAIN_WEB_URL))]),
);

/* ---------- events ---------- */

let lastRun: RunOptions | null = null;
question.addEventListener("input", () => {
  explainTyped.disabled = question.value.trim().length === 0;
});
question.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && question.value.trim()) {
    event.preventDefault();
    void run({ highlight: false, fromPage: false });
  }
});
explainSelection.addEventListener("click", () => void run({ highlight: true, fromPage: true }));
explainTyped.addEventListener("click", () => void run({ highlight: false, fromPage: false }));
window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);

void boot();

async function boot(): Promise<void> {
  showResult(emptyCard(undefined, SHORTCUT_HINT));
  applySignal(previewSignal());
  const stored = await store.get();
  const theme: ThemeChoice = isTheme(stored.theme) ? stored.theme : hasChrome ? "system" : readPreviewTheme();
  applyTheme(theme);
  themeSlot.replaceChildren(themePicker(theme, (choice) => {
    applyTheme(choice);
    void store.set({ theme: choice });
  }));
  if (typeof stored.appCheckDebugToken === "string") debugToken.value = stored.appCheckDebugToken;
  if (!hasChrome) {
    startAssets(await previewAssets());
    applyPreviewState();
    return;
  }
  startAssets();
  if (stored.onboarded !== true) showOnboarding();
  await refreshSignal();
  const session = await chrome.storage.session.get("pending");
  const pending = session.pending as PendingExplain | undefined;
  if (!pending) return;
  await chrome.storage.session.remove("pending");
  question.value = pending.selection;
  explainTyped.disabled = !pending.selection.trim();
  if (pending.auto) await run({ highlight: true, fromPage: false, pending });
}

function showOnboarding(): void {
  shell.overlay(onboarding(() => {
    shell.overlay(null);
    void store.set({ onboarded: true });
    explainSelection.focus();
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
        explainTyped.disabled = false;
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
  const built = buildExtensionPrompt({ context, question: options.highlight ? "" : question.value });
  const token = debugToken.value.trim() || null;

  // Entitlements come from Remote Config. Firebase loads only now, never when the popup opens.
  const cloudModule = navigator.onLine ? await import("./cloud").catch(() => null) : null;
  const settingsNow = cloudModule ? await cloudModule.loadExtensionSettings(token) : parseRemoteSettings({}).settings;
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
  const local = await explainOnDevice(built.prompt);
  if (local) {
    answer(withDisclaimer(local), "on_device", context.selection, context.redacted);
    return;
  }
  if (!cloudModule || !navigator.onLine) {
    setBusy(false);
    showResult(offlineCard());
    return;
  }

  showResult(loadingCard(2));
  try {
    const cloud = await cloudModule.explainInCloud(built.prompt, token);
    if (cloud.blocked) {
      setBusy(false);
      showResult(limitCard(cloud.text));
      return;
    }
    answer(withDisclaimer(cloud.text), "in_cloud", context.selection, context.redacted);
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

function answer(text: string, source: "on_device" | "in_cloud", selection: string, redacted: boolean): void {
  setBusy(false);
  showResult(explanationCard({
    source,
    selection,
    text,
    copyText: text,
    notes: redacted ? ["Account-like numbers were removed before anything was sent."] : [],
    onClear: () => {
      showResult(emptyCard(undefined, SHORTCUT_HINT));
      explainSelection.focus();
    },
  }));
  shell.announce("Explanation ready.");
}

function fail(text: string, retry: boolean): void {
  setBusy(false);
  const replay = lastRun;
  showResult(messageCard("error", "That did not work", text, retry && replay ? () => void run(replay) : undefined));
}

function friendlyCloudError(message: string): string {
  if (/app.?check|recaptcha|attestation/i.test(message)) {
    return "Cloud fallback needs an App Check debug token. Add it in Settings → AI, then try again.";
  }
  if (/network|fetch|offline/i.test(message)) return "The cloud model could not be reached. Check your connection and retry.";
  return message;
}

function setBusy(busy: boolean): void {
  result.setAttribute("aria-busy", busy ? "true" : "false");
  explainSelection.disabled = busy;
  explainTyped.disabled = busy || question.value.trim().length === 0;
  explainSelection.classList.toggle("loading", busy);
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
  shell.setConnection(!navigator.onLine ? "offline" : currentSignal.connected ? "desk" : atlasLocal ? "local" : "none");
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
  await chrome.sidePanel.setOptions({ tabId: tab.id, path: "popup.html", enabled: true });
  await chrome.sidePanel.open({ tabId: tab.id });
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
    explainTyped.disabled = false;
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
  if (preview.get("term") === "open") document.querySelector<HTMLDetailsElement>(".term details")?.setAttribute("open", "");
}

function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
}

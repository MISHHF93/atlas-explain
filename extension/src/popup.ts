import { BETA_BADGE, CloudAllowanceUsed } from "../../src/core/billing";
import {
  EXTENSION_DISCLAIMER,
  EXTENSION_PRIVACY_NOTE,
  buildExtensionPrompt,
  extensionHighlightAllowed,
  toPageContext,
  withDisclaimer,
} from "../../src/core/extension-prompt";
import { explainInCloud, loadExtensionSettings } from "./cloud";
import { explainOnDevice } from "./on-device";
import { mapSignal, readPublicSignal, type SignalView } from "../../src/core/signal";
import { pinExplainButton, probeAtlasDesk, readSelectionInPage } from "./read-selection";

interface PendingExplain {
  selection: string;
  title: string;
  url: string;
  auto?: boolean;
}

const hasChrome = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  text?: string,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

const signalLight = h("span", undefined, "signal-light");
signalLight.dataset.state = "grey";
const signalReason = h("p", "connect ATLAS", "signal-reason");
const signalMeta = h("p", "Hit rate — · Sample —", "signal-meta");
const signalPaper = h("p", "", "signal-paper");
const signalSection = h("section", undefined, "signal");
signalSection.setAttribute("role", "status");
signalSection.append(signalLight, signalReason, signalMeta, signalPaper);
const whyButton = h("button", "Why this colour?", "secondary");
whyButton.type = "button";
whyButton.id = "why-colour";
const themeButton = h("button", "Dark", "theme");
themeButton.type = "button";
themeButton.setAttribute("aria-pressed", "false");

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");

const question = document.createElement("textarea");
question.id = "question";
question.placeholder = "Or type a term: stop-limit, margin, spread, IV…";

const status = h("p", "", "fine");
status.id = "status";
const path = h("p", "", "path");
path.id = "path";
path.hidden = true;
const answer = h("div", "", "answer");
answer.id = "answer";
answer.hidden = true;

const explainSelection = h("button", "Explain highlighted text", "primary");
explainSelection.type = "button";
const explainTyped = h("button", "Explain this text", "secondary");
explainTyped.type = "button";
const pinButton = h("button", "Show button on this page", "secondary");
pinButton.type = "button";
const sideButton = h("button", "Open side panel", "secondary");
sideButton.type = "button";

const debugToken = document.createElement("input");
debugToken.type = "text";
debugToken.placeholder = "App Check debug token for cloud fallback";
debugToken.autocomplete = "off";

root.append(
  wrap([
    header(),
    signalSection,
    whyButton,
    h("p", EXTENSION_PRIVACY_NOTE, "privacy"),
    path,
    question,
    actions([explainSelection, explainTyped, pinButton, sideButton]),
    status,
    answer,
    h("p", EXTENSION_DISCLAIMER, "disclaimer"),
    h("p", "Cloud fallback uses Firebase AI Logic. The reCAPTCHA key does not cover extension pages, so paste a registered App Check debug token once.", "fine"),
    debugToken,
  ]),
);

whyButton.addEventListener("click", () => {
  question.value = `Why is the signal ${signalReason.textContent}? Explain the uncertainty. Do not recommend a trade.`;
  void run({ highlight: false, fromPage: false });
});
themeButton.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  themeButton.textContent = next === "dark" ? "Light" : "Dark";
  themeButton.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
  if (hasChrome) void chrome.storage.local.set({ theme: next });
});

explainSelection.addEventListener("click", () => {
  void run({ highlight: true, fromPage: true });
});
explainTyped.addEventListener("click", () => {
  void run({ highlight: false, fromPage: false });
});
pinButton.addEventListener("click", () => {
  void pin();
});
sideButton.addEventListener("click", () => {
  void openSidePanel();
});
debugToken.addEventListener("change", () => {
  if (!hasChrome) return;
  void chrome.storage.local.set({ appCheckDebugToken: debugToken.value.trim() });
});

void boot();

async function boot(): Promise<void> {
  applySignal(previewSignal());
  if (!hasChrome) return;
  const stored = await chrome.storage.local.get(["appCheckDebugToken", "theme"]);
  if (stored.theme === "dark" || stored.theme === "light") {
    document.documentElement.dataset.theme = stored.theme;
    themeButton.textContent = stored.theme === "dark" ? "Light" : "Dark";
    themeButton.setAttribute("aria-pressed", stored.theme === "dark" ? "true" : "false");
  }
  await refreshSignal();
  if (typeof stored.appCheckDebugToken === "string") debugToken.value = stored.appCheckDebugToken;
  const session = await chrome.storage.session.get("pending");
  const pending = session.pending as PendingExplain | undefined;
  if (!pending) return;
  await chrome.storage.session.remove("pending");
  question.value = pending.selection;
  if (pending.auto) {
    await run({ highlight: true, fromPage: false, pending });
  }
}

async function run(options: { highlight: boolean; fromPage: boolean; pending?: PendingExplain }): Promise<void> {
  status.textContent = "Reading only the highlight, title, and site name…";
  answer.hidden = true;
  path.hidden = true;
  let raw = { selection: question.value, title: "", url: "" };
  if (options.pending) {
    raw = options.pending;
  } else if (options.fromPage && hasChrome) {
    const tab = await activeTab();
    if (!tab?.id) {
      status.textContent = "Open a normal web page, highlight text, then click again.";
      return;
    }
    try {
      const [injected] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: readSelectionInPage,
      });
      raw = {
        selection: injected?.result?.selection || question.value,
        title: injected?.result?.title || tab.title || "",
        url: tab.url || "",
      };
      if (raw.selection) question.value = raw.selection;
    } catch {
      status.textContent = "This page cannot be read. Paste the term in the box instead.";
      return;
    }
  }
  const context = toPageContext(raw);
  const built = buildExtensionPrompt({ context, question: options.highlight ? "" : question.value });
  const token = debugToken.value.trim() || null;
  const settings = await loadExtensionSettings(token);
  if (options.highlight && !extensionHighlightAllowed({
    billingEnabled: settings.billingEnabled,
    plan: "free",
    freeCloudDailyLimit: settings.freeCloudDailyLimit,
  })) {
    showLimit("Highlight-to-explain is a Pro entitlement. Pro is coming after beta.");
    return;
  }
  status.textContent = "Trying Gemini Nano on this device…";
  const local = await explainOnDevice(built.prompt);
  if (local) {
    showAnswer(withDisclaimer(local), "on_device", context.redacted);
    return;
  }
  status.textContent = "On-device model is unavailable. Asking Firebase AI Logic in the cloud…";
  try {
    const cloud = await explainInCloud(built.prompt, token);
    if (cloud.blocked) {
      showLimit(cloud.text);
      return;
    }
    showAnswer(withDisclaimer(cloud.text), "in_cloud", context.redacted);
  } catch (error) {
    if (error instanceof CloudAllowanceUsed) {
      showLimit(error.message);
      return;
    }
    status.textContent = error instanceof Error ? error.message : "The cloud model did not answer.";
  }
}

function showAnswer(text: string, source: "on_device" | "in_cloud", redacted: boolean): void {
  answer.hidden = false;
  answer.className = "answer";
  answer.textContent = text;
  path.hidden = false;
  path.className = source === "on_device" ? "path path-device" : "path path-cloud";
  path.textContent = source === "on_device"
    ? "On-device. Gemini Nano via the Chrome Prompt API."
    : "Cloud. Gemini via Firebase AI Logic.";
  status.textContent = redacted
    ? "Some account-like numbers in the highlight were removed before the prompt was sent."
    : "Answer ready.";
}

function showLimit(text: string): void {
  answer.hidden = false;
  answer.className = "answer limit";
  answer.textContent = `${text}\n\n${EXTENSION_DISCLAIMER}`;
  status.textContent = BETA_BADGE;
}

async function pin(): Promise<void> {
  if (!hasChrome) {
    status.textContent = "The page button is available in Chrome.";
    return;
  }
  const tab = await activeTab();
  if (!tab?.id) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: pinExplainButton });
    status.textContent = "Button added on this page. Click it after you highlight text.";
  } catch {
    status.textContent = "This page does not allow the button. Use the popup instead.";
  }
}

async function openSidePanel(): Promise<void> {
  if (!hasChrome) return;
  const granted = await chrome.permissions.request({ permissions: ["sidePanel"] });
  if (!granted) {
    status.textContent = "Side panel permission was not granted.";
    return;
  }
  const tab = await activeTab();
  if (tab?.id == null) return;
  await chrome.sidePanel.setOptions({ tabId: tab.id, path: "popup.html", enabled: true });
  await chrome.sidePanel.open({ tabId: tab.id });
}

function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
}

function header(): HTMLElement {
  const row = h("div", undefined, "top");
  const lockup = h("div", undefined, "brand-lockup");
  const logo = document.createElement("img");
  logo.src = "./logo.svg";
  logo.alt = "";
  logo.width = 28;
  logo.height = 28;
  logo.className = "logo";
  const title = h("div");
  title.append(h("p", "ATLAS", "mark"), h("h1", "Explain"));
  lockup.append(logo, title);
  const tools = h("div", undefined, "actions");
  tools.append(h("p", BETA_BADGE, "badge"), themeButton);
  row.append(lockup, tools);
  return row;
}

function previewSignal(): SignalView {
  const requested = new URLSearchParams(location.search).get("signal");
  if (requested === "green" || requested === "red") {
    return mapSignal({
      connected: true,
      modelsClearGate: true,
      signal: {
        lean: requested === "green" ? "up" : "down",
        hitRate: 0.62,
        sampleSize: 240,
      },
    });
  }
  if (requested === "thin") {
    return mapSignal({
      connected: true,
      signal: { lean: "up", hitRate: 0.51, sampleSize: 12 },
    });
  }
  return mapSignal({ connected: false });
}

async function refreshSignal(): Promise<void> {
  const tab = await activeTab();
  if (!tab?.id || !tab.url) {
    applySignal(mapSignal({ connected: false }));
    return;
  }
  try {
    const [injected] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: probeAtlasDesk,
    });
    const result = injected?.result;
    if (!result?.connected) {
      applySignal(mapSignal({ connected: false }));
      return;
    }
    applySignal(mapSignal({ connected: true, signal: readPublicSignal(result.payload) }));
  } catch {
    applySignal(mapSignal({ connected: false }));
  }
}

function applySignal(view: SignalView): void {
  signalLight.dataset.state = view.colour;
  signalReason.textContent = view.reason;
  signalMeta.textContent = `${view.hitRateLabel} · ${view.sampleLabel}`;
  signalPaper.textContent = view.paperLabel;
  signalSection.setAttribute("aria-label", `${view.reason}. ${view.hitRateLabel}. ${view.sampleLabel}. ${view.paperLabel}`);
}

function actions(buttons: HTMLButtonElement[]): HTMLElement {
  const row = h("div", undefined, "actions");
  row.append(...buttons);
  return row;
}

function wrap(nodes: Node[]): HTMLElement {
  const div = h("div", undefined, "wrap");
  div.append(...nodes);
  return div;
}

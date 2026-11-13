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
import { pinExplainButton, readSelectionInPage } from "./read-selection";

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
  if (!hasChrome) {
    question.value = "What is a stop-limit order?";
    path.hidden = false;
    path.className = "path path-device";
    path.textContent = "On-device. Gemini Nano via the Chrome Prompt API.";
    answer.hidden = false;
    answer.textContent = withDisclaimer(
      "A stop-limit order waits until a stop price is reached, then places a limit order. It does not guarantee a fill. A buyer and a seller can read the same order ticket differently: one sees a planned exit, the other sees a price that may be skipped in a fast market.",
    );
    return;
  }
  const stored = await chrome.storage.local.get("appCheckDebugToken");
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
  const title = h("div");
  title.append(h("p", "ATLAS", "mark"), h("h1", "Explain"));
  row.append(title, h("p", BETA_BADGE, "badge"));
  return row;
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

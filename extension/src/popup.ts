import { BETA_BADGE, CloudAllowanceUsed } from "../../src/core/billing";
import {
  EXTENSION_DISCLAIMER,
  EXTENSION_PRIVACY_NOTE,
  buildExtensionPrompt,
  extensionHighlightAllowed,
  toPageContext,
  withDisclaimer,
} from "../../src/core/extension-prompt";
import {
  ATLAS_DESK_URL,
  BILLING_NOTE,
  EMPTY_BODY,
  EMPTY_TITLE,
  EXPLAIN_WEB_URL,
  OFFLINE_ANSWER,
  SAMPLE_EXPLANATION,
  SHORTCUT_HINT,
  STEP_CLOUD,
  STEP_DEVICE,
  STEP_READ,
  connectionCopy,
  shortSelection,
  signalCopy,
  whyQuestion,
  type ConnectionState,
} from "../../src/core/popup-copy";
import { parseRemoteSettings } from "../../src/core/settings";
import { mapSignal, readPublicSignal, type SignalView } from "../../src/core/signal";
import { icon, type IconName } from "./icons";
import { explainOnDevice } from "./on-device";
import { pinExplainButton, probeAtlasDesk, readSelectionInPage } from "./read-selection";

interface PendingExplain {
  selection: string;
  title: string;
  url: string;
  auto?: boolean;
}

type ThemeChoice = "system" | "light" | "dark";
type Source = "on_device" | "in_cloud";

const hasChrome = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
const preview = new URLSearchParams(location.search);

/* ---------- tiny DOM helpers ---------- */

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function iconButton(name: IconName, label: string, className = "icon-btn"): HTMLButtonElement {
  const button = el("button", className);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(icon(name));
  return button;
}

function labelledButton(name: IconName, label: string, className: string): HTMLButtonElement {
  const button = el("button", className);
  button.type = "button";
  button.append(icon(name, 16), el("span", undefined, label));
  return button;
}

/* ---------- header ---------- */

const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) throw new Error("Missing #app");

const shell = el("div", "shell");
shell.dataset.view = "home";

const header = el("header", "bar");
const lockup = el("div", "lockup");
const logo = document.createElement("img");
logo.src = "./logo.svg";
logo.alt = "";
logo.width = 30;
logo.height = 30;
logo.className = "logo";
const wordmark = el("div", "wordmark");
wordmark.append(el("span", "mark", "ATLAS"), el("span", "name", "Explain"));
lockup.append(logo, wordmark);

const connection = el("span", "conn");
connection.dataset.state = "none";
const connectionDot = el("span", "conn-dot");
const connectionLabel = el("span", "conn-label", "Not connected");
connection.append(connectionDot, connectionLabel);

const settingsButton = iconButton("gear", "Settings");
settingsButton.setAttribute("aria-controls", "settings");
settingsButton.setAttribute("aria-expanded", "false");
const headTools = el("div", "bar-tools");
headTools.append(connection, settingsButton);
header.append(lockup, headTools);

/* ---------- signal card ---------- */

const signalCard = el("section", "signal");
signalCard.dataset.state = "grey";
signalCard.setAttribute("aria-labelledby", "signal-headline");

const orb = el("div", "orb");
orb.setAttribute("aria-hidden", "true");
const orbCore = el("span", "orb-core");
orb.append(el("span", "orb-ring"), el("span", "orb-ring orb-ring-2"), orbCore);

const signalText = el("div", "signal-text");
const eyebrow = el("p", "eyebrow", "Paper signal light");
const headline = el("h1", "headline", "Connect ATLAS");
headline.id = "signal-headline";
const live = el("p", "sr-only");
live.setAttribute("role", "status");
live.setAttribute("aria-live", "polite");
signalText.append(eyebrow, headline);

const refreshButton = iconButton("refresh", "Read the signal again", "icon-btn ghost refresh");

const signalTop = el("div", "signal-top");
signalTop.append(orb, signalText, refreshButton);

const chips = el("div", "chips");
const hitChip = el("span", "chip");
const sampleChip = el("span", "chip");
const gateChip = el("span", "chip chip-gate");
chips.append(hitChip, sampleChip, gateChip);

const why = el("details", "why");
const whySummary = el("summary");
whySummary.append(el("span", undefined, "Why this colour?"), icon("chevron", 14));
const whyBody = el("p", "why-body");
const deskSays = el("p", "why-body desk-says");
deskSays.hidden = true;
const whyAsk = labelledButton("sparkle", "Explain it in depth", "link-btn");
const deskLink = el("a", "link-btn", "Open the ATLAS desk");
deskLink.href = ATLAS_DESK_URL;
deskLink.target = "_blank";
deskLink.rel = "noreferrer";
deskLink.prepend(icon("external", 14));
const whyActions = el("div", "why-actions");
whyActions.append(whyAsk, deskLink);
why.append(whySummary, whyBody, deskSays, whyActions);

const paper = el("p", "paper");

const legend = el("ul", "legend");
legend.setAttribute("aria-label", "What the colours mean");
for (const [state, text] of [["green", "leans up"], ["red", "leans down"], ["grey", "not enough evidence"]] as const) {
  const item = el("li");
  item.dataset.state = state;
  item.append(el("span", "legend-dot"), el("span", undefined, text));
  legend.append(item);
}

signalCard.append(signalTop, chips, paper, legend, why);

/* ---------- ask + result ---------- */

const ask = el("section", "ask");
ask.setAttribute("aria-label", "Explain text");
const question = document.createElement("textarea");
question.id = "question";
question.rows = 2;
question.placeholder = "Or type a term: stop-limit, margin, spread, IV…";
question.setAttribute("aria-label", "Term or text to explain");
const explainSelection = labelledButton("highlight", "Explain highlight", "primary");
const explainTyped = labelledButton("sparkle", "Explain text", "secondary");
explainTyped.disabled = true;
const askActions = el("div", "ask-actions");
askActions.append(explainSelection, explainTyped);
ask.append(question, askActions);

const result = el("section", "result");
result.dataset.state = "empty";
result.setAttribute("aria-live", "polite");
result.setAttribute("aria-busy", "false");
result.setAttribute("aria-label", "Explanation");

/* ---------- footer ---------- */

const footer = el("footer", "foot");
const privacy = el("p", "privacy");
privacy.title = EXTENSION_PRIVACY_NOTE;
privacy.append(icon("shield", 14), el("span", undefined, "Only your highlight, page title, and site name. Never balances or accounts."));
const disclaimer = el("p", "disclaimer", EXTENSION_DISCLAIMER);
const badge = el("span", "badge", BETA_BADGE);
const footRow = el("div", "foot-row");
footRow.append(disclaimer, badge);
footer.append(privacy, footRow);

/* ---------- settings sheet ---------- */

const settings = el("section", "sheet");
settings.id = "settings";
settings.setAttribute("role", "dialog");
settings.setAttribute("aria-modal", "true");
settings.setAttribute("aria-labelledby", "settings-title");
settings.hidden = true;
const sheetHead = el("div", "sheet-head");
const closeSettings = iconButton("back", "Back");
const sheetTitle = el("h2", undefined, "Settings");
sheetTitle.id = "settings-title";
sheetHead.append(closeSettings, sheetTitle);

const themeGroup = el("div", "segmented");
themeGroup.setAttribute("role", "radiogroup");
themeGroup.setAttribute("aria-label", "Appearance");
const themeButtons = new Map<ThemeChoice, HTMLButtonElement>();
for (const [choice, label, name] of [["system", "System", "monitor"], ["light", "Light", "sun"], ["dark", "Dark", "moon"]] as const) {
  const button = labelledButton(name, label, "seg");
  button.setAttribute("role", "radio");
  button.dataset.choice = choice;
  themeButtons.set(choice, button);
  themeGroup.append(button);
}

const pinButton = labelledButton("pin", "Show Explain button on this page", "row-btn");
const sideButton = labelledButton("panel", "Open in side panel", "row-btn");
const toolsStatus = el("p", "fine");
toolsStatus.setAttribute("role", "status");

const debugToken = document.createElement("input");
debugToken.type = "password";
debugToken.id = "debug-token";
debugToken.placeholder = "App Check debug token";
debugToken.autocomplete = "off";
debugToken.spellcheck = false;
const debugLabel = el("label", "field-label", "Cloud fallback token");
debugLabel.htmlFor = "debug-token";

const version = hasChrome ? chrome.runtime.getManifest().version : "preview";
const about = el("p", "fine");
about.append(`ATLAS Explain ${version} · Apache-2.0 · `);
const webLink = el("a", undefined, "Web app");
webLink.href = EXPLAIN_WEB_URL;
webLink.target = "_blank";
webLink.rel = "noreferrer";
about.append(webLink);

settings.append(
  sheetHead,
  group("Appearance", [themeGroup]),
  group("On this page", [pinButton, sideButton, toolsStatus]),
  group("AI", [
    el("p", "fine", "Explanations run on this device first with Gemini Nano. If Chrome does not have it, Firebase AI Logic answers in the cloud."),
    debugLabel,
    debugToken,
    el("p", "fine", "The reCAPTCHA key does not cover extension pages, so cloud fallback needs a registered App Check debug token once."),
  ]),
  group("Plan", [el("p", "plan", BILLING_NOTE)]),
  group("Privacy", [el("p", "fine", EXTENSION_PRIVACY_NOTE), el("p", "fine", EXTENSION_DISCLAIMER)]),
  about,
);

const main = el("main", "home");
main.append(signalCard, ask, result);
shell.append(header, main, footer, settings, live);
root.append(shell);

/* ---------- state ---------- */

let currentSignal: SignalView = mapSignal({ connected: false });
let deskConnected = false;
let lastRun: Parameters<typeof run>[0] | null = null;

/* ---------- events ---------- */

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
whyAsk.addEventListener("click", () => {
  question.value = whyQuestion(currentSignal);
  explainTyped.disabled = false;
  void run({ highlight: false, fromPage: false });
});
refreshButton.addEventListener("click", () => {
  refreshButton.classList.add("spin");
  void refreshSignal().finally(() => window.setTimeout(() => refreshButton.classList.remove("spin"), 450));
});
settingsButton.addEventListener("click", () => openSettings(true));
closeSettings.addEventListener("click", () => openSettings(false));
settings.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    openSettings(false);
  }
});
for (const [choice, button] of themeButtons) {
  button.addEventListener("click", () => void setTheme(choice, true));
}
pinButton.addEventListener("click", () => void pin());
sideButton.addEventListener("click", () => void openSidePanel());
debugToken.addEventListener("change", () => {
  if (hasChrome) void chrome.storage.local.set({ appCheckDebugToken: debugToken.value.trim() });
});
window.addEventListener("online", updateConnection);
window.addEventListener("offline", updateConnection);

void boot();

/* ---------- boot ---------- */

async function boot(): Promise<void> {
  renderEmpty();
  applySignal(previewSignal());
  if (!hasChrome) {
    await setTheme(readPreviewTheme(), false);
    applyPreviewState();
    return;
  }
  const stored = await chrome.storage.local.get(["appCheckDebugToken", "theme"]);
  await setTheme(isTheme(stored.theme) ? stored.theme : "system", false);
  if (typeof stored.appCheckDebugToken === "string") debugToken.value = stored.appCheckDebugToken;
  await refreshSignal();
  const session = await chrome.storage.session.get("pending");
  const pending = session.pending as PendingExplain | undefined;
  if (!pending) return;
  await chrome.storage.session.remove("pending");
  question.value = pending.selection;
  explainTyped.disabled = !pending.selection.trim();
  if (pending.auto) await run({ highlight: true, fromPage: false, pending });
}

/* ---------- explain flow ---------- */

async function run(options: { highlight: boolean; fromPage: boolean; pending?: PendingExplain }): Promise<void> {
  lastRun = options;
  setBusy(true);
  renderLoading(0);
  let raw = { selection: question.value, title: "", url: "" };
  if (options.pending) {
    raw = options.pending;
  } else if (options.fromPage && hasChrome) {
    const tab = await activeTab();
    if (!tab?.id) {
      renderError("Open a normal web page, highlight some text, then try again.", false);
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
      renderError("Chrome does not let extensions read this page. Paste the term in the box instead.", false);
      return;
    }
  }
  if (!raw.selection.trim() && !question.value.trim()) {
    setBusy(false);
    renderEmpty("Nothing is highlighted yet. Select a word or sentence on the page, or type a term above.");
    question.focus();
    return;
  }

  const context = toPageContext(raw);
  const built = buildExtensionPrompt({ context, question: options.highlight ? "" : question.value });
  const token = debugToken.value.trim() || null;

  // Entitlements come from Remote Config. Firebase loads only now, never when the popup opens.
  const cloudModule = navigator.onLine ? await import("./cloud").catch(() => null) : null;
  const settingsNow = cloudModule
    ? await cloudModule.loadExtensionSettings(token)
    : parseRemoteSettings({}).settings;
  if (options.highlight && !extensionHighlightAllowed({
    billingEnabled: settingsNow.billingEnabled,
    plan: "free",
    freeCloudDailyLimit: settingsNow.freeCloudDailyLimit,
  })) {
    renderLimit("Highlight-to-explain is a Pro entitlement. Pro is coming after beta.");
    return;
  }

  renderLoading(1);
  const local = await explainOnDevice(built.prompt);
  if (local) {
    renderAnswer(withDisclaimer(local), "on_device", context.selection, context.redacted);
    return;
  }

  if (!cloudModule || !navigator.onLine) {
    renderOffline();
    return;
  }

  renderLoading(2);
  try {
    const { explainInCloud } = cloudModule;
    const cloud = await explainInCloud(built.prompt, token);
    if (cloud.blocked) {
      renderLimit(cloud.text);
      return;
    }
    renderAnswer(withDisclaimer(cloud.text), "in_cloud", context.selection, context.redacted);
  } catch (error) {
    if (error instanceof CloudAllowanceUsed) {
      renderLimit(error.message);
      return;
    }
    const message = error instanceof Error && error.message ? error.message : "The cloud model did not answer.";
    renderError(friendlyCloudError(message), true);
  }
}

function friendlyCloudError(message: string): string {
  if (/app.?check|recaptcha|attestation/i.test(message)) {
    return "Cloud fallback needs an App Check debug token. Add it in Settings → AI, then try again.";
  }
  if (/network|fetch|offline/i.test(message)) return "The cloud model could not be reached. Check your connection and retry.";
  return message;
}

/* ---------- result renderers ---------- */

function setBusy(busy: boolean): void {
  result.setAttribute("aria-busy", busy ? "true" : "false");
  explainSelection.disabled = busy;
  explainTyped.disabled = busy || question.value.trim().length === 0;
  explainSelection.classList.toggle("loading", busy);
}

function swap(state: string, nodes: Node[]): void {
  result.dataset.state = state;
  result.replaceChildren(...nodes);
  result.classList.remove("enter");
  void result.offsetWidth;
  result.classList.add("enter");
  // While an explanation is on screen the light folds into a compact row, wallet style.
  const busy = state !== "empty";
  signalCard.classList.toggle("compact", busy);
  if (busy) why.open = false;
  if (busy) requestAnimationFrame(() => result.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" }));
}

function renderEmpty(note?: string): void {
  const art = el("div", "empty-art");
  art.append(icon("highlight", 22));
  const body = el("div");
  body.append(el("p", "result-title", EMPTY_TITLE), el("p", "fine", note ?? EMPTY_BODY));
  if (!note) body.append(el("p", "hint", SHORTCUT_HINT));
  swap("empty", [art, body]);
}

function renderLoading(step: 0 | 1 | 2): void {
  const steps = el("ol", "steps");
  [STEP_READ, STEP_DEVICE, STEP_CLOUD].forEach((text, index) => {
    const item = el("li");
    item.dataset.status = index < step ? "done" : index === step ? "active" : "todo";
    const mark = el("span", "step-mark");
    if (index < step) mark.append(icon("check", 12));
    item.append(mark, el("span", undefined, text));
    if (index === 2 && step < 2) item.dataset.status = "todo";
    steps.append(item);
  });
  const skeleton = el("div", "skeleton");
  skeleton.setAttribute("aria-hidden", "true");
  skeleton.append(el("span"), el("span"), el("span"));
  swap("loading", [steps, skeleton]);
  live.textContent = [STEP_READ, STEP_DEVICE, STEP_CLOUD][step] ?? "";
}

function renderAnswer(text: string, source: Source, selection: string, redacted: boolean): void {
  setBusy(false);
  const head = el("div", "answer-head");
  const chip = el("span", source === "on_device" ? "source source-device" : "source source-cloud");
  chip.append(
    icon(source === "on_device" ? "chip" : "cloud", 14),
    el("span", undefined, source === "on_device" ? "On-device · Gemini Nano" : "Cloud · Firebase AI Logic"),
  );
  const copy = iconButton("copy", "Copy explanation", "icon-btn ghost");
  copy.addEventListener("click", () => {
    void navigator.clipboard?.writeText(text).then(() => {
      copy.replaceChildren(icon("check"));
      copy.setAttribute("aria-label", "Copied");
      window.setTimeout(() => {
        copy.replaceChildren(icon("copy"));
        copy.setAttribute("aria-label", "Copy explanation");
      }, 1400);
    });
  });
  const clear = iconButton("close", "Clear explanation", "icon-btn ghost");
  clear.addEventListener("click", () => {
    renderEmpty();
    explainSelection.focus();
  });
  const tools = el("div", "answer-tools");
  tools.append(copy, clear);
  head.append(chip, tools);

  const nodes: Node[] = [head];
  if (selection.trim()) {
    const quote = el("blockquote", "quote", shortSelection(selection));
    nodes.push(quote);
  }
  const body = el("div", "answer-body");
  body.textContent = text;
  nodes.push(body);
  if (redacted) {
    const note = el("p", "note");
    note.append(icon("shield", 14), el("span", undefined, "Account-like numbers were removed before anything was sent."));
    nodes.push(note);
  }
  swap("answer", nodes);
  live.textContent = "Explanation ready.";
}

function renderLimit(text: string): void {
  setBusy(false);
  const head = el("p", "result-title");
  head.append(icon("info", 16), el("span", undefined, BETA_BADGE));
  swap("limit", [head, el("p", "fine strong", text), el("p", "fine", EXTENSION_DISCLAIMER)]);
  live.textContent = text;
}

function renderError(text: string, retry: boolean): void {
  setBusy(false);
  const head = el("p", "result-title");
  head.append(icon("alert", 16), el("span", undefined, "That did not work"));
  const nodes: Node[] = [head, el("p", "fine strong", text)];
  if (retry && lastRun) {
    const again = labelledButton("refresh", "Try again", "secondary small");
    const replay = lastRun;
    again.addEventListener("click", () => void run(replay));
    nodes.push(again);
  }
  swap("error", nodes);
  live.textContent = text;
}

function renderOffline(): void {
  setBusy(false);
  const head = el("p", "result-title");
  head.append(icon("offline", 16), el("span", undefined, "You are offline"));
  swap("offline", [head, el("p", "fine strong", OFFLINE_ANSWER)]);
  live.textContent = OFFLINE_ANSWER;
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
    if (!found?.connected) {
      applySignal(mapSignal({ connected: false }));
      return;
    }
    applySignal(mapSignal({ connected: true, signal: readPublicSignal(found.payload) }));
  } catch {
    applySignal(mapSignal({ connected: false }));
  }
}

function applySignal(view: SignalView): void {
  const changed = view.colour !== currentSignal.colour;
  currentSignal = view;
  deskConnected = view.connected;
  const copy = signalCopy(view);
  signalCard.dataset.state = view.colour;
  signalCard.dataset.connected = view.connected ? "true" : "false";
  orbCore.replaceChildren(icon(copy.icon, 22));
  headline.textContent = copy.headline;
  hitChip.textContent = view.hitRateLabel;
  sampleChip.textContent = view.sampleLabel;
  gateChip.textContent = copy.gate;
  whyBody.textContent = copy.detail;
  deskSays.hidden = !view.deskReason;
  deskSays.textContent = view.deskReason ? `ATLAS desk: ${view.deskReason}` : "";
  paper.textContent = view.paperLabel;
  deskLink.hidden = view.connected;
  if (changed) {
    orb.classList.remove("pop");
    void orb.offsetWidth;
    orb.classList.add("pop");
  }
  live.textContent = `${copy.headline}. ${view.hitRateLabel}. ${view.sampleLabel}. ${copy.gate}.`;
  updateConnection();
}

function updateConnection(): void {
  const state: ConnectionState = !navigator.onLine ? "offline" : deskConnected ? "desk" : "none";
  const copy = connectionCopy(state);
  connection.dataset.state = state;
  connectionLabel.textContent = copy.label;
  connection.title = copy.title;
}

/* ---------- settings ---------- */

function openSettings(open: boolean): void {
  if (open) {
    settings.hidden = false;
    shell.dataset.view = "settings";
    settingsButton.setAttribute("aria-expanded", "true");
    main.inert = true;
    footer.inert = true;
    header.inert = true;
    requestAnimationFrame(() => closeSettings.focus());
  } else {
    shell.dataset.view = "home";
    settingsButton.setAttribute("aria-expanded", "false");
    main.inert = false;
    footer.inert = false;
    header.inert = false;
    window.setTimeout(() => {
      if (shell.dataset.view === "home") settings.hidden = true;
    }, prefersReducedMotion() ? 0 : 200);
    settingsButton.focus();
  }
}

async function setTheme(choice: ThemeChoice, persist: boolean): Promise<void> {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
  for (const [key, button] of themeButtons) button.setAttribute("aria-checked", key === choice ? "true" : "false");
  if (persist && hasChrome) await chrome.storage.local.set({ theme: choice });
}

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

/* ---------- preview page (no Chrome APIs) ---------- */

function readPreviewTheme(): ThemeChoice {
  const value = preview.get("theme");
  return isTheme(value) ? value : "system";
}

function applyPreviewState(): void {
  const demo = preview.get("demo");
  if (demo === "answer") {
    question.value = SAMPLE_EXPLANATION.selection;
    explainTyped.disabled = false;
    renderAnswer(SAMPLE_EXPLANATION.text, "on_device", SAMPLE_EXPLANATION.selection, false);
  } else if (demo === "loading") {
    renderLoading(1);
  } else if (demo === "error") {
    lastRun = { highlight: false, fromPage: false };
    renderError("The cloud model could not be reached. Check your connection and retry.", true);
  } else if (demo === "offline") {
    renderOffline();
  }
  if (preview.get("view") === "settings") openSettings(true);
  if (preview.get("why") === "open") why.open = true;
}

/* ---------- utils ---------- */

function group(title: string, nodes: Node[]): HTMLElement {
  const section = el("section", "group");
  section.append(el("h3", undefined, title), ...nodes);
  return section;
}

function isTheme(value: unknown): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function activeTab(): Promise<chrome.tabs.Tab | undefined> {
  return chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => tabs[0]);
}

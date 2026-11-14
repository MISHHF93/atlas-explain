import { CloudAllowanceUsed, WatchlistAllowance, pricingActions, pricingView, type BillingSnapshot } from "../core/billing";
import { parseContextHash, type ParsedContextLink } from "../core/context-link";
import { conceptQuestion, getConcept, isGlossaryId } from "../core/glossary";
import { EXPLAIN_LOAD_MESSAGE, inboundReply, readInboundMessage } from "../core/inbound";
import { applyPrivateFields, parseMoveCardJson, publicMoveCard } from "../core/move-card";
import { ExplanationParseError } from "../core/parse-explanation";
import { ATLAS_DESK_URL } from "../core/popup-copy";
import { OnDeviceUnavailableError } from "../core/run-explanation";
import { SAMPLE_MOVES, type SampleMove } from "../core/samples";
import { DEFAULT_SETTINGS } from "../core/settings";
import { mapSignal, readPublicSignal, type SignalView } from "../core/signal";
import type { ExplanationRun, MoveCard } from "../core/types";
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
import { DEFAULT_PRICE_FEED, isLivePriceSource, type PriceFeedOptions } from "../core/price-feed";
import { mayCallLocalAtlas, probeAtlasLocal } from "../connectors";
import { loadDigest, todayToronto } from "../core/digest";
import { digestCard } from "../wallet/digest";
import { EXPLAIN_DEADLINE_MS, cloudErrorCopy, withDeadline } from "../core/timeouts";
import { CloudRateLimited } from "../core/rate-limit";
import { classifyCloudError, report } from "../core/monitor";
import type { AccountView } from "../core/account";
import { accountPanel } from "../wallet/account";
import { mountAssets } from "../wallet/assets-controller";
import { applyTheme, createWalletShell, isTheme, type ThemeChoice } from "../wallet/shell";
import { twoSidedNodes } from "../wallet/two-sided";
import { engineStrip } from "../wallet/engine";
import { marketDigestCard } from "../wallet/market-digest";
import { buildMarketDigest } from "../core/market-digest";
import type { CatalogView } from "../core/assets";
import { FOLLOW_UPS, followUpQuestion, relatedTerms } from "../core/follow-ups";
import { isEngineState } from "../core/hybrid-engine";
import { TEXT_HISTORY_KEY, addTextHistory, ageLabel, readTextHistory, removeTextHistory, type TextHistoryEntry } from "../core/text-history";
import { twoSidedCopyText } from "../core/two-sided";
import { liveSnapshot, snapshotBreadth, snapshotTime } from "../core/live-snapshot";
import { EXTENSION_DISCLAIMER } from "../core/extension-prompt";
import type { TextRun } from "../platform/web/backend";
import { parseRoute, pathFor, tabFor, titleFor, type AppRoute, type AppTab } from "../app/routes";
import type { TabDef } from "../wallet/shell";
import { createWatchlist, localKeyValue } from "../core/watchlist";

/** Navigation for the full-page app. Internal ids stay stable; labels read as a product. */
export const APP_TABS: readonly TabDef[] = [
  { id: "today", label: "Today", icon: "signal" },
  { id: "explain", label: "Explain", icon: "sparkle" },
  { id: "assets", label: "Assets", icon: "coins" },
  { id: "glossary", label: "Learn", icon: "book" },
  { id: "settings", label: "Account", icon: "user" },
];

const THEME_KEY = "atlas-explain-theme";
const ONBOARDED_KEY = "atlas-explain-onboarded";
const QUESTION_PLACEHOLDER = "What might different traders read into this move?";
const STEP_LABELS: [string, string, string] = ["Checking the card", "Running hybrid inference", "Saving to your history"];

export interface WebWalletOptions {
  env: PublicEnvConfig;
  startBackend: () => Promise<WebBackend>;
}

/**
 * The hosted ATLAS Explain app at /app: the same wallet parts as the extension, laid out
 * full-page (side rail on desktop, bottom tabs on phones) with one address per screen.
 */
export function mountWebWallet(host: HTMLElement, options: WebWalletOptions): void {
  host.replaceChildren();
  const preview = new URLSearchParams(location.search);
  let backend: WebBackend | null = null;
  let backendError: string | null = null;
  let route: AppRoute = parseRoute(location.pathname);
  /** True while the app follows the address bar, so tab changes do not push history again. */
  let following = false;

  const shell = createWalletShell({
    host,
    surface: "app",
    tabs: APP_TABS,
    initialTab: tabFor(route),
    onAccount: () => navigate({ kind: "signin" }),
    onStatus: () => shell.select("today", { focus: true }),
    onSelect: (tab) => {
      if (!following) navigate({ kind: "tab", tab: tab as AppTab });
    },
    onSheetClose: () => {
      if (following) return;
      if (route.kind === "asset") navigate({ kind: "tab", tab: "assets" }, { replace: true });
      else if (route.kind === "signin") navigate({ kind: "tab", tab: "settings" }, { replace: true });
      else if (route.kind === "not_found") navigate({ kind: "tab", tab: "today" }, { replace: true });
    },
    menu: [
      { label: "How ATLAS Explain works", icon: "help", run: () => showOnboarding() },
      { label: "Get the Chrome extension", icon: "panel", run: () => shell.openSheet("Chrome extension", extensionNodes()) },
      { label: "ATLAS Explain home page", icon: "external", run: () => location.assign("/") },
      { id: "desk", hidden: true, label: "Open the ATLAS desk", icon: "external", run: () => window.open(ATLAS_DESK_URL, "_blank", "noreferrer") },
      { label: "Terms", icon: "doc", run: () => openLegal("terms") },
      { label: "Privacy", icon: "shield", run: () => openLegal("privacy") },
    ],
  });
  document.title = titleFor(route);

  /** Moves to a route: updates the address, the title and the visible screen. */
  function navigate(next: AppRoute, opts: { replace?: boolean } = {}): void {
    route = next;
    const path = pathFor(next);
    if (location.pathname !== path) {
      if (opts.replace) history.replaceState(null, "", path);
      else history.pushState(null, "", path);
    }
    document.title = titleFor(next);
    following = true;
    try {
      shell.select(tabFor(next));
    } finally {
      following = false;
    }
    if (next.kind === "signin") openAccount();
  }

  /** Back and forward buttons: show whatever the address now says. */
  window.addEventListener("popstate", () => {
    route = parseRoute(location.pathname);
    document.title = titleFor(route);
    following = true;
    try {
      shell.closeSheet();
      shell.select(tabFor(route));
    } finally {
      following = false;
    }
    void showRouteSheet();
  });

  /** Asset detail, sign-in and not-found open as a sheet over their tab. */
  async function showRouteSheet(): Promise<void> {
    if (route.kind === "asset") {
      const symbol = route.symbol;
      const found = await assets?.open(symbol);
      if (found === false && route.kind === "asset" && route.symbol === symbol) {
        shell.openSheet(symbol, [
          el("p", undefined, `${symbol} is not in the asset list right now.`),
          el("p", "fine", "The list shows what the connected price feed or ATLAS reports. Nothing is made up to fill the gap."),
          routeButton("Back to Assets", { kind: "tab", tab: "assets" }),
        ]);
      }
    } else if (route.kind === "signin") {
      openAccount();
    } else if (route.kind === "not_found") {
      shell.openSheet("Page not found", [
        el("p", undefined, `There is no page at ${route.path}.`),
        routeButton("Go to Today", { kind: "tab", tab: "today" }),
      ]);
    }
  }

  function routeButton(label: string, to: AppRoute): HTMLButtonElement {
    const button = labelledButton("chevron", label, "secondary");
    button.addEventListener("click", () => {
      shell.closeSheet();
      navigate(to, { replace: true });
    });
    return button;
  }

  /* ---------- Explain tab ---------- */

  const cardInput = el("textarea", "code");
  cardInput.id = "move-card";
  cardInput.spellcheck = false;
  cardInput.setAttribute("aria-label", "Move card JSON");
  cardInput.value = JSON.stringify(SAMPLE_MOVES[0]?.card ?? {}, null, 2);
  const questionInput = el("textarea") as HTMLTextAreaElement;
  questionInput.id = "question";
  questionInput.rows = 2;
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
  const actions = el("div", "button-row");
  actions.append(explainButton);

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
  explainHead.append(el("h1", undefined, "Explain"), el("span", "fine", "Education only"));

  /* The core loop: paste or type → plain answer → keep going → related terms → history. */
  const textInput = el("textarea") as HTMLTextAreaElement;
  textInput.id = "explain-text";
  textInput.rows = 3;
  textInput.maxLength = 2000;
  textInput.autocomplete = "off";
  textInput.placeholder = "Paste or type a term, a sentence or a headline: stop-limit order, implied volatility…";
  textInput.setAttribute("aria-label", "Text to explain");
  const textGo = labelledButton("sparkle", "Explain", "primary composer-go");
  const composerBox = el("section", "composer");
  composerBox.setAttribute("aria-label", "Explain text");
  composerBox.append(textInput, textGo);
  const examples = el("div", "samples");
  examples.setAttribute("role", "group");
  examples.setAttribute("aria-label", "Try an example");
  for (const term of ["Stop-limit order", "Implied volatility", "Bid-ask spread", "Short interest"]) {
    const chip = el("button", "chip", term);
    chip.type = "button";
    chip.addEventListener("click", () => {
      textInput.value = term;
      void onExplainText();
    });
    examples.append(chip);
  }
  const textHint = el("p", "fine", "Ctrl+Enter to explain. Only the text you type here is used. Nothing is sent until you press Explain.");
  const textStatus = el("p", "fine");
  textStatus.setAttribute("role", "status");
  textStatus.setAttribute("aria-live", "polite");
  const textResult = el("div", "stack");
  textResult.setAttribute("aria-live", "polite");
  const textHistoryList = el("ul", "text-history");
  const textHistoryNote = el("p", "fine");
  const textHistory = el("section", "stack");
  const textHistoryHead = el("div", "panel-title");
  const clearTextHistory = el("button", "link-btn", "Clear");
  clearTextHistory.type = "button";
  clearTextHistory.addEventListener("click", () => {
    writeTextHistory([]);
    renderTextHistory();
  });
  textHistoryHead.append(el("h2", "section-label", "History"), clearTextHistory);
  textHistory.append(textHistoryHead, textHistoryNote, textHistoryList);
  textGo.addEventListener("click", () => void onExplainText());
  textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void onExplainText();
    }
  });
  const engine = engineStrip({ compact: true });
  const brief = digestCard();
  // Grounded digest: only the live ATLAS catalog on this computer feeds it, never a preview file.
  let marketCatalog: CatalogView | null = null;
  let marketCard: HTMLElement = marketDigestCard(buildMarketDigest(marketCatalog));
  // Connection facts. Declared before the first Today render, which reads them.
  let atlasLocal = false;
  let livePrices = false;
  let liveStatus: "loading" | "ready" | "error" = "loading";
  // Public live prices (Kraken or CoinGecko) when ATLAS is away: breadth and moves only, never leans.
  let liveCatalog: CatalogView | null = null;
  let liveCard: HTMLElement = liveSnapshotCard(liveCatalog);
  const refreshToday = (): void => {
    // The Today screen shows the market digest inline; swap in the fresh card when ATLAS answers.
    const next = marketDigestCard(buildMarketDigest(marketCatalog));
    marketCard.replaceWith(next);
    marketCard = next;
    const nextLive = liveSnapshotCard(liveCatalog);
    liveCard.replaceWith(nextLive);
    liveCard = nextLive;
  };
  void (canReachLocalAtlas(location, false)
    ? loadDigest()
    : Promise.resolve({ kind: "not_connected" as const, today: todayToronto(), reason: "Today's ATLAS digest isn't ready yet." })
  ).then((v) => { brief.show(v); refreshToday(); });

  // Market moves (ATLAS desk links, samples, your own card) keep their full flow, one tap away.
  // A market move opens here only from a link (the ATLAS desk or a shared explanation). It stays hidden otherwise.
  const moveBox = disclosure("Explain a market move", [
    el("p", "fine", "The answer weighs both sides of the move. Samples use rounded figures from public news reports."),
    fromDesk,
    moveSlot,
    sampleRow,
    sampleNote,
    errors,
    questionInput,
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
    recent,
  ]);
  moveBox.classList.add("move-box");
  moveBox.hidden = true;

  shell.panels.explain.append(
    explainHead,
    composerBox,
    engine.node,
    examples,
    textHint,
    textStatus,
    textResult,
    textHistory,
    moveBox,
  );
  renderTextHistory();

  /* ---------- Signal tab ---------- */

  const signal = signalCard({
    onWhy: () => openLegal("signal"),
    deskHint: "The live light is read by the Chrome extension on the ATLAS desk. Here it stays grey unless the desk sends its public signal.",
  });
  /* ---------- Today tab: digest first, then the paper light, then the next step ---------- */

  const todayHead = el("div", "panel-title");
  todayHead.append(el("h1", undefined, "Today"), el("span", "fine", new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())));
  const getExtension = row("panel", "Get the Chrome extension", () => shell.openSheet("Chrome extension", extensionNodes()));
  const startExplain = row("sparkle", "Explain a term or a headline", () => navigate({ kind: "tab", tab: "explain" }));
  // Shown only to someone running ATLAS research software; the public never sees these blocks.
  const atlasBlock = el("div", "stack atlas-only");
  atlasBlock.hidden = true;
  atlasBlock.append(marketCard, brief.node, el("h2", "section-label", "Paper signal light"), signal.node);
  shell.panels.today.append(
    todayHead,
    liveCard,
    atlasBlock,
    el("h2", "section-label", "Next"),
    startExplain,
    getExtension,
  );
  // marketCard is replaced in place by refreshToday() whenever the catalog or brief changes.

  /* ---------- Assets tab ---------- */

  // Watchlist: on this device while signed out; in the account (Firestore) once signed in.
  const watchlist = createWatchlist(localKeyValue(), {
    load: async () => (backend ? backend.loadWatchlist() : null),
    save: async (ids) => {
      await backend?.saveWatchlist(ids);
    },
  });

  // The hosted app cannot read ATLAS on the visitor's computer and never calls localhost.
  // It shows live crypto prices from the configured public feed instead, with every light grey.
  let assets: ReturnType<typeof mountAssets> | null = null;
  async function startAssets(priceFeed: PriceFeedOptions = DEFAULT_PRICE_FEED): Promise<void> {
    assets = mountAssets({
      shell,
      canReachAtlas: canReachLocalAtlas(location, false),
      priceFeed,
      watchlist,
      onState: (state) => {
        atlasLocal = state.kind === "ready" && !isLivePriceSource(state.catalog.source);
        livePrices = state.kind === "ready" && isLivePriceSource(state.catalog.source);
        liveStatus = state.kind === "loading" ? (liveCatalog ? "ready" : "loading") : state.kind === "ready" ? "ready" : "error";
        if (state.kind !== "loading") marketCatalog = state.kind === "ready" && !isLivePriceSource(state.catalog.source) ? state.catalog : null;
        if (state.kind !== "loading") liveCatalog = state.kind === "ready" && isLivePriceSource(state.catalog.source) ? state.catalog : null;
        refreshToday();
        updateConnection();
      },
      onExplain: (text) => {
        textInput.value = text;
        shell.select("explain");
        textInput.focus();
        textStatus.textContent = "Added to Explain. Press Explain when ready. Nothing was sent.";
      },
      onOpen: (symbol) => {
        if (!following && !(route.kind === "asset" && route.symbol === symbol)) {
          route = { kind: "asset", symbol };
          history.pushState(null, "", pathFor(route));
          document.title = titleFor(route);
        }
      },
    });
    await assets.refresh();
    const sheet = preview.get("asset");
    if (sheet) await assets.open(sheet);
    else if (route.kind === "asset") await showRouteSheet();
  }

  /* ---------- Learn tab (glossary) ---------- */

  const glossaryHead = el("div", "panel-title");
  glossaryHead.append(el("h1", undefined, "Learn"), el("span", "fine", "Plain language"));
  shell.panels.glossary.append(
    glossaryHead,
    glossaryPanel({
      askLabel: "Ask about this in my explanation",
      onAsk: (term) => {
        textInput.value = term.title;
        shell.select("explain");
        textStatus.textContent = `${term.title} added. Press Explain when ready. Nothing was sent.`;
        textInput.focus();
      },
    }),
  );

  /* ---------- Settings tab ---------- */

  const planSlot = el("div");
  const accountNote = el("p", "fine");
  accountNote.setAttribute("role", "status");
  const themeChoice = readTheme();
  applyTheme(themeChoice);
  const settingsHead = el("div", "panel-title");
  settingsHead.append(el("h1", undefined, "Account"), el("span", "fine", "Settings and privacy"));
  const accountLine = el("p", "fine", "You're using ATLAS Explain without an account. Sign in to keep your explanations across devices.");
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
      void backend?.savePrefs({ theme: choice }).catch(() => undefined);
    })]),
    group("Account", [accountLine, row("user", "Sign in or manage your account", () => openAccount())]),
    group("How answers are made", [
      el("p", "fine", "When your browser supports it, Gemini Nano answers on your device and nothing is sent. Otherwise Gemini answers in the cloud. Every answer is labelled."),
    ]),
    group("Legal", [row("doc", "Terms", () => openLegal("terms")), row("shield", "Privacy", () => openLegal("privacy"))]),
    group("About", [
      el("p", "fine", "ATLAS Explain is open source under the Apache-2.0 licence. Education only, never investment advice."),
      row("panel", "Get the Chrome extension", () => shell.openSheet("Chrome extension", extensionNodes())),
    ]),
  );
  renderPlan(pricingView({ billingEnabled: false, plan: "free", freeCloudDailyLimit: DEFAULT_SETTINGS.freeCloudDailyLimit }), null);

  /* ---------- wiring ---------- */

  explainButton.addEventListener("click", () => void onExplain());
  cardInput.addEventListener("input", () => renderMove());
  window.addEventListener("hashchange", () => applyHash(location.hash));
  window.addEventListener("message", onInboundMessage);
  window.addEventListener("online", () => { void refreshLink(); refreshEngine(); });
  window.addEventListener("offline", () => { shell.setConnection("offline"); refreshEngine(); });

  let currentSignal: SignalView = mapSignal({ connected: false });
  const hosted = !mayCallLocalAtlas(location, false);

  function updateConnection(): void {
    // ATLAS-only parts appear only when ATLAS itself is here: running locally, or the desk sent its signal.
    const atlasPresent = atlasLocal || currentSignal.connected;
    atlasBlock.hidden = !atlasPresent;
    shell.setMenuItemHidden("desk", !atlasPresent);
    if (!navigator.onLine) {
      shell.setConnection("offline");
      return;
    }
    if (currentSignal.connected) {
      shell.setConnection("desk");
      return;
    }
    if (hosted) {
      shell.setConnection(livePrices ? "live" : "hosted");
      return;
    }
    shell.setConnection(atlasLocal ? "local" : livePrices ? "live" : "none");
  }

  async function refreshLink(): Promise<void> {
    const link = await probeAtlasLocal({ allowed: !hosted });
    atlasLocal = link.state === "local";
    updateConnection();
  }

  function refreshEngine(): void {
    const forced = import.meta.env.DEV ? preview.get("engine") : null;
    if (isEngineState(forced)) engine.set(forced);
    else void engine.refresh();
  }

  refreshEngine();
  applySignal(currentSignal);
  updateConnection();
  void refreshLink();
  loadSample(SAMPLE_MOVES[0]);
  showResult(emptyCard("Press Explain the move when you're ready. Nothing is sent until then.", undefined, "Ready when you are"));

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
    const priceFeed: PriceFeedOptions = { ...DEFAULT_PRICE_FEED };
    void startAssets(priceFeed);
    if (import.meta.env.DEV) applyPreview();
    const deepLink = route.kind !== "tab" || route.tab !== "today";
    if (!readFlag(ONBOARDED_KEY) && !preview.has("tab") && !preview.has("demo") && !deepLink && !location.hash) showOnboarding();
    if (route.kind === "signin" || route.kind === "not_found") void showRouteSheet();
    if (!backend) return;
    void backend.loadSettings().then(({ priceFeed: next }) => {
      const changed = next.provider !== priceFeed.provider || next.coinGeckoDemoKey !== priceFeed.coinGeckoDemoKey;
      priceFeed.provider = next.provider;
      priceFeed.coinGeckoDemoKey = next.coinGeckoDemoKey;
      if (changed) void assets?.refresh();
    }).catch(() => undefined);
    void refreshPlan();
    void loadHistory();
    void startAccount(backend);
  }

  /* ---------- account ---------- */

  let account: AccountView | null = null;
  let lastAccountUid: string | null = null;

  async function startAccount(b: WebBackend): Promise<void> {
    try {
      await b.watchAccount((view) => {
        account = view;
        shell.setAccount(view);
        accountLine.textContent = view?.signedIn
          ? `Signed in as ${view.label}. Your saved explanations follow you on every device.`
          : "You're using ATLAS Explain without an account. Sign in to keep your explanations across devices.";
        void refreshPlan();
        if (view && view.uid !== lastAccountUid) {
          lastAccountUid = view.uid;
          void loadHistory();
          void watchlist.sync();
          if (view.signedIn) void b.loadPrefs().then((prefs) => {
            if (prefs) applyTheme(prefs.theme);
          }).catch(() => undefined);
        }
      });
      if (new URLSearchParams(location.search).get("account") === "open") openAccount();
      const finished = await b.completeSignIn(() => window.prompt("Confirm the email address you used for the sign-in link") ?? null);
      if (finished) {
        shell.announce(finished);
        status.textContent = finished;
        if (/[?&](signin|oobCode)=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
      }
    } catch {
      // Sign-in is optional. The app keeps working signed out.
    }
  }

  function openAccount(): void {
    if (!backend) {
      shell.openSheet("Account", [el("p", "fine", "Sign-in isn't available right now. Reload the page to try again.")]);
      return;
    }
    const b = backend;
    shell.openSheet("Account", [accountPanel(account, {
      onGoogle: async () => {
        const result = await b.signInWithGoogle();
        if (result === "redirecting") return "Taking you to Google…";
        window.setTimeout(() => (route.kind === "signin" ? afterSignIn() : openAccount()), 400);
        return "You are signed in.";
      },
      onEmail: async (email) => {
        await b.sendEmailLink(email);
        return `Check ${email} for a sign-in link. Open it on this device to finish.`;
      },
      onSignOut: async () => {
        await b.signOut();
        window.setTimeout(() => openAccount(), 400);
        return "You are signed out. ATLAS Explain still works; history now stays on this browser.";
      },
    })]);
  }

  /** Back to where sign-in was asked from (?next=/app/...), otherwise Today. */
  function afterSignIn(): void {
    const next = new URLSearchParams(location.search).get("next");
    const target = next ? parseRoute(next) : null;
    shell.closeSheet();
    navigate(target && target.kind !== "not_found" && target.kind !== "signin" ? target : { kind: "tab", tab: "today" }, { replace: true });
  }

  function renderSetup(): void {
    explainButton.disabled = true;
    textGo.disabled = true;
    if (!import.meta.env.DEV) {
      const card = messageCard("error", "Explanations are unavailable right now", "Something on our side isn't working. Reload the page, or try again in a few minutes. The Learn library still works.", () => location.reload());
      textResult.replaceChildren(card);
      showResult(card.cloneNode(true) as HTMLElement);
      historyNote.textContent = "";
      return;
    }
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
      // Focusing the explain button used to scroll ".wallet-body" and hide the title and today's brief.
      const scroller = document.querySelector(".wallet-body") as HTMLElement | null;
      if (scroller) {
        const previous = scroller.style.scrollBehavior;
        scroller.style.scrollBehavior = "auto";
        scroller.scrollTop = 0;
        scroller.style.scrollBehavior = previous;
      }
      explainButton.focus({ preventScroll: true });
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

  /* ---------- today: live prices ---------- */

  function liveSnapshotCard(catalog: CatalogView | null): HTMLElement {
    const snap = liveSnapshot(catalog);
    if (!snap) {
      if (atlasLocal) {
        const none = el("section");
        none.hidden = true;
        return none;
      }
      if (liveStatus === "error") {
        return messageCard("error", "Live prices couldn't be loaded", "The price feed isn't answering right now. Check your connection and try again.", () => void assets?.refresh());
      }
      const loading = el("section", "card state state-loading live-loading");
      loading.setAttribute("aria-busy", "true");
      loading.append(el("p", "card-title", "Loading live prices…"), el("div", "skeleton"));
      return loading;
    }
    const node = el("section", "market-digest live-snapshot");
    node.setAttribute("aria-label", "Crypto right now, from live prices");
    const list = el("ul", "md-movers");
    for (const m of snap.movers) {
      const li = el("li");
      const open = el("button", "md-mover live-mover");
      open.type = "button";
      open.setAttribute("aria-label", `${m.name}, ${m.symbol}: ${m.price}, ${m.change} ${snap.window}. Open details.`);
      const top = el("span", "md-mover-top");
      const name = el("span", "md-sym");
      name.append(el("strong", undefined, m.symbol), el("span", "md-name", ` ${m.name}`));
      const change = el("span", "md-chg", m.change);
      change.dataset.dir = m.tone;
      top.append(name, change);
      open.append(top, el("span", "md-src", m.price));
      open.addEventListener("click", () => {
        navigate({ kind: "asset", symbol: m.symbol });
        void showRouteSheet();
      });
      li.append(open);
      list.append(li);
    }
    const src = el("p", "md-src");
    const link = el("a", "price-attr", snap.source.text) as HTMLAnchorElement;
    link.href = snap.source.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    src.append(link, ` · updated ${snapshotTime(snap.asOf)}`);
    node.append(el("h2", "md-title", "Crypto right now"), el("p", "md-line", snapshotBreadth(snap)), el("h3", "md-sub", "Biggest moves, either way"), list, src);
    return node;
  }

  /* ---------- explain text ---------- */

  let textBusy = false;

  async function onExplainText(followUp?: { question: string; topic: string }): Promise<void> {
    const text = followUp?.topic ?? textInput.value.trim();
    if (textBusy) return;
    if (!text) {
      textStatus.textContent = "Paste or type a term, a sentence or a headline first.";
      textInput.focus();
      return;
    }
    if (!backend) {
      textResult.replaceChildren(messageCard("error", "Explanations are unavailable right now", "Something on our side isn't working. Reload the page, or try again in a few minutes. The Learn library still works.", () => location.reload()));
      return;
    }
    textBusy = true;
    textGo.disabled = true;
    textGo.classList.add("loading");
    textResult.setAttribute("aria-busy", "true");
    textResult.replaceChildren(loadingCard(1, ["Reading your text", "Writing the answer", "Saving to history"]));
    textStatus.textContent = "Working on it…";
    try {
      const run = await withDeadline(
        backend.explainText(text, followUp?.question ?? "", { onProgress: (m) => (textStatus.textContent = m) }),
        EXPLAIN_DEADLINE_MS,
        "The answer took too long.",
      );
      textStatus.textContent = "";
      const source = run.inferenceSource === "on_device" ? "on_device" : run.inferenceSource === "in_cloud" ? "in_cloud" : "unknown";
      engine.markRun(source);
      showTextAnswer(text, run.answer, run.plain, source, run);
      shell.announce("Explanation ready.");
      if (!followUp) {
        writeTextHistory(addTextHistory(loadTextHistory(), { id: `${Date.now()}`, text, answer: run.answer, plain: run.plain, source, at: Date.now() }));
        renderTextHistory();
      }
    } catch (error) {
      textStatus.textContent = "";
      if (error instanceof CloudRateLimited) report("rate_limited", "web", "browser_limit");
      else if (!(error instanceof CloudAllowanceUsed)) report(classifyCloudError(error instanceof Error ? error.message : ""), "web", error instanceof Error ? error.name : "unknown");
      if (error instanceof CloudAllowanceUsed || error instanceof CloudRateLimited) textResult.replaceChildren(limitCard(error.message));
      else if (!navigator.onLine) textResult.replaceChildren(messageCard("offline", "You are offline", "On-device inference was not available and the cloud cannot be reached. Reconnect and try again.", () => void onExplainText(followUp)));
      else textResult.replaceChildren(messageCard("error", "That did not work", friendlyError(error), () => void onExplainText(followUp)));
    } finally {
      textBusy = false;
      textGo.disabled = false;
      textGo.classList.remove("loading");
      textResult.setAttribute("aria-busy", "false");
    }
  }

  function showTextAnswer(text: string, answer: TextRun["answer"], plain: string, source: "on_device" | "in_cloud" | "unknown", run?: TextRun): void {
    const copyText = answer ? twoSidedCopyText(answer, EXTENSION_DISCLAIMER) : `${plain}\n\n${EXTENSION_DISCLAIMER}`;
    const notes: string[] = [];
    if (run?.cloudBlocked && source === "on_device") notes.push("The cloud was off limits for now, so this ran on your device only.");
    if (run?.refusedRecommendation) notes.push("Trade decisions are not given. The factors on both sides are explained instead.");
    notes.push(source === "on_device" ? "Answered on your device with Gemini Nano. Nothing was sent." : source === "in_cloud" ? "Answered in the cloud with Gemini." : "Where this answer ran was not reported.");
    notes.push(EXTENSION_DISCLAIMER);
    const card = explanationCard({
      source,
      selection: text,
      ...(answer ? { body: twoSidedNodes(answer) } : { text: plain }),
      copyText,
      notes,
      onClear: () => textResult.replaceChildren(),
      followUps: FOLLOW_UPS.map((item) => ({ label: item.label, run: () => void onExplainText({ question: followUpQuestion(item.kind, text), topic: text }) })),
      related: relatedTerms(copyText, text).map((term) => ({
        title: term.title,
        run: () => {
          textInput.value = term.title;
          void onExplainText();
        },
      })),
    });
    card.classList.add("enter");
    textResult.replaceChildren(card);
    requestAnimationFrame(() => card.scrollIntoView({ block: "nearest", behavior: smooth() }));
  }

  function loadTextHistory(): TextHistoryEntry[] {
    try {
      return readTextHistory(localStorage.getItem(TEXT_HISTORY_KEY));
    } catch {
      return [];
    }
  }

  function writeTextHistory(list: TextHistoryEntry[]): void {
    try {
      localStorage.setItem(TEXT_HISTORY_KEY, JSON.stringify(list));
    } catch {
      // Private mode: history lasts for this visit only.
    }
  }

  function renderTextHistory(): void {
    const list = loadTextHistory();
    clearTextHistory.hidden = list.length === 0;
    textHistoryNote.textContent = list.length ? "Saved in this browser only. Tap one to see its answer again." : "Your explanations appear here. They stay in this browser.";
    textHistoryList.replaceChildren(...list.slice(0, 8).map((entry) => {
      const item = el("li", "text-history-row");
      const open = el("button", "history-item");
      open.type = "button";
      open.append(el("span", "history-text", entry.text), el("span", "history-meta fine", `${ageLabel(entry.at)} · ${sourceLabel(entry.source)}`));
      open.addEventListener("click", () => {
        textInput.value = entry.text;
        showTextAnswer(entry.text, entry.answer, entry.plain, entry.source);
      });
      const remove = el("button", "link-btn", "Remove");
      remove.type = "button";
      remove.setAttribute("aria-label", `Remove ${entry.text} from history`);
      remove.addEventListener("click", () => {
        writeTextHistory(removeTextHistory(loadTextHistory(), entry.id));
        renderTextHistory();
      });
      item.append(open, remove);
      return item;
    }));
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
    moveBox.hidden = false;
    moveBox.open = true;
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

  async function onExplain(): Promise<void> {
    if (!backend) return renderSetup();
    const prepared = await prepareCard();
    if (!prepared.ok) return renderErrors(prepared.errors);
    renderErrors([]);
    setBusy(true);
    showResult(loadingCard(0, STEP_LABELS));
    status.textContent = "Working on it…";
    try {
      showResult(loadingCard(1, STEP_LABELS));
      const run = await withDeadline(
        backend.explain(prepared.card, questionInput.value, {
          onProgress(message) {
            status.textContent = message;
          },
        }),
        EXPLAIN_DEADLINE_MS,
        "The answer took too long.",
      );
      showResult(runCard(run));
      engine.markRun(run.inferenceSource === "on_device" ? "on_device" : run.inferenceSource === "in_cloud" ? "in_cloud" : "unknown");
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
      if (error instanceof CloudRateLimited) report("rate_limited", "web", "browser_limit");
      else if (!(error instanceof CloudAllowanceUsed || error instanceof WatchlistAllowance)) report(classifyCloudError(error instanceof Error ? error.message : ""), "web", error instanceof Error ? error.name : "unknown");
      if (error instanceof CloudAllowanceUsed || error instanceof WatchlistAllowance || error instanceof CloudRateLimited) showResult(limitCard(error.message));
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
      body,
      copyText,
      notes,
      onClear: () => showResult(emptyCard("Pick another sample, then explain again.", undefined, "Cleared")),
      ...keepGoing(copyText),
    });
  }

  /** Follow-ups re-run Explain on the same card with a new question; related terms fill the question box only. */
  function keepGoing(answerText: string) {
    const parsed = parseMoveCardJson(cardInput.value);
    const topic = parsed.ok ? `the ${parsed.card.symbol} ${formatPct(parsed.card.movePct)} move` : "this move";
    return {
      followUps: FOLLOW_UPS.map((item) => ({
        label: item.label,
        run: () => {
          questionInput.value = followUpQuestion(item.kind, topic);
          void onExplain();
        },
      })),
      related: relatedTerms(answerText).map((term) => ({
        title: term.title,
        run: () => {
          questionInput.value = isGlossaryId(term.id)
            ? conceptQuestion(term.id)
            : `In educational terms, what does "${term.title}" add to a reading of this move? Do not give trade advice.`;
          status.textContent = `${term.title} added to your question. Press Explain the move when ready. Nothing was sent.`;
          questionInput.focus();
        },
      })),
    };
  }

  async function loadHistory(): Promise<void> {
    if (!backend) return;
    try {
      const entries = await backend.list();
      if (entries.length === 0) {
        historyNote.textContent = account?.signedIn ? "No saved explanations yet. They appear here and on every device where you sign in." : "No saved explanations yet. They appear here for this browser. Sign in to keep them across devices.";
        historyList.replaceChildren();
        return;
      }
      historyNote.textContent = account?.signedIn ? `Saved to ${account.label}. Private notes are never stored.` : "Saved on this browser while signed out. Private notes are never stored.";
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
      moveBox.hidden = false;
      moveBox.open = true;
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
    // Sign-in lives in the Account group below; the plan card only carries checkout.
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
    updateConnection();
  }

  function setBusy(busy: boolean): void {
    explainButton.disabled = busy;
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

  async function safeSettings(): Promise<{ billingEnabled: boolean; freeCloudDailyLimit: number }> {
    try {
      return backend ? (await backend.loadSettings()).settings : DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  /** Screenshot states for development (?tab=, ?demo=, ?sheet=). Compiled out of production builds. */
  function applyPreview(): void {
    const tab = preview.get("tab");
    if (tab === "assets" || tab === "glossary" || tab === "settings" || tab === "explain" || tab === "today") shell.select(tab);
    if (tab === "signal") shell.select("today");
    const demo = preview.get("demo");
    if (demo === "run") showResult(runCard(devSampleRun()));
    if (demo === "loading") showResult(loadingCard(1, STEP_LABELS));
    if (demo === "error") showResult(messageCard("error", "That did not work", "The cloud model could not be reached. Check your connection and retry.", () => undefined));
    if (preview.get("onboarding") === "1") showOnboarding();
    if (preview.get("sheet") === "terms") openLegal("terms");
    if (preview.get("sheet") === "extension") shell.openSheet("Chrome extension", extensionNodes());
    if (preview.get("sheet") === "today") shell.select("today");
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

function pathNote(run: ExplanationRun): string {
  const where = run.inferenceSource === "on_device"
    ? "Answered on your device."
    : run.inferenceSource === "in_cloud"
      ? "Answered in the cloud."
      : "Where this answer ran was not reported.";
  const fallback = run.fellBackToCloud ? " On-device was unavailable, so the cloud ran without private notes." : "";
  const privacy = run.privateContextUsed ? " Notes stayed on this device and were not saved." : " Private notes were not sent.";
  return `${where}${fallback}${privacy}`;
}

function sourceLabel(source: string): string {
  if (source === "on_device") return "on-device";
  if (source === "in_cloud") return "cloud";
  return "source not reported";
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
    if (import.meta.env.DEV) console.error(error.rawText);
    return "The answer came back in a shape we couldn't read. Try again; it usually works the second time.";
  }
  if (error instanceof OnDeviceUnavailableError) return "This browser can't answer on the device right now. Try again to get an answer from the cloud.";
  return cloudErrorCopy(error instanceof Error ? error.message : "", "web");
}

/** Development-only run for screenshots (?demo=run). Labelled sample text, not a market call. */
const devSampleRun = (): ExplanationRun => ({
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
  prompt: "",
} as unknown as ExplanationRun);

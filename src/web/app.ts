import { CloudAllowanceUsed, PREVIEW_BILLING_LINKS, PRO_PRICE_LABELS, WatchlistAllowance, billingSnapshot, pricingActions, pricingView, type BillingSnapshot, type ProInterval } from "../core/billing";
import { parseContextHash, type ParsedContextLink } from "../core/context-link";
import { conceptQuestion, getConcept } from "../core/glossary";
import { EXPLAIN_LOAD_MESSAGE, inboundReply, readInboundMessage } from "../core/inbound";
import { applyPrivateFields, parseMoveCardJson, publicMoveCard } from "../core/move-card";
import { ExplanationParseError } from "../core/parse-explanation";
import { ATLAS_DESK_URL, SAMPLE_TERM, connectionFor } from "../core/popup-copy";
import { OnDeviceUnavailableError } from "../core/run-explanation";
import { SAMPLE_MOVES, type SampleMove } from "../core/samples";
import { DEFAULT_SETTINGS } from "../core/settings";
import { mapSignal, readPublicSignal, type SignalView } from "../core/signal";
import type { ExplanationRun, MoveCard } from "../core/types";
import type { WebBackend } from "../platform/web/backend";
import type { PublicEnvConfig } from "../platform/web/env";
import {
  group,
  messageCard,
  onboarding,
  planCard,
  row,
  signalCard,
} from "../wallet/cards";
import { el, labelledButton } from "../wallet/dom";
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
import type { AccountView, SignInOutcome } from "../core/account";
import { accountPanel, emailConfirmPanel } from "../wallet/account";
import { mountAssets } from "../wallet/assets-controller";
import { applyTheme, createWalletShell, isTheme, type ThemeChoice } from "../wallet/shell";
import { explainPanel, type ExplainOutcome, type ExplainRequest } from "../wallet/explain-panel";
import type { HistoryEntry as RecentEntry } from "../core/history";
import { marketDigestCard } from "../wallet/market-digest";
import { buildMarketDigest } from "../core/market-digest";
import type { CatalogView } from "../core/assets";
import { relatedTerms } from "../core/related-terms";
import { isEngineState } from "../core/hybrid-engine";
import { TEXT_HISTORY_KEY, readTextHistory, type TextHistoryEntry } from "../core/text-history";
import { parseTwoSided } from "../core/two-sided";
import { liveSnapshot, snapshotBreadth, snapshotTime } from "../core/live-snapshot";
import { parseRoute, pathFor, tabFor, titleFor, type AppRoute, type AppTab } from "../app/routes";
import type { TabDef } from "../wallet/shell";
import { createWatchlist, localKeyValue } from "../core/watchlist";
import { buildSettings } from "../wallet/settings";
import { headlinesCard } from "../wallet/headlines";
import { WEB_LEARN_KEY } from "../core/account-data";
import { yourDataGroup } from "../wallet/your-data";
import { tracker } from "../core/analytics";
import { consentBar, storeConsent, storedConsent } from "../wallet/consent-bar";
import { RECENT_KEY, readRecent } from "../core/recent";

/** Navigation for the full-page app. Internal ids stay stable; labels read as a product. */
/** The sections of the one-page app, in reading order. Account and settings open from the header as a sheet. */
export const APP_TABS: readonly TabDef[] = [
  { id: "explain", label: "Explain", icon: "sparkle" },
  { id: "today", label: "Today", icon: "signal" },
  { id: "glossary", label: "Learn", icon: "book" },
  { id: "assets", label: "Assets", icon: "coins" },
];

const THEME_KEY = "atlas-explain-theme";
/** Learn path progress in this browser (the extension keeps it in chrome.storage). */
const LEARN_STORE_KEY = WEB_LEARN_KEY;

function readLearned(): unknown {
  try {
    return JSON.parse(localStorage.getItem(LEARN_STORE_KEY) ?? "[]");
  } catch {
    return [];
  }
}
const ONBOARDED_KEY = "atlas-explain-onboarded";
const QUESTION_PLACEHOLDER = "What might different traders read into this move?";

export interface WebWalletOptions {
  env: PublicEnvConfig;
  startBackend: () => Promise<WebBackend>;
}

/**
 * The hosted ATLAS Explain app at /app: the same wallet parts as the extension, laid out as
 * one scrolling page (Explain first, then Today, Learn and Assets). Slim links in the header
 * jump between sections, the logo goes back to the top, and each section keeps its own address.
 */
export function mountWebWallet(host: HTMLElement, options: WebWalletOptions): void {
  host.replaceChildren();
  const preview = new URLSearchParams(location.search);
  let backend: WebBackend | null = null;
  let backendError: string | null = null;
  let route: AppRoute = parseRoute(location.pathname);
  /** True while the app follows the address bar, so section changes do not push history again. */
  let following = false;
  /** Set once the visitor scrolls or jumps, so late-loading content never moves them again. */
  let moved = false;

  const shell = createWalletShell({
    host,
    surface: "app",
    tabs: APP_TABS,
    layout: "page",
    initialTab: tabFor(route),
    onAccount: () => navigate({ kind: "tab", tab: "settings" }),
    onStatus: () => shell.select("today", { focus: true }),
    onSelect: (tab) => {
      moved = true;
      if (!following) navigate({ kind: "tab", tab: tab as AppTab }, { scroll: false });
    },
    // Scrolling into a section updates the address quietly, without adding history entries.
    onSection: (tab) => {
      moved = true;
      if (route.kind !== "tab" || route.tab === "settings") return;
      route = { kind: "tab", tab: tab as AppTab };
      history.replaceState(null, "", pathFor(route));
      document.title = titleFor(route);
    },
    // Closing a sheet returns the address to the section underneath, without scrolling the page.
    onSheetClose: () => {
      if (following) return;
      if (route.kind === "asset") navigate({ kind: "tab", tab: "assets" }, { replace: true, scroll: false });
      else if (route.kind !== "tab" || route.tab === "settings") navigate({ kind: "tab", tab: shell.current() as AppTab }, { replace: true, scroll: false });
    },
    menu: [
      { label: "How ATLAS Explain works", icon: "help", run: () => showOnboarding() },
      { label: "Get the Chrome extension", icon: "panel", run: () => shell.openSheet("Chrome extension", extensionNodes()) },
      { label: "Use it in your AI assistant", icon: "plug", run: () => location.assign("/support#ai-assistants") },
      { label: "Help and support", icon: "info", run: () => location.assign("/support") },
      { label: "ATLAS Explain home page", icon: "external", run: () => location.assign("/") },
      { id: "desk", hidden: true, label: "Open the ATLAS desk", icon: "external", run: () => window.open(ATLAS_DESK_URL, "_blank", "noreferrer") },
      { label: "Terms", icon: "doc", run: () => openLegal("terms") },
      { label: "Privacy", icon: "shield", run: () => openLegal("privacy") },
    ],
  });
  document.title = titleFor(route);

  /** A link to a lower section (/app/learn, /app/assets, an asset page) lands on that section. */
  function jumpToRouteSection(): void {
    const tab = tabFor(route);
    if (isAccountRoute(route) || route.kind === "not_found" || tab === "explain") return;
    following = true;
    try {
      shell.select(tab);
    } finally {
      following = false;
    }
  }

  /** Account and settings live in one sheet, reached by /app/account and /signin. */
  const isAccountRoute = (r: AppRoute): boolean => r.kind === "signin" || (r.kind === "tab" && r.tab === "settings");

  /** Moves to a route: updates the address and the title, scrolls to its section, and opens its sheet. */
  function navigate(next: AppRoute, opts: { replace?: boolean; scroll?: boolean } = {}): void {
    route = next;
    const path = pathFor(next);
    if (location.pathname !== path) {
      if (opts.replace) history.replaceState(null, "", path);
      else history.pushState(null, "", path);
    }
    document.title = titleFor(next);
    if (opts.scroll !== false && !isAccountRoute(next)) {
      following = true;
      try {
        shell.select(tabFor(next));
      } finally {
        following = false;
      }
    }
    if (isAccountRoute(next)) openAccount();
  }

  /** Back and forward buttons: show whatever the address now says. */
  window.addEventListener("popstate", () => {
    route = parseRoute(location.pathname);
    document.title = titleFor(route);
    following = true;
    try {
      shell.closeSheet();
      if (!isAccountRoute(route)) shell.select(tabFor(route));
    } finally {
      following = false;
    }
    void showRouteSheet();
  });
  for (const type of ["wheel", "touchmove", "keydown"] as const) {
    window.addEventListener(type, () => { moved = true; }, { passive: true, once: true });
  }

  /** Asset detail, the account sheet and not-found open as a sheet over the page. */
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
    } else if (isAccountRoute(route)) {
      openAccount();
    } else if (route.kind === "not_found") {
      shell.openSheet("Page not found", [
        el("p", undefined, `There is no page at ${route.path}.`),
        routeButton("Go to ATLAS Explain", { kind: "tab", tab: "explain" }),
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


  /* The core loop: paste or type → plain answer → keep going → related terms → history.
     The panel is the same code as the extension popup's; the web app supplies only how it
     gets an answer (askWeb below) and where history is kept (this browser). */
  const panel = explainPanel({
    ask: askWeb,
    readsPage: false,
    placeholder: "Paste or type a term, a sentence or a headline: stop-limit order, implied volatility…",
    hint: "Ctrl+Enter to explain. Only the text you type here is used. Nothing is sent until you press Explain.",
    rows: 3,
    maxLength: 2000,
    examples: ["Stop-limit order", "Implied volatility", "Bid-ask spread", "Short interest"],
    steps: ["Reading your text", "Writing the answer", "Saving to history"],
    history: {
      initial: loadHistoryEntries(),
      save: saveHistoryEntries,
      limit: 8,
      // True on the web: Recent is this browser's list, but market-move answers are also saved to the account.
      note: "Kept in this browser. Market-move answers are also saved to your account, never with private notes.",
    },
    relatedTerms,
    announce: (text) => shell.announce(text),
  });
  const engine = panel.engine;
  // One status line for the whole Explain section (links, sign-in messages, the move card).
  const status = panel.status;
  const brief = digestCard();
  // Grounded digest: only the live ATLAS catalog on this computer feeds it, never a preview file.
  let marketCatalog: CatalogView | null = null;
  // Connection facts. Declared before the first Today render, which reads them.
  // ATLAS on this computer is present if either check found it: the connectors probe, or the asset
  // list loading from ATLAS. Each check keeps its own answer, so one cannot overwrite the other.
  let atlasProbed = false;
  let atlasCatalog = false;
  let atlasLocal = false;
  let marketCard: HTMLElement = marketDigestCard(buildMarketDigest(marketCatalog, { atlasPresent: atlasLocal }));
  let livePrices = false;
  let liveStatus: "loading" | "ready" | "error" = "loading";
  // Public live prices (Kraken or CoinGecko) when ATLAS is away: breadth and moves only, never leans.
  let liveCatalog: CatalogView | null = null;
  let liveCard: HTMLElement = liveSnapshotCard(liveCatalog);
  const refreshToday = (): void => {
    // The Today screen shows the market digest inline; swap in the fresh card when ATLAS answers.
    const next = marketDigestCard(buildMarketDigest(marketCatalog, { atlasPresent: atlasLocal }));
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
  ]);
  moveBox.classList.add("move-box");
  moveBox.hidden = true;

  shell.panels.explain.append(
    panel.head,
    panel.composer,
    engine.node,
    ...(panel.examples ? [panel.examples] : []),
    panel.status,
    panel.result,
    panel.history,
    moveBox,
  );

  /* ---------- Signal tab ---------- */

  const signal = signalCard({
    onWhy: () => openLegal("signal"),
    deskHint: "The live light is read by the Chrome extension on the ATLAS desk. Here it stays grey unless the desk sends its public signal.",
  });
  /* ---------- Today tab: digest first, then the paper light, then the next step ---------- */

  const todayHead = el("div", "panel-title");
  todayHead.append(el("h1", undefined, "Today"), el("span", "fine", new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date())));
  // Shown only to someone running ATLAS research software; the public never sees these blocks.
  const atlasBlock = el("div", "stack atlas-only");
  atlasBlock.hidden = true;
  atlasBlock.append(marketCard, brief.node, el("h2", "section-label", "Paper signal light"), signal.node);
  // In the news: real headlines from the free GDELT feed, each one tap from a plain explanation.
  let headlines: HTMLElement = headlinesCard({ kind: "loading" }, (title) => sendToExplain(title));
  shell.panels.today.append(
    todayHead,
    liveCard,
    headlines,
    atlasBlock,
  );
  void import("../core/catalog")
    .then((mod) => mod.loadHeadlines())
    .catch(() => ({ kind: "unavailable" as const }))
    .then((view) => {
      const next = headlinesCard(view, (title) => sendToExplain(title));
      headlines.replaceWith(next);
      headlines = next;
    });
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
      compact: true,
      onState: (state) => {
        // A refresh that is still loading keeps the last answer, as the price and digest lines below do.
        if (state.kind !== "loading") atlasCatalog = state.kind === "ready" && !isLivePriceSource(state.catalog.source);
        atlasLocal = atlasProbed || atlasCatalog;
        livePrices = state.kind === "ready" && isLivePriceSource(state.catalog.source);
        liveStatus = state.kind === "loading" ? (liveCatalog ? "ready" : "loading") : state.kind === "ready" ? "ready" : "error";
        if (state.kind !== "loading") marketCatalog = state.kind === "ready" && !isLivePriceSource(state.catalog.source) ? state.catalog : null;
        if (state.kind !== "loading") liveCatalog = state.kind === "ready" && isLivePriceSource(state.catalog.source) ? state.catalog : null;
        refreshToday();
        updateConnection();
      },
      onExplain: (text) => sendToExplain(text),
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
  // The same Learn section as the popup (learn path, then the glossary), loaded on demand.
  const learnSlot = el("div");
  learnSlot.append(el("p", "fine", "Loading the glossary…"));
  shell.panels.glossary.append(glossaryHead, learnSlot);
  void import("../wallet/learn-section").then((mod) => mod.mountLearn(learnSlot, {
    storedLearned: readLearned(),
    onAsk: (term) => sendToExplain(term.title),
    save: (ids) => {
      try {
        localStorage.setItem(LEARN_STORE_KEY, JSON.stringify(ids));
      } catch {
        // Private mode: progress lasts for this visit only.
      }
    },
    announce: (text) => shell.announce(text),
    initialCount: 6,
    onPractice: () => location.assign("/welcome#step-try"),
  }));

  /** Assets and Learn ask Explain the same way on both surfaces: go to Explain and answer now. */
  function sendToExplain(text: string): void {
    shell.select("explain");
    panel.explain(text);
  }

  /* ---------- Settings tab ---------- */

  const planSlot = el("div");
  const accountNote = el("p", "fine");
  accountNote.setAttribute("role", "status");
  const themeChoice = readTheme();
  applyTheme(themeChoice);
  const statsLine = el("p", "fine");
  const statsToggle = row("shield", "", () => {
    const next = storedConsent() === "granted" ? "denied" : "granted";
    storeConsent(next);
    applyConsent(next);
  });
  const statsGroup = group("Usage statistics", [statsLine, statsToggle]);
  statsGroup.hidden = true;
  function paintStats(): void {
    const on = storedConsent() === "granted";
    statsLine.textContent = on
      ? "On. Anonymous usage statistics help improve ATLAS Explain. We never collect what you highlight, type or save."
      : "Off. Nothing about how you use ATLAS Explain is collected.";
    const label = statsToggle.querySelector("span");
    if (label) label.textContent = on ? "Turn off usage statistics" : "Turn on usage statistics";
  }
  function applyConsent(value: "granted" | "denied" | "unset"): void {
    paintStats();
    if (value !== "granted") {
      tracker.attach(null);
      return;
    }
    void backend?.startAnalytics().then((sink) => tracker.attach(sink));
  }
  /** Only when the owner has turned analytics on: ask once, or apply the earlier answer. */
  function setupAnalytics(enabled: boolean): void {
    if (!enabled) return;
    statsGroup.hidden = false;
    const consent = storedConsent();
    if (consent === "unset") document.body.append(consentBar((value) => applyConsent(value)));
    else applyConsent(consent);
  }
  const yourData = yourDataGroup({
    collect: async () => {
      tracker.track("data_export");
      const remote = backend ? await backend.exportAccountData().catch(() => null) : null;
      let recent: string[];
      try {
        recent = readRecent(localStorage.getItem(RECENT_KEY));
      } catch {
        recent = [];
      }
      return {
        account: remote?.account ?? null,
        settings: remote?.settings ?? { theme: readTheme() },
        watchlist: remote?.watchlist ?? watchlist.ids(),
        savedExplanations: remote?.savedExplanations ?? [],
        browserHistory: loadTextHistory(),
        recentlyViewed: recent,
        learnProgress: Array.isArray(readLearned()) ? (readLearned() as unknown[]).filter((id): id is string => typeof id === "string") : [],
      };
    },
    deleteAccount: async () => {
      if (!backend) throw new Error("Account deletion isn't available right now. Reload the page and try again.");
      tracker.track("account_delete");
      return backend.deleteAccount();
    },
    afterClear: () => {
      panel.setHistory(loadHistoryEntries());
      watchlist.reloadLocal();
    },
    openSheet: (title, nodes) => shell.openSheet(title, nodes),
    closeSheet: () => shell.closeSheet(),
  });
  // Shown under the sign-in panel in the account sheet (header account button, /app/account, /signin).
  const settingsNodes: Node[] = buildSettings({
    plan: planSlot,
    theme: themeChoice,
    onTheme: (choice) => {
      try {
        localStorage.setItem(THEME_KEY, choice);
      } catch {
        // Private mode: theme lasts for this visit.
      }
      void backend?.savePrefs({ theme: choice }).catch(() => undefined);
    },
    yourData: yourData.node,
    stats: statsGroup,
    legal: { onTerms: () => openLegal("terms"), onPrivacy: () => openLegal("privacy") },
    about: { action: { icon: "panel", label: "Get the Chrome extension", run: () => shell.openSheet("Chrome extension", extensionNodes()) } },
  }).nodes;
  // One page has one top-level heading (Explain); the other section titles sit a level below it.
  for (const id of ["today", "glossary", "assets"] as const) {
    shell.panels[id].querySelector(".panel-title h1")?.setAttribute("aria-level", "2");
  }
  renderPlan(pricingView({ billingEnabled: false, plan: "free", freeCloudDailyLimit: DEFAULT_SETTINGS.freeCloudDailyLimit }), null);

  /* ---------- wiring ---------- */

  explainButton.addEventListener("click", () => void onExplain());
  cardInput.addEventListener("input", () => renderMove());
  window.addEventListener("hashchange", () => applyHash(location.hash));
  window.addEventListener("message", onInboundMessage);
  window.addEventListener("online", () => { void refreshLink(); refreshEngine(); });
  window.addEventListener("offline", () => { updateConnection(); refreshEngine(); });

  let currentSignal: SignalView = mapSignal({ connected: false });
  const hosted = !mayCallLocalAtlas(location, false);

  function updateConnection(): void {
    // ATLAS-only parts appear only when ATLAS itself is here: running locally, or the desk sent its signal.
    const atlasPresent = atlasLocal || currentSignal.connected;
    atlasBlock.hidden = !atlasPresent;
    shell.setMenuItemHidden("desk", !atlasPresent);
    shell.setConnection(connectionFor({ online: navigator.onLine, deskConnected: currentSignal.connected, atlasLocal, livePrices, hosted }));
  }

  async function refreshLink(): Promise<void> {
    const link = await probeAtlasLocal({ allowed: !hosted });
    atlasProbed = link.state === "local";
    atlasLocal = atlasProbed || atlasCatalog;
    // The digest card's wording depends on whether ATLAS answered, not only on its markets.
    refreshToday();
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
    // Prices arrive later and push lower sections down; put a deep-linked visitor back on their section.
    void startAssets(priceFeed).then(() => {
      if (!moved) jumpToRouteSection();
    });
    if (import.meta.env.DEV) applyPreview();
    const deepLink = route.kind !== "tab" || route.tab !== "explain";
    if (!readFlag(ONBOARDED_KEY) && !preview.has("tab") && !preview.has("demo") && !deepLink && !location.hash) showOnboarding();
    if (isAccountRoute(route) || route.kind === "not_found") void showRouteSheet();
    requestAnimationFrame(() => jumpToRouteSection());
    if (!backend) return;
    void backend.loadSettings().then(({ settings, priceFeed: next }) => {
      setupAnalytics(settings.analyticsEnabled);
      const changed = next.provider !== priceFeed.provider || next.coinGeckoDemoKey !== priceFeed.coinGeckoDemoKey;
      priceFeed.provider = next.provider;
      priceFeed.coinGeckoDemoKey = next.coinGeckoDemoKey;
      if (changed) void assets?.refresh();
    }).catch(() => undefined);
    void refreshPlan();
    void startAccount(backend);
    if (new URLSearchParams(location.search).get("checkout") === "done") {
      // Stripe sends people back here after paying. The plan sync job turns Pro on a little later.
      const thanks = "Thank you. Pro turns on for your account within about 15 minutes; you don't need to keep this page open.";
      shell.announce(thanks);
      accountNote.textContent = thanks;
      history.replaceState(null, "", location.pathname + location.hash);
    }
  }

  /* ---------- account ---------- */

  let account: AccountView | null = null;
  let lastAccountUid: string | null = null;

  async function startAccount(b: WebBackend): Promise<void> {
    try {
      await b.watchAccount((view) => {
        account = view;
        shell.setAccount(view);
        yourData.setSignedIn(Boolean(view?.signedIn));
        void refreshPlan();
        if (view && view.uid !== lastAccountUid) {
          lastAccountUid = view.uid;
          void watchlist.sync();
          if (view.signedIn) void b.loadPrefs().then((prefs) => {
            if (prefs) applyTheme(prefs.theme);
          }).catch(() => undefined);
        }
      });
      if (new URLSearchParams(location.search).get("account") === "open") openAccount();
      const outcome = await b.completeSignIn();
      if (outcome.state === "need-email") askLinkEmail(b);
      else reportSignIn(outcome);
    } catch {
      // Sign-in is optional. The app keeps working signed out.
    }
  }

  /** Announces how a returning sign-in ended and drops the one-time link from the address bar. */
  function reportSignIn(outcome: SignInOutcome): void {
    if (outcome.state === "none" || outcome.state === "need-email") return;
    if (outcome.state === "signed-in") tracker.track("login", { method: outcome.method });
    shell.announce(outcome.message);
    status.textContent = outcome.message;
    if (/[?&](signin|oobCode)=/.test(location.search)) history.replaceState(null, "", location.pathname + location.hash);
  }

  /** Email link opened on another device: ask for the address in the page, not a browser prompt. */
  function askLinkEmail(b: WebBackend): void {
    shell.openSheet("Finish signing in", [emailConfirmPanel(async (email) => {
      const outcome = await b.completeSignIn(email);
      if (outcome.state === "signed-in") {
        reportSignIn(outcome);
        window.setTimeout(() => (route.kind === "signin" ? afterSignIn() : shell.closeSheet()), 400);
        return outcome.message;
      }
      throw new Error(outcome.state === "error" ? outcome.message : "Sign-in did not finish. Try again in a moment.");
    })]);
  }

  function openAccount(): void {
    if (!backend) {
      shell.openSheet("Account", [el("p", "fine", "Sign-in isn't available right now. Reload the page to try again."), ...settingsNodes]);
      return;
    }
    const b = backend;
    shell.openSheet("Account", [accountPanel(account, {
      onGoogle: async () => {
        const result = await b.signInWithGoogle();
        if (result === "redirecting") return "Taking you to Google…";
        tracker.track("login", { method: "google" });
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
    }), ...settingsNodes]);
  }

  /** Back to where sign-in was asked from (?next=/app/...), otherwise the top of the page. */
  function afterSignIn(): void {
    const next = new URLSearchParams(location.search).get("next");
    const target = next ? parseRoute(next) : null;
    shell.closeSheet();
    navigate(target && target.kind !== "not_found" && !isAccountRoute(target) ? target : { kind: "tab", tab: "explain" }, { replace: true });
  }

  function renderSetup(): void {
    explainButton.disabled = true;
    if (!import.meta.env.DEV) {
      const card = messageCard("error", "Explanations are unavailable right now", "Something on our side isn't working. Reload the page, or try again in a few minutes. The Learn library still works.", () => location.reload());
      panel.disable(card);
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
    panel.disable(card);
  }

  function showOnboarding(): void {
    tracker.track("tutorial_begin");
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
      // The text composer is the main way in (the move-card button is hidden until a desk link opens it).
      panel.input.focus({ preventScroll: true });
    }, {
      onTry: () => {
        tracker.track("try_sample");
        shell.overlay(null);
        writeFlag(ONBOARDED_KEY);
        navigate({ kind: "tab", tab: "explain" });
        panel.explain(SAMPLE_TERM);
      },
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

  /** How the web app gets an answer: its backend (on-device first, then the cloud). */
  async function askWeb(request: ExplainRequest): Promise<ExplainOutcome> {
    if (!backend) {
      return {
        kind: "error",
        title: "Explanations are unavailable right now",
        message: "Something on our side isn't working. Reload the page, or try again in a few minutes. The Learn library still works.",
        retry: true,
        onRetry: () => location.reload(),
      };
    }
    const followUp = Boolean(request.question);
    try {
      const run = await withDeadline(
        backend.explainText(request.text, request.question, { onProgress: (message) => request.progress(1, message) }),
        EXPLAIN_DEADLINE_MS,
        "The answer took too long.",
      );
      const source = run.inferenceSource === "on_device" ? "on_device" : run.inferenceSource === "in_cloud" ? "in_cloud" : "unknown";
      tracker.track("explanation_ready", { source: source === "in_cloud" ? "cloud" : source, kind: followUp ? "follow_up" : "text" });
      const notes: string[] = [];
      if (run.cloudBlocked && source === "on_device") notes.push("The cloud was off limits for now, so this ran on your device only.");
      if (run.refusedRecommendation) notes.push("Trade decisions are not given. The factors on both sides are explained instead.");
      return { kind: "answer", rawText: run.plain, source, subject: request.text, notes };
    } catch (error) {
      return explainFailure(error);
    }
  }

  /** How a failed answer is counted and shown, for typed text and market moves alike. */
  function explainFailure(error: unknown): ExplainOutcome {
    const limit = error instanceof CloudAllowanceUsed || error instanceof CloudRateLimited || error instanceof WatchlistAllowance;
    tracker.track("explanation_failed", { reason: limit ? "limit" : !navigator.onLine ? "offline" : "error" });
    if (error instanceof CloudRateLimited) report("rate_limited", "web", "browser_limit");
    else if (!limit) report(classifyCloudError(error instanceof Error ? error.message : ""), "web", error instanceof Error ? error.name : "unknown");
    if (limit) return { kind: "limit", message: (error as Error).message };
    if (!navigator.onLine) return { kind: "offline" };
    return { kind: "error", message: friendlyError(error), retry: true };
  }

  /* History is kept in this browser under the same key and shape as before (it is part of
     "Download my data"); the panel works with the shared history entries. */
  function loadHistoryEntries(): RecentEntry[] {
    return loadTextHistory().map((entry) => ({ id: entry.id, at: entry.at, selection: entry.text, text: entry.plain, source: entry.source }));
  }

  function saveHistoryEntries(list: RecentEntry[]): void {
    const entries: TextHistoryEntry[] = list.map((entry) => ({ id: entry.id, text: entry.selection, answer: parseTwoSided(entry.text), plain: entry.text, source: entry.source, at: entry.at }));
    try {
      localStorage.setItem(TEXT_HISTORY_KEY, JSON.stringify(entries));
    } catch {
      // Private mode: history lasts for this visit only.
    }
  }

  function loadTextHistory(): TextHistoryEntry[] {
    try {
      return readTextHistory(localStorage.getItem(TEXT_HISTORY_KEY));
    } catch {
      return [];
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

  /**
   * "Explain the move": the card is checked here, then the shared Explain panel does the rest
   * (progress, the two-sided answer, follow-ups, errors and Recent), as for typed text.
   */
  async function onExplain(): Promise<void> {
    if (!backend) return renderSetup();
    const prepared = await prepareCard();
    if (!prepared.ok) return renderErrors(prepared.errors);
    renderErrors([]);
    await panel.run({ subject: moveSubject(prepared.card), ask: askMove });
  }

  /** How a market move is answered. Follow-ups ask about the same card with their own question. */
  async function askMove(request: ExplainRequest): Promise<ExplainOutcome> {
    if (!backend) return { kind: "error", message: "Explanations are unavailable right now. Reload the page.", retry: false };
    const prepared = await prepareCard();
    if (!prepared.ok) {
      renderErrors(prepared.errors);
      return { kind: "error", title: "Check the move card", message: "The move card has a problem. The list above the question says what to fix.", retry: false };
    }
    const question = request.question || questionInput.value;
    request.progress(1);
    try {
      const run = await withDeadline(
        backend.explain(prepared.card, question, { onProgress: (message) => request.progress(1, message) }),
        EXPLAIN_DEADLINE_MS,
        "The answer took too long.",
      );
      tracker.track("explanation_ready", { source: run.inferenceSource === "in_cloud" ? "cloud" : run.inferenceSource, kind: request.question ? "follow_up" : "move" });
      // Saved for this account (or this browser's anonymous id): the public card and the answer, never private notes.
      void backend.save(run, prepared.card, question).catch(() => undefined);
      return moveOutcome(run, moveSubject(prepared.card));
    } catch (error) {
      return explainFailure(error);
    }
  }

  function moveSubject(card: MoveCard): string {
    return `${card.symbol} ${formatPct(card.movePct)} move`;
  }

  /** A move answer in the shared two-sided shape, with what only a move answer has as notes. */
  function moveOutcome(run: ExplanationRun, subject: string): ExplainOutcome {
    const ex = run.explanation;
    const notes = [moveNote(run)].filter(Boolean);
    if (ex.headlineTopics.length > 0) {
      notes.push(`Headlines read as: ${ex.headlineTopics.map((item) => (item.coerced ? `${item.topic} (mapped)` : item.topic)).join(", ")}.`);
    }
    if (ex.truncatedReasons) notes.push("The model returned more than three reasons. The first three are shown.");
    return {
      kind: "answer",
      rawText: JSON.stringify({ summary: ex.summary, buyerReasons: ex.buyerReasons, sellerReasons: ex.sellerReasons, whatWouldChange: ex.whatWouldChange }),
      source: run.inferenceSource === "on_device" ? "on_device" : run.inferenceSource === "in_cloud" ? "in_cloud" : "unknown",
      subject,
      notes,
    };
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
    yourData.setPro(Boolean(snapshot?.pricing.showManage));
    const b = backend;
    if (b && snapshot && acts.includes("checkout") && snapshot.pricing.showCheckout) {
      // Pro is tied to an account, so checkout needs a sign-in first. A plan with no link set up shows no button.
      const offers = (["yearly", "monthly"] as const).filter((interval) => snapshot.checkout[interval]);
      const gains = view.rows.filter((r) => r.free !== r.pro).map((r) => `${r.label.toLowerCase()} ${r.pro.toLowerCase()}`).join("; ");
      if (gains) extras.push(el("p", "fine", `With Pro: ${gains}.`));
      if (!account?.signedIn) {
        const signIn = labelledButton("user", "Sign in to get Pro", "secondary");
        signIn.addEventListener("click", () => navigate({ kind: "signin" }));
        extras.push(el("p", "fine", `Pro is ${PRO_PRICE_LABELS.monthly} or ${PRO_PRICE_LABELS.yearly}. It is added to your account, so sign in first.`), signIn);
      } else if (offers.length) {
        const pay = (interval: ProInterval) => {
          const button = labelledButton("card", `Get Pro: ${PRO_PRICE_LABELS[interval]}`, interval === offers[0] ? "primary" : "secondary");
          button.addEventListener("click", () => {
            accountNote.textContent = "Opening Stripe checkout…";
            void b.startCheckout(interval).catch((error: unknown) => {
              accountNote.textContent = error instanceof Error ? error.message : "Checkout did not start. Nothing was charged.";
            });
          });
          return button;
        };
        extras.push(...offers.map(pay), el("p", "fine", "You pay on Stripe's page; we never see your card. Pro turns on within about 15 minutes of paying. Cancel any time."));
      }
    }
    if (b && snapshot?.pricing.showManage && snapshot.portalUrl) {
      const manage = labelledButton("card", "Manage or cancel Pro", "secondary");
      manage.addEventListener("click", () => {
        accountNote.textContent = "Opening Stripe…";
        void b.openBillingPortal().catch((error: unknown) => {
          accountNote.textContent = error instanceof Error ? error.message : "That did not open. Try again.";
        });
      });
      extras.push(manage);
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
    if (tab === "assets" || tab === "glossary" || tab === "explain" || tab === "today") window.setTimeout(() => shell.select(tab), 300);
    if (tab === "settings") openAccount();
    if (tab === "signal") shell.select("today");
    const demo = preview.get("demo");
    if (demo === "run") panel.show(moveOutcome(devSampleRun(), "NVDA -17% move"));
    if (demo === "loading") panel.showLoading(1);
    if (demo === "error") panel.show({ kind: "error", message: "The cloud model could not be reached. Check your connection and retry.", retry: false });
    if (preview.get("onboarding") === "1") showOnboarding();
    if (preview.get("sheet") === "terms") openLegal("terms");
    if (preview.get("sheet") === "extension") shell.openSheet("Chrome extension", extensionNodes());
    if (preview.get("sheet") === "confirm-email") {
      shell.openSheet("Finish signing in", [emailConfirmPanel(() => Promise.reject(new Error("Preview only: there is no sign-in link to finish.")))]);
    }
    // ?plan=free | account | pro: the plan card as it looks once billing is on (Stripe test-mode style links).
    const planPreview = preview.get("plan");
    if (planPreview === "free" || planPreview === "account" || planPreview === "pro") {
      const show = (): void => {
      if (planPreview !== "free") account = { uid: "PreviewUid1", signedIn: true, label: "Preview account", email: null, initials: "PA", provider: "google" };
      const snapshot = billingSnapshot({
        billingEnabled: true,
        plan: planPreview === "pro" ? "pro" : "free",
        freeCloudDailyLimit: DEFAULT_SETTINGS.freeCloudDailyLimit,
        proCloudDailyLimit: DEFAULT_SETTINGS.proCloudDailyLimit,
        cloudCallsToday: 0,
        links: PREVIEW_BILLING_LINKS,
        accountUid: account?.uid ?? null,
      });
      renderPlan(snapshot.pricing, snapshot);
      };
      // After the real account and plan have loaded, so they don't replace the preview.
      window.setTimeout(show, 2500);
      openAccount();
    }
    if (preview.get("sheet") === "today") shell.select("today");
    if (preview.get("menu") === "open") document.querySelector<HTMLButtonElement>(".bar .icon-btn")?.click();
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

/** What happened to private notes on a move answer. Where it ran is said by the shared panel. */
function moveNote(run: ExplanationRun): string {
  const fallback = run.fellBackToCloud ? "On-device was unavailable, so the cloud ran without private notes. " : "";
  const privacy = run.privateContextUsed ? "Notes stayed on this device and were not saved." : "Private notes were not sent.";
  return `${fallback}${privacy}`;
}

export function formatPct(value: number): string {
  const text = Number.isInteger(value) ? value.toString() : String(value);
  return value > 0 ? `+${text}%` : `${text}%`;
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

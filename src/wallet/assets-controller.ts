import {
  explainAssetQuestion,
  loadCatalog,
  loadDetail,
  nextPollMs,
  POLL_CRYPTO_MS,
  POLL_STOCK_MS,
  type AssetDetailView,
  type AssetView,
  type AssetsState,
  type Fetcher,
} from "../core/assets";
import { DEFAULT_PRICE_FEED, isLivePriceSource, type PriceFeedOptions } from "../core/price-feed";
import { assetDetail, assetsPanel } from "./assets";
import { el } from "./dom";
import type { WalletShell } from "./shell";

/**
 * Mounts the Assets tab: list, detail sheet, live refresh and the connection state.
 * Polls only while the popup is visible: crypto about every 15 s, stocks every 15 min.
 */
export function mountAssets(options: {
  shell: WalletShell;
  canReachAtlas: boolean;
  onExplain: (question: string) => void;
  fetcher?: Fetcher;
  onState?: (state: AssetsState) => void;
  /** Public live-price feed used when ATLAS is not reachable. Default is Kraken. */
  priceFeed?: PriceFeedOptions;
  /** Called when an asset's detail sheet opens (the web app gives it its own address). */
  onOpen?: (symbol: string) => void;
}): { refresh: () => Promise<void>; open: (symbol: string) => Promise<boolean> } {
  const { shell } = options;
  const head = el("div", "panel-title");
  head.append(el("h1", undefined, "Assets"), el("span", "fine", "Live prices"));
  const panel = assetsPanel({
    onOpen: (a) => void openAsset(a),
    onRetry: () => void refresh(),
  });
  shell.panels.assets.append(head, panel.node);

  let listTimer: number | undefined;
  let detailTimer: number | undefined;
  let openSymbol: string | null = null;
  let last: AssetsState = { kind: "loading" };
  let busy = false;

  async function refresh(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      last = await readState();
      panel.update(last);
      options.onState?.(last);
    } finally {
      busy = false;
      schedule();
    }
  }

  async function readState(): Promise<AssetsState> {
    // ATLAS on this computer first (prices + paper predictions). When it is not reachable,
    // crypto prices still load live from the configured public feed, with every light grey.
    if (options.canReachAtlas) {
      const atlas = await loadCatalog(options.fetcher);
      if (atlas.kind === "ready" || atlas.kind === "error") return atlas;
    }
    const { loadLiveCatalog } = await import("../core/price-provider");
    return loadLiveCatalog(options.priceFeed ?? DEFAULT_PRICE_FEED, options.fetcher);
  }

  function visible(): boolean {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
  }

  function schedule(): void {
    window.clearTimeout(listTimer);
    if (last.kind === "hosted") return;
    const delay = last.kind === "ready" ? nextPollMs(last.catalog.assets, visible()) : visible() ? POLL_CRYPTO_MS : null;
    if (delay != null) listTimer = window.setTimeout(() => void refresh(), delay);
  }

  document.addEventListener("visibilitychange", () => {
    if (visible()) void refresh();
    else {
      window.clearTimeout(listTimer);
      window.clearTimeout(detailTimer);
    }
  });

  async function openAsset(a: AssetView): Promise<void> {
    openSymbol = a.symbol;
    options.onOpen?.(a.symbol);
    const view = assetDetail(a, {
      onExplain: (x) => {
        shell.closeSheet();
        options.onExplain(explainAssetQuestion(x));
      },
      onWhy: (x) => {
        shell.closeSheet();
        options.onExplain(`Why would an educational paper light for ${x.name} (${x.symbol}) show "${x.light.label}"? ATLAS says: ${x.light.reason} Explain hit rate, sample size and the evidence gate. Do not recommend a trade.`);
      },
      priceSource: last.kind === "ready" ? last.catalog.source : undefined,
    });
    shell.openSheet(a.name, view.nodes);
    const tick = async (): Promise<void> => {
      if (openSymbol !== a.symbol) return;
      const fromLive = last.kind === "ready" && isLivePriceSource(last.catalog.source);
      const d: AssetDetailView | null = fromLive
        ? await import("../core/price-provider").then((mod) => mod.loadLiveDetail(a.symbol, options.priceFeed ?? DEFAULT_PRICE_FEED, options.fetcher))
        : await loadDetail(a.symbol, options.fetcher);
      if (openSymbol !== a.symbol) return;
      if (d) view.update(d);
      window.clearTimeout(detailTimer);
      if (visible()) detailTimer = window.setTimeout(() => void tick(), a.klass === "crypto" ? POLL_CRYPTO_MS : POLL_STOCK_MS);
    };
    await tick();
  }

  /** Opens an asset by symbol. Resolves false when the catalog has no such asset right now. */
  async function open(symbol: string): Promise<boolean> {
    if (last.kind !== "ready") await refresh();
    const want = symbol.toUpperCase();
    const a = last.kind === "ready" ? last.catalog.assets.find((x) => x.symbol.toUpperCase() === want) : undefined;
    if (!a) return false;
    await openAsset(a);
    return true;
  }

  const sheetObserver = new MutationObserver(() => {
    if (shell.frame.dataset.sheet !== "open") {
      openSymbol = null;
      window.clearTimeout(detailTimer);
    }
  });
  sheetObserver.observe(shell.frame, { attributes: true, attributeFilter: ["data-sheet"] });

  return { refresh, open };
}

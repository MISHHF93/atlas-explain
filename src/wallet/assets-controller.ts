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
import type { Asset } from "../core/asset-schema";
import { DEFAULT_PRICE_FEED, isLivePriceSource, type PriceFeedOptions } from "../core/price-feed";
import { assetDetail, assetsPanel, sparkSpan } from "./assets";
import type { CatalogPanelHandle } from "./catalog-view";
import type { Watchlist } from "../core/watchlist";
import { el } from "./dom";
import type { WalletShell } from "./shell";

/**
 * Mounts the Assets tab. The public catalog (every class, on the Asset schema) is the default;
 * the ATLAS view with paper lights appears only when ATLAS on this computer answers.
 * Polls only while visible: crypto about every 15 s, stocks every 15 min.
 */
export function mountAssets(options: {
  shell: WalletShell;
  canReachAtlas: boolean;
  onExplain: (question: string) => void;
  fetcher?: Fetcher;
  onState?: (state: AssetsState) => void;
  /** Public live-price feed used when ATLAS is not reachable. */
  priceFeed?: PriceFeedOptions;
  /** Called when an asset's page opens (the web app gives it its own address). */
  onOpen?: (symbol: string) => void;
  /** Device-only or account-synced watchlist. */
  watchlist?: Watchlist;
}): { refresh: () => Promise<void>; open: (symbol: string) => Promise<boolean> } {
  const { shell } = options;
  const head = el("div", "panel-title");
  head.append(el("h1", undefined, "Assets"), el("span", "fine", "Education only"));
  // ATLAS view (owner only): the original list with paper lights.
  const panel = assetsPanel({
    onOpen: (a) => void openAtlasAsset(a),
    onRetry: () => void refresh(),
  });
  panel.node.hidden = true;
  // Public catalog: loaded on demand.
  const publicSlot = el("div");
  shell.panels.assets.append(head, panel.node, publicSlot);

  let catalog: CatalogPanelHandle | null = null;
  let catalogUi: typeof import("./catalog-view") | null = null;
  let publicAssets: Asset[] = [];
  let listTimer: number | undefined;
  let detailTimer: number | undefined;
  let openKey: string | null = null;
  let last: AssetsState = { kind: "loading" };
  let fromAtlas = false;
  let busy = false;

  void showPublic({ kind: "loading" });

  async function ui(): Promise<typeof import("./catalog-view")> {
    catalogUi ??= await import("./catalog-view");
    if (!catalog) {
      const v = catalogUi;
      catalog = v.catalogPanel({ onOpen: (a) => void openPublic(a), onRetry: () => void refresh(), recent: () => readRecentIds(v), watchlist: options.watchlist });
      options.watchlist?.onChange(() => catalog?.refreshRecent());
      publicSlot.append(catalog.node);
    }
    return catalogUi;
  }

  async function showPublic(state: Parameters<CatalogPanelHandle["update"]>[0]): Promise<void> {
    await ui();
    panel.node.hidden = true;
    publicSlot.hidden = false;
    catalog?.update(state);
  }

  async function refresh(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      last = await readState();
      if (fromAtlas) {
        publicSlot.hidden = true;
        panel.node.hidden = false;
        panel.update(last);
      } else if (last.kind !== "loading") {
        // Public catalog: live crypto plus the official data published by the scheduled job.
        const v = await ui();
        const official = await v.loadMarketData();
        // Explainer pages (indices, futures, options) ship with the app, so the catalog is never empty.
        if (last.kind === "ready") {
          publicAssets = [...v.assetsFromLiveCatalog(last.catalog), ...official, ...v.EDUCATION_ASSETS];
          await showPublic({ kind: "ready", assets: publicAssets });
        } else {
          publicAssets = [...official, ...v.EDUCATION_ASSETS];
          await showPublic({ kind: "ready", assets: publicAssets, notice: "Crypto prices couldn't be loaded right now. We'll try again shortly." });
        }
      }
      options.onState?.(last);
    } finally {
      busy = false;
      schedule();
    }
  }

  async function readState(): Promise<AssetsState> {
    // ATLAS on this computer first (owner only). Otherwise the public catalog.
    if (options.canReachAtlas) {
      const atlas = await loadCatalog(options.fetcher);
      if (atlas.kind === "ready" || atlas.kind === "error") {
        fromAtlas = true;
        return atlas;
      }
    }
    fromAtlas = false;
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

  /* ---------- public asset page ---------- */

  async function openPublic(a: Asset): Promise<void> {
    const view = await ui();
    openKey = a.id;
    writeRecent(view, a.id);
    catalog?.refreshRecent();
    // Addresses use the slashless symbol (EURUSD), which the router accepts and findAsset resolves.
    options.onOpen?.(a.symbol.replace("/", ""));
    const page = view.assetPage(a, {
      onExplain: (x) => {
        shell.closeSheet();
        options.onExplain(view.explainAssetPrompt(x));
      },
      onTerm: (title) => {
        shell.closeSheet();
        options.onExplain(`Explain "${title}" in plain language with a short example. Do not recommend a trade.`);
      },
      watchlist: options.watchlist,
      news: (x) => view.loadNews(x.id),
      onAsk: (question) => {
        shell.closeSheet();
        options.onExplain(question);
      },
    });
    shell.openSheet(a.name, page.nodes);
    if (a.class !== "crypto" || last.kind !== "ready" || !isLivePriceSource(last.catalog.source)) return;
    const source = last.catalog.source;
    const tick = async (): Promise<void> => {
      if (openKey !== a.id) return;
      const mod = await import("../core/price-provider");
      const d = await mod.loadLiveDetail(a.symbol, options.priceFeed ?? DEFAULT_PRICE_FEED, options.fetcher);
      if (openKey !== a.id) return;
      if (d) {
        const fresh = view.assetFromLiveRow(d, source);
        if (fresh) page.update(fresh);
        page.setSpark(d.spark.points, sparkSpan(d.spark.points.length, d.spark.interval));
      }
      window.clearTimeout(detailTimer);
      if (visible()) detailTimer = window.setTimeout(() => void tick(), POLL_CRYPTO_MS);
    };
    await tick();
  }

  /* ---------- ATLAS asset page (owner only) ---------- */

  async function openAtlasAsset(a: AssetView): Promise<void> {
    openKey = a.symbol;
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
      if (openKey !== a.symbol) return;
      const d: AssetDetailView | null = await loadDetail(a.symbol, options.fetcher);
      if (openKey !== a.symbol) return;
      if (d) view.update(d);
      window.clearTimeout(detailTimer);
      if (visible()) detailTimer = window.setTimeout(() => void tick(), a.klass === "crypto" ? POLL_CRYPTO_MS : POLL_STOCK_MS);
    };
    await tick();
  }

  /** Opens an asset by symbol or id. Resolves false when the catalog has no such asset right now. */
  async function open(key: string): Promise<boolean> {
    if (last.kind !== "ready") await refresh();
    if (fromAtlas) {
      const want = key.toUpperCase();
      const a = last.kind === "ready" ? last.catalog.assets.find((x) => x.symbol.toUpperCase() === want) : undefined;
      if (!a) return false;
      await openAtlasAsset(a);
      return true;
    }
    const a = (await ui()).findAsset(publicAssets, key);
    if (!a) return false;
    await openPublic(a);
    return true;
  }

  const sheetObserver = new MutationObserver(() => {
    if (shell.frame.dataset.sheet !== "open") {
      openKey = null;
      window.clearTimeout(detailTimer);
    }
  });
  sheetObserver.observe(shell.frame, { attributes: true, attributeFilter: ["data-sheet"] });

  return { refresh, open };
}

type CatalogUi = typeof import("./catalog-view");

function readRecentIds(v: CatalogUi): string[] {
  try {
    return v.readRecent(localStorage.getItem(v.RECENT_KEY));
  } catch {
    return [];
  }
}

function writeRecent(v: CatalogUi, id: string): void {
  try {
    localStorage.setItem(v.RECENT_KEY, JSON.stringify(v.addRecent(readRecentIds(v), id)));
  } catch {
    // Private mode: recently viewed lasts for this visit only.
  }
}

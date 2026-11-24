import { nextPollMs, POLL_CRYPTO_MS, type AssetsState, type Fetcher } from "../core/assets";
import type { Asset } from "../core/asset-schema";
import { DEFAULT_PRICE_FEED, isLivePriceSource, type PriceFeedOptions } from "../core/price-feed";
import type { CatalogPanelHandle } from "./catalog-view";
import type { Watchlist } from "../core/watchlist";
import { el } from "./dom";
import type { WalletShell } from "./shell";

/**
 * Mounts the Assets tab: the public catalog (every class, on the Asset schema), with crypto prices
 * from the captured file. Polls only while visible: crypto about every 15 s, stocks every 15 min.
 */
export function mountAssets(options: {
  shell: WalletShell;
  onExplain: (question: string) => void;
  fetcher?: Fetcher;
  onState?: (state: AssetsState) => void;
  /** Price-feed options (company logos). */
  priceFeed?: PriceFeedOptions;
  /** Called when an asset's page opens (the web app gives it its own address). */
  onOpen?: (symbol: string) => void;
  /** Device-only or account-synced watchlist. */
  watchlist?: Watchlist;
}): { refresh: () => Promise<void>; open: (symbol: string) => Promise<boolean> } {
  const { shell } = options;
  const head = el("div", "panel-title");
  head.append(el("h1", undefined, "Assets"), el("span", "fine", "Education only"));
  // The catalog: loaded on demand.
  const publicSlot = el("div");
  shell.panels.assets.append(head, publicSlot);

  let catalog: CatalogPanelHandle | null = null;
  let catalogUi: typeof import("./catalog-view") | null = null;
  let publicAssets: Asset[] = [];
  let listTimer: number | undefined;
  let detailTimer: number | undefined;
  let openKey: string | null = null;
  let last: AssetsState = { kind: "loading" };
  let busy = false;
  let stopTicks: (() => void) | undefined;

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
    publicSlot.hidden = false;
    catalog?.update(state);
  }

  async function refresh(): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      last = await readState();
      if (last.kind !== "loading") {
        // Public catalog: live crypto plus the official data published by the scheduled job.
        const v = await ui();
        const official = await v.loadMarketData();
        // Explainer pages (indices, futures, options) ship with the app, so the catalog is never empty.
        if (last.kind === "ready") {
          publicAssets = v.withCompanyLogos([...v.assetsFromLiveCatalog(last.catalog), ...official, ...v.EDUCATION_ASSETS], options.priceFeed?.logoDevToken);
          await showPublic({ kind: "ready", assets: publicAssets });
        } else {
          publicAssets = v.withCompanyLogos([...official, ...v.EDUCATION_ASSETS], options.priceFeed?.logoDevToken);
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
    const { loadLiveCatalog, onTicks } = await import("../core/price-provider");
    // Real time: redraw the list (and Today, through onState) as Kraken's live ticks arrive.
    stopTicks ??= onTicks(() => {
      if (visible()) void refresh();
    });
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
    // A chosen chart range sticks while the page is open; the live refresh then leaves the chart alone.
    let chosenRange: number | null = null;
    const feed = options.priceFeed ?? DEFAULT_PRICE_FEED;
    const liveCrypto = a.class === "crypto" && last.kind === "ready" && isLivePriceSource(last.catalog.source);
    const prices = liveCrypto ? await import("../core/price-provider") : null;
    const page = view.assetPage(a, {
      ...(prices && prices.supportsChartRanges(feed)
        ? {
            chartRanges: {
              ranges: prices.CHART_RANGES,
              onRange: async (days: number) => {
                const range = prices.CHART_RANGES.find((r) => r.days === days);
                if (!range) return;
                chosenRange = days;
                const points = await prices.loadLiveChart(a.symbol, range.days, feed, options.fetcher);
                if (openKey !== a.id || chosenRange !== days) return;
                if (points.length >= 2) page.setSpark(points, range.caption);
                page.markRange(days);
              },
            },
          }
        : {}),
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
        if (chosenRange === null) page.setSpark(d.spark.points, sparkSpan(d.spark.points.length, d.spark.interval));
      }
      window.clearTimeout(detailTimer);
      if (visible()) detailTimer = window.setTimeout(() => void tick(), POLL_CRYPTO_MS);
    };
    await tick();
  }

  /** Opens an asset by symbol or id. Resolves false when the catalog has no such asset right now. */
  async function open(key: string): Promise<boolean> {
    if (last.kind !== "ready") await refresh();
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

/** "last 24 hours" for 24 hourly closes, "last 30 days" for 30 daily ones. */
export function sparkSpan(points: number, interval: string): string {
  if (/^1h$/i.test(interval)) return `last ${points} hours`;
  if (/^1d$/i.test(interval)) return `last ${points} days`;
  return `last ${points} ${interval} closes`;
}

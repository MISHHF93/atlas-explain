import {
  explainAssetQuestion,
  loadCatalog,
  loadDetail,
  nextPollMs,
  readCatalog,
  readDetail,
  POLL_CRYPTO_MS,
  POLL_STOCK_MS,
  type AssetDetailView,
  type AssetView,
  type AssetsState,
  type Fetcher,
} from "../core/assets";
import { loadKrakenCatalog, loadKrakenDetail } from "../core/kraken";
import { assetDetail, assetsPanel } from "./assets";
import { el } from "./dom";
import type { WalletShell } from "./shell";

/** Box preview only: payloads captured from the real ATLAS route, shown with a banner. */
export interface AssetsPreview {
  label: string;
  list: unknown;
  details: Record<string, unknown>;
  state?: "ready" | "not_connected" | "hosted" | "loading";
}

/**
 * Mounts the Assets tab: list, detail sheet, live refresh and the connection state.
 * Polls only while the popup is visible: crypto about every 15 s, stocks every 15 min.
 */
export function mountAssets(options: {
  shell: WalletShell;
  canReachAtlas: boolean;
  onExplain: (question: string) => void;
  fetcher?: Fetcher;
  preview?: AssetsPreview;
  onState?: (state: AssetsState) => void;
}): { refresh: () => Promise<void>; open: (symbol: string) => Promise<void> } {
  const { shell, preview } = options;
  const head = el("div", "panel-title");
  head.append(el("h1", undefined, "Assets"), el("span", "fine", "Paper only"));
  const panel = assetsPanel({
    onOpen: (a) => void openAsset(a),
    onRetry: () => void refresh(),
    preview: preview?.label,
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
    if (preview) {
      if (preview.state && preview.state !== "ready") {
        return preview.state === "loading" ? { kind: "loading" } : preview.state === "hosted" ? { kind: "hosted" } : { kind: "not_connected", reason: "ATLAS is not answering at localhost:3000." };
      }
      const catalog = readCatalog(preview.list);
      return catalog ? { kind: "ready", catalog } : { kind: "error", reason: "Preview data is not readable." };
    }
    // ATLAS on this computer first (prices + paper predictions). When it is not reachable,
    // crypto prices still load live from Kraken's public feed, with every light grey.
    if (options.canReachAtlas) {
      const atlas = await loadCatalog(options.fetcher);
      if (atlas.kind === "ready" || atlas.kind === "error") return atlas;
    }
    return loadKrakenCatalog(options.fetcher);
  }

  function visible(): boolean {
    return typeof document === "undefined" || document.visibilityState !== "hidden";
  }

  function schedule(): void {
    window.clearTimeout(listTimer);
    if (preview || last.kind === "hosted") return;
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
    const view = assetDetail(a, {
      onExplain: (x) => {
        shell.closeSheet();
        options.onExplain(explainAssetQuestion(x));
      },
      onWhy: (x) => {
        shell.closeSheet();
        options.onExplain(`Why would an educational paper light for ${x.name} (${x.symbol}) show "${x.light.label}"? ATLAS says: ${x.light.reason} Explain hit rate, sample size and the evidence gate. Do not recommend a trade.`);
      },
    });
    const banner = preview?.label ? [el("p", "preview-banner", preview.label)] : [];
    shell.openSheet(a.name, [...banner, ...view.nodes]);
    const tick = async (): Promise<void> => {
      if (openSymbol !== a.symbol) return;
      const fromKraken = last.kind === "ready" && last.catalog.source === "kraken";
      const d: AssetDetailView | null = preview
        ? readDetail(preview.details[a.symbol])
        : fromKraken
          ? await loadKrakenDetail(a.symbol, options.fetcher)
          : await loadDetail(a.symbol, options.fetcher);
      if (openSymbol !== a.symbol) return;
      if (d) view.update(d);
      window.clearTimeout(detailTimer);
      if (!preview && visible()) detailTimer = window.setTimeout(() => void tick(), a.klass === "crypto" ? POLL_CRYPTO_MS : POLL_STOCK_MS);
    };
    await tick();
  }

  async function open(symbol: string): Promise<void> {
    if (last.kind !== "ready") await refresh();
    const a = last.kind === "ready" ? last.catalog.assets.find((x) => x.symbol === symbol) : undefined;
    if (a) await openAsset(a);
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

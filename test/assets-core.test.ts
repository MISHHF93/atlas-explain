import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  ASSETS_SCHEMA,
  changeWindowText,
  canReachLocalAtlas,
  carriesPrivateFields,
  explainAssetQuestion,
  filterAssets,
  formatChange,
  formatPrice,
  loadCatalog,
  loadDetail,
  mapLean,
  mapQuote,
  nextPollMs,
  readCatalog,
  readDetail,
  sparkPath,
  POLL_CRYPTO_MS,
  POLL_STOCK_MS,
  type Fetcher,
} from "../src/core/assets";
import { connectionCopy } from "../src/core/popup-copy";


const box = JSON.parse(readFileSync("src/wallet/box-preview.json", "utf8")) as { capturedAt: string; list: unknown; details: Record<string, unknown> };
const NOW = Date.parse(box.capturedAt) + 60_000;
const TRADE = /\b(buy|sell)\b/i;

const lean = (over: Record<string, unknown> = {}) => ({
  horizon: "1h", horizonLabel: "Next hour", lean: "up", colour: "green", label: "Leans up",
  reason: "Model leans up on the paper shadow log over the next hour. Every gate passed.", sampleSize: 240, hitRate: 0.6, ...over,
});

describe("lean mapping", () => {
  it("keeps a fully evidenced lean", () => {
    expect(mapLean(lean())).toMatchObject({ colour: "green", lean: "up", label: "Leans up" });
    expect(mapLean(lean({ lean: "down", colour: "red", reason: "Model leans down. Every gate passed." }))).toMatchObject({ colour: "red", label: "Leans down" });
  });

  it("is grey by default and whenever evidence is thin or the payload disagrees", () => {
    expect(mapLean(null)).toMatchObject({ colour: "grey", lean: "none", label: "Not enough evidence" });
    expect(mapLean(lean({ sampleSize: 199 })).colour).toBe("grey");
    expect(mapLean(lean({ hitRate: 0.54 })).colour).toBe("grey");
    expect(mapLean(lean({ hitRate: 1.4 })).colour).toBe("grey");
    expect(mapLean(lean({ colour: "red" })).colour).toBe("grey");
    expect(mapLean(lean({ lean: "sideways" })).colour).toBe("grey");
    expect(mapLean(lean({ reason: "Time to buy now" })).colour).toBe("grey");
    expect(mapLean(lean({ sampleSize: 12 })).reason).toMatch(/12 of 200/);
  });

  it("never shows trade wording in a reason", () => {
    expect(mapLean(lean({ colour: "grey", lean: "none", reason: "sell everything" })).reason).not.toMatch(TRADE);
  });
});

describe("quotes and freshness", () => {
  const t = (msAgo: number) => new Date(NOW - msAgo).toISOString();

  it("labels crypto live and stocks daily", () => {
    expect(mapQuote({ status: "ok", price: 68563.2, changePct: -1.2, asOf: t(60_000), freshnessLabel: "Live from Kraken (24/7)" }, "crypto", NOW)).toMatchObject({ freshness: "live", freshnessLabel: "Live from Kraken (24/7)" });
    const s = mapQuote({ status: "ok", price: 348.49, changePct: 1.78, asOf: t(2 * 86_400_000), freshnessLabel: "Daily close (2026-11-10), updated next morning" }, "stock", NOW);
    expect(s.freshness).toBe("daily");
    expect(s.freshnessLabel).toMatch(/updated next morning/);
  });

  it("re-checks staleness on this side and rewrites a stale 'Live' label", () => {
    const q = mapQuote({ status: "ok", price: 100, changePct: 1, asOf: t(40 * 60_000), freshnessLabel: "Live from Kraken (24/7)" }, "crypto", NOW);
    expect(q.freshness).toBe("stale");
    expect(q.freshnessLabel).toMatch(/Stale/);
    expect(mapQuote({ status: "ok", price: 1, asOf: t(9 * 86_400_000) }, "stock", NOW).freshness).toBe("stale");
  });

  it("keeps missing numbers missing instead of zero-filling", () => {
    for (const raw of [null, {}, { status: "missing", price: null }, { status: "ok", price: 0, changePct: 0, asOf: t(0) }, { status: "ok", price: -3, asOf: t(0) }]) {
      const q = mapQuote(raw, "crypto", NOW);
      expect(q.freshness).toBe("missing");
      expect(q.price).toBeNull();
      expect(q.changePct).toBeNull();
    }
    expect(formatPrice(null)).toBe("—");
    expect(changeWindowText({ changeWindow: "24h" })).toBe("over 24h");
    expect(changeWindowText({ changeWindow: "since the 2026-11-06 close" })).toBe("since the 2026-11-06 close");
    expect(formatChange(null).text).toBe("—");
  });
});

describe("catalog from the real ATLAS route (box capture)", () => {
  const cat = readCatalog(box.list, NOW);

  it("parses every asset with one source each", () => {
    expect(cat).not.toBeNull();
    expect(cat!.assets.length).toBeGreaterThan(10);
    const btc = cat!.assets.find((a) => a.symbol === "BTC-USD")!;
    expect(btc).toMatchObject({ klass: "crypto", badge: "Live", sourceLabel: "Kraken spot" });
    const aapl = cat!.assets.find((a) => a.symbol === "AAPL")!;
    expect(aapl).toMatchObject({ klass: "stock", badge: "Daily" });
    expect(cat!.assets.every((a) => a.light.colour === "grey")).toBe(true);
    expect(cat!.stockCitation).toMatch(/IEX/);
  });

  it("filters by search text and class", () => {
    const all = cat!.assets;
    expect(filterAssets(all, "btc").map((a) => a.symbol)).toEqual(["BTC-USD"]);
    expect(filterAssets(all, "apple").map((a) => a.symbol)).toEqual(["AAPL"]);
    expect(filterAssets(all, "", "crypto").every((a) => a.klass === "crypto")).toBe(true);
    expect(filterAssets(all, "", "stock").every((a) => a.klass === "stock")).toBe(true);
    expect(filterAssets(all, "zzzz")).toEqual([]);
  });

  it("reads a detail with a sparkline", () => {
    const d = readDetail(box.details["BTC-USD"], NOW)!;
    expect(d.spark.points.length).toBeGreaterThan(10);
    expect(sparkPath(d.spark.points, 312, 64)).toMatch(/^M[\d.]+ [\d.]+ L/);
    expect(readDetail(box.details["AAPL"], NOW)!.citation).toMatch(/IEX/);
    expect(sparkPath([], 10, 10)).toBe("");
  });

  it("refuses wrong schemas, non-paper payloads and junk rows", () => {
    expect(readCatalog({ schema: "other", paperOnly: true, assets: [] })).toBeNull();
    expect(readCatalog({ schema: ASSETS_SCHEMA, paperOnly: false, assets: [] })).toBeNull();
    const c = readCatalog({ schema: ASSETS_SCHEMA, paperOnly: true, assets: [{ symbol: "<img>", class: "crypto" }, { symbol: "ETH-USD", class: "forex" }, { symbol: "ETH-USD", class: "crypto", name: "Short squeeze coin" }] });
    expect(c!.assets.map((a) => [a.symbol, a.name])).toEqual([["ETH-USD", "ETH-USD"]]);
  });

  it("builds an education-only question for the Explain tab", () => {
    const q = explainAssetQuestion(cat!.assets[0]!);
    expect(q).toMatch(/Do not recommend a trade/);
    expect(q).toMatch(/grey/);
    expect(q.replace("Do not recommend a trade", "")).not.toMatch(TRADE);
  });
});

describe("connection", () => {
  const ok = (body: unknown): Fetcher => async () => new Response(JSON.stringify(body), { status: 200 });

  it("names the local ATLAS connection in the header", () => {
    expect(connectionCopy("local").label).toBe("ATLAS local");
  });

  it("never lets the hosted web app call localhost", () => {
    expect(canReachLocalAtlas({ protocol: "https:", hostname: "atlas-explain.web.app" }, false)).toBe(false);
    expect(canReachLocalAtlas({ protocol: "http:", hostname: "localhost" }, false)).toBe(true);
    expect(canReachLocalAtlas({ protocol: "chrome-extension:", hostname: "abc" }, true)).toBe(true);
  });

  it("maps an unreachable ATLAS to the grey connect state", async () => {
    const down: Fetcher = async () => { throw new TypeError("Failed to fetch"); };
    expect(await loadCatalog(down)).toMatchObject({ kind: "not_connected" });
    expect(await loadCatalog(async () => new Response("{}", { status: 404 }))).toMatchObject({ kind: "error" });
    expect(await loadCatalog(ok({ schema: "nope" }))).toMatchObject({ kind: "error" });
  });

  it("reads a live catalog and drops payloads with private fields", async () => {
    const seen: { url: string; credentials: string }[] = [];
    const spy: Fetcher = async (url, init) => {
      seen.push({ url, credentials: init.credentials });
      return new Response(JSON.stringify(box.list), { status: 200 });
    };
    expect((await loadCatalog(spy, NOW)).kind).toBe("ready");
    expect(seen[0]).toEqual({ url: "http://localhost:3000/api/mcp/public", credentials: "omit" });
    expect(seen.some((s) => s.url === "http://localhost:3000/api/explain/assets" && s.credentials === "omit")).toBe(true);
    expect(carriesPrivateFields({ assets: [{ quote: { balance: 1 } }] })).toBe(true);
    expect(await loadCatalog(ok({ ...(box.list as object), account: { id: 1 } }))).toMatchObject({ kind: "error" });
    expect(await loadDetail("BTC-USD", ok(box.details["BTC-USD"]), NOW)).not.toBeNull();
    expect(await loadDetail("../etc", ok({}))).toBeNull();
  });

  it("polls crypto about every 15 s, stocks every 15 min, and pauses when hidden", () => {
    expect(nextPollMs([{ klass: "crypto" }, { klass: "stock" }], true)).toBe(POLL_CRYPTO_MS);
    expect(nextPollMs([{ klass: "stock" }], true)).toBe(POLL_STOCK_MS);
    expect(nextPollMs([{ klass: "crypto" }], false)).toBeNull();
    expect(POLL_CRYPTO_MS).toBeGreaterThanOrEqual(10_000);
    expect(POLL_CRYPTO_MS).toBeLessThanOrEqual(15_000);
  });
});


import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import type { Fetcher } from "../src/core/assets";
import { capturedCatalog, capturedChart, resetCapturedCache } from "../src/core/captured-prices";
import { CRYPTO_DATA_URL, DATA_SITE_URL, MCP_ORIGIN } from "../src/core/links";
import { loadLiveCatalog, createPriceCache } from "../src/core/price-provider";
import { captureCrypto, captureMarket, mergeCloses, WORKER_MARKET_PARTS, type CaptureEnv } from "../src/data/capture";
import { CRYPTO_COINS, CRYPTO_SCHEMA, type CryptoFile } from "../src/data/crypto";
import { MARKET_SCHEMA, type MarketFile } from "../src/data/market-sources";
import worker from "../src/mcp/worker";
import { CRONS, cronDue, REFRESH_AFTER_MS, ownDataFetch, runCapture, serveData, setPauseForTests, type WorkerEnv } from "../src/mcp/live-data";

const NOW = Date.parse("2026-11-16T12:00:00Z");
const sec = (iso: string) => Date.parse(iso) / 1000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const file = (asOf: string, extra: Partial<CryptoFile> = {}): CryptoFile => ({
  schema: CRYPTO_SCHEMA,
  generatedAt: asOf,
  prices: { source: "kraken", asOf, coins: [{ symbol: "BTC", name: "Bitcoin", priceUsd: 64519.5, changePct: -1.22, changeWindow: "since 00:00 UTC" }] },
  history: { source: "kraken", asOf, interval: "1h", series: { BTC: [[sec("2026-11-15T12:00:00Z"), 65000], [sec("2026-11-16T11:00:00Z"), 64500]] } },
  ...extra,
});

/** A Workers KV stand-in, with each value's metadata (the capture time). */
function kv(seed: Record<string, string> = {}, meta: Record<string, unknown> = {}): WorkerEnv["DATA"] & { data: Record<string, string>; meta: Record<string, unknown>; writes: number } {
  const store = {
    data: { ...seed } as Record<string, string>,
    meta: { ...meta } as Record<string, unknown>,
    writes: 0,
    get: async (k: string) => store.data[k] ?? null,
    getWithMetadata: async <M,>(k: string) => ({ value: store.data[k] ?? null, metadata: (store.meta[k] ?? null) as M | null }),
    put: async (k: string, v: string, o?: { metadata?: unknown }) => {
      store.writes += 1;
      store.data[k] = v;
      store.meta[k] = o?.metadata ?? null;
    },
  };
  return store;
}
/** Collects background work, like the Workers runtime's ctx.waitUntil. */
const waits = () => {
  const list: Promise<unknown>[] = [];
  return { list, waitUntil: (p: Promise<unknown>) => void list.push(p) };
};

beforeEach(() => {
  resetCapturedCache();
  setPauseForTests(async () => undefined);
});

describe("one address for live data", () => {
  it("serves the data from the connector's own Worker, so the app and the connector read the same file", () => {
    expect(DATA_SITE_URL).toBe(MCP_ORIGIN);
    expect(readFileSync("src/core/captured-prices.ts", "utf8")).toContain("CRYPTO_DATA_URL");
    expect(readFileSync("src/mcp/server.ts", "utf8")).toContain("CRYPTO_DATA_URL");
    // Nothing still points at the retired Firebase data site, and GitHub runs no data job.
    for (const f of ["src/core/links.ts", "firebase.json", "src/mcp/live-data.ts"]) expect(readFileSync(f, "utf8"), f).not.toContain("atlas-explain-data.web.app");
    expect(() => readFileSync(".github/workflows/market-data.yml")).toThrow();
    expect(readFileSync(".github/workflows/billing-sync.yml", "utf8")).not.toMatch(/^\s*schedule:/m);
  });

  it("runs one cron per part, and wrangler.toml schedules exactly those", () => {
    const toml = readFileSync("wrangler.toml", "utf8");
    const crons = JSON.parse(/^crons = (\[.*\])$/m.exec(toml)![1]!) as string[];
    expect(crons.sort()).toEqual(Object.values(CRONS).sort());
    expect(toml).toMatch(/binding = "DATA"/);
    expect(WORKER_MARKET_PARTS).not.toContain("sec_edgar");
  });
});

describe("the app reads the captured prices first", () => {
  it("uses a fresh captured file and calls no provider", async () => {
    const seen: string[] = [];
    const fetcher: Fetcher = async (url) => {
      seen.push(String(url));
      return String(url) === CRYPTO_DATA_URL ? json(file("2026-11-16T11:55:00Z")) : json({}, 500);
    };
    const state = await loadLiveCatalog({ provider: "coingecko" }, fetcher, NOW, 8000, createPriceCache(), null);
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.catalog.source).toBe("kraken");
    expect(state.catalog.assets[0]?.quote.price).toBe(64519.5);
    expect(state.catalog.assets[0]?.quote.changeWindow).toBe("since 00:00 UTC");
    expect(state.catalog.assets[0]?.badge).toBe("Live");
    expect(seen).toEqual([CRYPTO_DATA_URL]);
  });

  it("falls back to the provider when the captured file is too old, and says which one answered", async () => {
    const fetcher: Fetcher = async (url) =>
      String(url) === CRYPTO_DATA_URL
        ? json(file("2026-11-16T10:00:00Z"))
        : json([{ id: "bitcoin", symbol: "btc", name: "Bitcoin", current_price: 64448, price_change_percentage_24h: -1.48, last_updated: "2026-11-16T11:59:00.000Z" }]);
    const state = await loadLiveCatalog({ provider: "coingecko" }, fetcher, NOW, 8000, createPriceCache(), null);
    expect(state.kind === "ready" && state.catalog.source).toBe("coingecko");
  });

  it("never calls stale captured prices live, and draws every chart range from the hourly closes", () => {
    expect(capturedCatalog(file("2026-11-16T11:30:00Z"), NOW)).toBeNull();
    expect(capturedChart(file("2026-11-16T11:55:00Z"), "BTC", 1, NOW)).toEqual([
      { t: "2026-11-15T12:00:00.000Z", c: 65000 },
      { t: "2026-11-16T11:00:00.000Z", c: 64500 },
    ]);
    expect(capturedChart(file("2026-11-16T11:55:00Z"), "ETH", 30, NOW)).toEqual([]);
  });
});

describe("capture", () => {
  const env = (answers: (url: string) => unknown): CaptureEnv & { urls: string[] } => {
    const urls: string[] = [];
    return {
      urls,
      get: async (url) => {
        urls.push(url);
        const body = answers(url);
        if (body instanceof Error) throw body;
        return JSON.stringify(body);
      },
      sleep: async () => undefined,
      now: NOW,
      log: () => undefined,
    };
  };

  it("joins hourly closes by time, newest values winning, and keeps 30 days", () => {
    const old: [number, number][] = [[sec("2026-10-01T00:00:00Z"), 1], [sec("2026-11-16T10:00:00Z"), 10], [sec("2026-11-16T11:00:00Z"), 11]];
    expect(mergeCloses(old, [[sec("2026-11-16T11:00:00Z"), 12], [sec("2026-11-16T12:00:00Z"), 13]], NOW)).toEqual([
      [sec("2026-11-16T10:00:00Z"), 10],
      [sec("2026-11-16T11:00:00Z"), 12],
      [sec("2026-11-16T12:00:00Z"), 13],
    ]);
  });

  it("asks Kraken only for the bars since last time when it has a recent history", async () => {
    const prev = file("2026-11-16T11:50:00Z");
    const e = env((url) => {
      if (url.includes("/Ticker")) return { error: [], result: Object.fromEntries(CRYPTO_COINS.map((c) => [c.krakenKeys[0], { c: ["100.0", "1"], o: "99.0" }])) };
      if (url.includes("/OHLC")) return { error: [], result: { X: [[sec("2026-11-16T12:00:00Z"), "0", "0", "0", "64600.0"]], last: 0 } };
      return new Error("unexpected");
    });
    const out = await captureCrypto(e, prev);
    expect(out?.prices.source).toBe("kraken");
    const btc = e.urls.find((u) => u.includes("pair=XBTUSD&interval=60"))!;
    expect(btc).toContain(`&since=${sec("2026-11-16T11:00:00Z") - 3600}`);
    // Coins without a previous history are fetched in full.
    expect(e.urls.find((u) => u.includes("pair=ETHUSD&interval=60"))).not.toContain("since=");
    expect(out?.history.series.BTC?.at(-1)).toEqual([sec("2026-11-16T12:00:00Z"), 64600]);
    expect(out?.history.series.BTC).toHaveLength(3);
  });

  it("keeps every part it doesn't run (the Worker never touches the SEC filings)", async () => {
    const prev: MarketFile = {
      schema: MARKET_SCHEMA,
      generatedAt: "2026-11-15T00:00:00Z",
      sources: { sec_edgar: { ok: true, count: 0, note: "updated", updatedAt: "2026-11-15T00:00:00Z" } },
      assets: [],
    };
    const e = env(() => new Error("offline"));
    const out = await captureMarket(e, prev, ["ecb"]);
    expect(e.urls.every((u) => u.includes("ecb.europa.eu"))).toBe(true);
    expect(out).toBeNull(); // nothing valid at all: nothing is published
  });
});

describe("the Worker serves and stores the data", () => {
  it("serves a stored file with CORS, and says plainly when nothing has been captured yet", async () => {
    const ctx = waits();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => json({}, 503)) as typeof fetch;
    try {
      const DATA = kv({ "data/v1/crypto.json": JSON.stringify(file("2026-11-16T11:55:00Z")) });
      const ok = await worker.fetch(new Request(`${MCP_ORIGIN}/data/v1/crypto.json`), { DATA }, ctx);
      expect(ok.status).toBe(200);
      expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(((await ok.json()) as CryptoFile).prices.coins[0]?.priceUsd).toBe(64519.5);
      const missing = await worker.fetch(new Request(`${MCP_ORIGIN}/data/v1/news.json`), { DATA }, ctx);
      expect(missing.status).toBe(503);
      expect((await worker.fetch(new Request(`${MCP_ORIGIN}/data/v1/secrets.json`), { DATA }, ctx)).status).toBe(404);
      await Promise.all(ctx.list);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("gives the connector the stored file straight from KV, and refuses any other address", async () => {
    const DATA = kv({ "data/v1/market.json": '{"schema":"x"}' });
    const read = ownDataFetch({ DATA });
    expect(await (await read(`${MCP_ORIGIN}/data/v1/market.json`)).text()).toBe('{"schema":"x"}');
    await expect(read("https://api.kraken.com/0/public/Time")).rejects.toThrow(/not ATLAS Explain's data site/);
  });

  it("refreshes a stale file in the background on a visit, once, and leaves a fresh one alone", async () => {
    const key = "data/v1/crypto.json";
    const body = JSON.stringify(file("2026-11-16T11:55:00Z"));
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => json({}, 503)) as typeof fetch;
    try {
      // Captured 1 minute ago: served, nothing started.
      const fresh = kv({ [key]: body }, { [key]: { capturedAt: new Date(NOW - 60_000).toISOString() } });
      const ctxA = waits();
      const res = await serveData(new Request(`${MCP_ORIGIN}/data/v1/crypto.json`), { DATA: fresh }, "crypto.json", ctxA, NOW);
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=30");
      expect(ctxA.list).toHaveLength(0);
      // Captured 5 minutes ago: the stored copy is served at once, and one capture starts for a burst of visits.
      const stale = kv({ [key]: body }, { [key]: { capturedAt: new Date(NOW - 5 * 60_000).toISOString() } });
      const ctxB = waits();
      await serveData(new Request(`${MCP_ORIGIN}/data/v1/crypto.json`), { DATA: stale }, "crypto.json", ctxB, NOW);
      await serveData(new Request(`${MCP_ORIGIN}/data/v1/crypto.json`), { DATA: stale }, "crypto.json", ctxB, NOW);
      expect(ctxB.list).toHaveLength(1);
      await Promise.all(ctxB.list);
      expect(REFRESH_AFTER_MS["crypto.json"]).toBe(3 * 60_000);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("stays inside the free plan's 1,000 KV writes a day, even with constant visits", () => {
    const perDay = Object.values(REFRESH_AFTER_MS).reduce((sum, gap) => sum + 86_400_000 / gap, 0);
    expect(perDay).toBeLessThanOrEqual(700);
  });

  it("skips a cron part that was just refreshed", async () => {
    const key = "data/v1/crypto.json";
    // Crypto goes by the age of its history, which only the cron updates.
    const DATA = kv({ [key]: JSON.stringify(file(new Date(NOW - 60_000).toISOString())) }, { [key]: { capturedAt: new Date(NOW - 60_000).toISOString() } });
    await runCapture(CRONS.crypto, { DATA }, NOW, async () => undefined);
    expect(DATA.writes).toBe(0);
    const market = "data/v1/market.json";
    const M = kv({ [market]: "{}" }, { [market]: { capturedAt: new Date(NOW - 60_000).toISOString() } });
    await runCapture(CRONS.market, { DATA: M }, NOW, async () => undefined);
    expect(M.writes).toBe(0);
  });

  it("a cron run still refreshes a part its own last run captured a few seconds into the hour (no skipped runs)", () => {
    // economy.json captured at 12:17:11 by one run; the next run fires at 18:17:00, 11 seconds short of 6 hours.
    const age = Date.parse("2026-11-18T18:17:00Z") - Date.parse("2026-11-18T12:17:11Z");
    expect(age).toBeLessThan(REFRESH_AFTER_MS["economy.json"]);
    expect(cronDue(age, "economy.json")).toBe(true);
    // A part a visit refreshed a moment ago is still skipped.
    expect(cronDue(60_000, "economy.json")).toBe(false);
    expect(cronDue(60_000, "market.json")).toBe(false);
    // The margin is small next to each gap: at most a tenth of it, and never more than 10 minutes.
    for (const file of Object.keys(REFRESH_AFTER_MS) as (keyof typeof REFRESH_AFTER_MS)[]) {
      const gap = REFRESH_AFTER_MS[file];
      expect(cronDue(gap - Math.min(600_000, gap / 10) - 1, file)).toBe(false);
    }
  });

  it("the economy's cron also refreshes world.json once a day, from the World Bank only", async () => {
    const urls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("data360api.worldbank.org")) return json({ value: [{ REF_AREA: "USA", TIME_PERIOD: "2025", OBS_VALUE: "2.1", OBS_STATUS: "A" }] });
      return json({}, 503);
    }) as typeof fetch;
    try {
      const fresh = "data/v1/economy.json";
      // The economy itself was just refreshed, so only the world file (missing) is captured.
      const DATA = kv({ [fresh]: "{}" }, { [fresh]: { capturedAt: new Date(NOW - 60_000).toISOString() } });
      await runCapture(CRONS.economy, { DATA }, NOW, async () => undefined);
      expect(urls.length).toBe(4);
      expect(urls.every((u) => u.startsWith("https://data360api.worldbank.org/"))).toBe(true);
      expect(JSON.parse(DATA.data["data/v1/world.json"]!).schema).toBe("atlas-explain-world-v1");
      // A day later is the next time; an hour later nothing is asked.
      urls.length = 0;
      await runCapture(CRONS.economy, { DATA }, NOW + 3_600_000, async () => undefined);
      expect(urls.length).toBe(0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("a visit refreshes crypto prices only, inside its ~30 seconds; the cron still brings the history up to date", async () => {
    const key = "data/v1/crypto.json";
    const old = file("2026-11-16T11:00:00Z");
    const urls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("/Ticker")) return json({ error: [], result: Object.fromEntries(CRYPTO_COINS.map((c) => [c.krakenKeys[0], { c: ["100.0", "1"], o: "99.0" }])) });
      if (url.includes("/OHLC")) return json({ error: [], result: { X: [[sec("2026-11-16T12:00:00Z"), "0", "0", "0", "64600.0"]], last: 0 } });
      return json({}, 503);
    }) as typeof fetch;
    try {
      // A visit: one Ticker request, history untouched.
      const DATA = kv({ [key]: JSON.stringify(old) }, { [key]: { capturedAt: "2026-11-16T11:00:00Z" } });
      const ctx = waits();
      await serveData(new Request(`${MCP_ORIGIN}/data/v1/crypto.json`), { DATA }, "crypto.json", ctx, NOW);
      await Promise.all(ctx.list);
      expect(urls.some((u) => u.includes("/Ticker"))).toBe(true);
      expect(urls.some((u) => u.includes("/OHLC"))).toBe(false);
      const visited = JSON.parse(DATA.data[key]!) as CryptoFile;
      expect(visited.prices.coins[0]?.priceUsd).toBe(100);
      expect(visited.history).toEqual(old.history);
      // The cron right after: prices were saved a moment ago, but the history is an hour old, so it runs.
      urls.length = 0;
      await runCapture(CRONS.crypto, { DATA }, NOW, async () => undefined);
      expect(urls.some((u) => u.includes("/OHLC"))).toBe(true);
      expect((JSON.parse(DATA.data[key]!) as CryptoFile).history.asOf).toBe(new Date(NOW).toISOString());
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("writes only the part its cron is for", async () => {
    const DATA = kv();
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => json({}, 503)) as typeof fetch;
    try {
      const noWait = async () => undefined;
      await runCapture("not a cron", { DATA }, NOW, noWait);
      expect(Object.keys(DATA.data)).toEqual([]);
      await runCapture(CRONS.news, { DATA }, NOW, noWait);
      expect(Object.keys(DATA.data)).toEqual(["data/v1/news.json"]);
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("the data index for people and tools", () => {
  it("lists every published file with its address, schema, sources, terms and capture time", async () => {
    const key = "data/v1/crypto.json";
    const DATA = kv({ [key]: "{}" }, { [key]: { capturedAt: "2026-11-16T12:00:00.000Z" } });
    const res = await worker.fetch(new Request(`${MCP_ORIGIN}/data/v1/`), { DATA }, waits());
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const index = (await res.json()) as { schema: string; use: string; files: { file: string; url: string; schema: string; capturedAt: string | null; sources: { licence: string }[] }[] };
    expect(index.schema).toBe("atlas-explain-data-index-v1");
    expect(index.use).toContain("Not for transactions or trading decisions");
    expect(index.files.map((f) => f.file)).toEqual(["market.json", "crypto.json", "news.json", "economy.json", "world.json", "docs.json"]);
    const crypto = index.files.find((f) => f.file === "crypto.json")!;
    expect(crypto.url).toBe(`${MCP_ORIGIN}/data/v1/crypto.json`);
    expect(crypto.capturedAt).toBe("2026-11-16T12:00:00.000Z");
    // Market data whose terms are under legal review says so.
    expect(crypto.sources.every((s) => s.licence === "review")).toBe(true);
    expect(index.files.find((f) => f.file === "economy.json")!.capturedAt).toBeNull();
    expect((await worker.fetch(new Request(`${MCP_ORIGIN}/data/v1/index.json`), { DATA }, waits())).status).toBe(200);
  });
});

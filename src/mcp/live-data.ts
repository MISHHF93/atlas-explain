/**
 * Everything behind the Worker entry (src/mcp/worker.ts) for ATLAS Explain's live side (free
 * plan: 100,000 requests a day, no card; over the limit requests fail, nothing is charged).
 * One Worker, three jobs:
 *   - /mcp: the hosted MCP connector (src/mcp/http.ts, src/mcp/server.ts);
 *   - /data/v1/{market,news,crypto}.json: the live data the web app and the connector both read;
 *   - cron: captures that data on a schedule (src/data/capture.ts) into Workers KV.
 * Deployed with `npm run deploy:mcp` (wrangler.toml). See docs/MCP.md.
 */
import { handleHttp } from "./http";
import { DATA_SITE_URL } from "../core/links";
import type { Fetcher } from "./server";
import { CAPTURE_UA, WORKER_MARKET_PARTS, captureCrypto, captureMarket, captureNews, type CaptureEnv } from "../data/capture";
import { readCryptoFile } from "../data/crypto";
import { MARKET_SCHEMA, type MarketFile } from "../data/market-sources";
import { readNewsFile } from "../core/news";

/** The parts of Workers KV this Worker uses (no @cloudflare/workers-types dependency). */
export interface DataStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

export interface WorkerEnv {
  /** Workers KV namespace holding the three published files (wrangler.toml binding "DATA"). */
  DATA: DataStore;
  /** Optional Worker secret: a free eia.gov key. Without it energy prices are skipped. */
  EIA_API_KEY?: string;
}


/** The only place the data comes from: this Worker's own /data/v1 address. */
export const DATA_ORIGIN = DATA_SITE_URL;
export const DATA_FILES = ["market.json", "news.json", "crypto.json"] as const;
export type DataFile = (typeof DATA_FILES)[number];
const KEY = (file: DataFile) => `data/v1/${file}`;
const fileOf = (pathname: string): DataFile | null => {
  const name = pathname.replace(/^\/data\/v1\//, "");
  return pathname.startsWith("/data/v1/") && (DATA_FILES as readonly string[]).includes(name) ? (name as DataFile) : null;
};

/**
 * How the connector reads data: straight from KV for this Worker's own /data/v1 files, so it never
 * calls a third-party API itself. Any other address is refused.
 */
export function ownDataFetch(env?: WorkerEnv): Fetcher {
  return async (url) => {
    const u = new URL(url);
    const file = u.origin === DATA_ORIGIN ? fileOf(u.pathname) : null;
    if (!file) throw new Error(`Refused: ${u.origin}${u.pathname} is not ATLAS Explain's data site.`);
    const body = env ? await env.DATA.get(KEY(file)) : null;
    return body == null ? new Response("Not captured yet", { status: 404 }) : new Response(body, { headers: { "Content-Type": "application/json" } });
  };
}

const DATA_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
  // Captured hourly at most: browsers and Cloudflare's edge keep a copy for 5 minutes.
  "Cache-Control": "public, max-age=300",
  "X-Content-Type-Options": "nosniff",
};

/** GET /data/v1/<file>: the stored file, cached at the edge so most reads never touch KV. */
export async function serveData(request: Request, env: WorkerEnv, file: DataFile): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" } });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const cacheKey = new Request(new URL(request.url).origin + new URL(request.url).pathname);
  const hit = cache ? await cache.match(cacheKey) : undefined;
  if (hit) return request.method === "HEAD" ? new Response(null, hit) : hit;
  const body = await env.DATA.get(KEY(file));
  if (body == null) return new Response(JSON.stringify({ error: "Not captured yet. The hourly capture fills this in." }), { status: 503, headers: { ...DATA_HEADERS, "Cache-Control": "no-store" } });
  // Crypto is captured every 10 minutes, so its copy is kept for 2 minutes rather than 5.
  const headers = file === "crypto.json" ? { ...DATA_HEADERS, "Cache-Control": "public, max-age=120" } : DATA_HEADERS;
  const res = new Response(body, { headers });
  if (cache) await cache.put(cacheKey, res.clone());
  return request.method === "HEAD" ? new Response(null, { headers }) : res;
}

/**
 * Each cron runs one part, so every run stays inside the free plan's CPU and subrequest limits.
 * Crypto every 10 minutes (the app calls a price stale after 20); headlines every 3 hours;
 * official figures every 6 hours. Must match [triggers] in wrangler.toml.
 */
export const CRONS = {
  crypto: "*/10 * * * *",
  news: "37 */3 * * *",
  market: "47 */6 * * *",
} as const;

function captureEnv(env: WorkerEnv, now: number): CaptureEnv {
  return {
    get: async (url, userAgent = CAPTURE_UA) => {
      // Every source gets 20 seconds, so one slow source can't hold up a scheduled run.
      const res = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "*/*" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
      return res.text();
    },
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now,
    log: (line) => console.log(line),
    eiaKey: env.EIA_API_KEY,
  };
}

async function stored(env: WorkerEnv, file: DataFile): Promise<unknown> {
  const body = await env.DATA.get(KEY(file));
  try {
    return body == null ? null : JSON.parse(body);
  } catch {
    return null;
  }
}

/** Runs the part a cron belongs to and stores the result. Each part keeps its last good values. */
export async function runCapture(cron: string, env: WorkerEnv, now = Date.now(), sleep?: (ms: number) => Promise<void>): Promise<void> {
  const cap = captureEnv(env, now);
  if (sleep) cap.sleep = sleep;
  if (cron === CRONS.crypto) {
    const file = await captureCrypto(cap, readCryptoFile(await stored(env, "crypto.json")));
    if (file) await env.DATA.put(KEY("crypto.json"), JSON.stringify(file));
  } else if (cron === CRONS.news) {
    const file = await captureNews(cap, readNewsFile(await stored(env, "news.json"), now));
    await env.DATA.put(KEY("news.json"), JSON.stringify(file));
  } else if (cron === CRONS.market) {
    const prev = (await stored(env, "market.json")) as MarketFile | null;
    // SEC filings are kept from the last computer run (npm run data:publish); see src/data/capture.ts.
    const file = await captureMarket(cap, prev?.schema === MARKET_SCHEMA ? prev : null, WORKER_MARKET_PARTS);
    if (file) await env.DATA.put(KEY("market.json"), JSON.stringify(file));
  }
}

/** The Worker's request handler: live data at /data/v1, the connector everywhere else. */
export function handleRequest(request: Request, env: WorkerEnv): Promise<Response> {
  const file = fileOf(new URL(request.url).pathname);
  if (file) return serveData(request, env, file);
  return handleHttp(request, ownDataFetch(env));
}

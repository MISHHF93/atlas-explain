/**
 * Everything behind the Worker entry (src/mcp/worker.ts) for ATLAS Explain's live side (free
 * plan: 100,000 requests a day, no card; over the limit requests fail, nothing is charged).
 * One Worker, three jobs:
 *   - /mcp: the hosted MCP connector (src/mcp/http.ts, src/mcp/server.ts);
 *   - /data/v1/{market,news,crypto,economy}.json: the live data the web app and the connector both read;
 *   - capture: keeps that data fresh (src/data/capture.ts) in Workers KV;
 *   - /billing/v1/stripe: Stripe webhooks that turn Pro on and off (src/mcp/billing-webhook.ts).
 *
 * Fresh on every visit: whenever the app or the connector reads a file, it gets the stored copy
 * at once, and if that copy is older than REFRESH_AFTER_MS the Worker captures a new one in the
 * background. The crons are a backup for quiet hours and skip any part that is already fresh.
 * The minimum gaps keep KV inside its free 1,000 writes a day and the sources inside their limits.
 * Deployed with `npm run deploy:mcp` (wrangler.toml). See docs/MCP.md.
 */
import { ADMIN_OVERVIEW_PATH, ADMIN_STATS_PATH, handleAdminOverview, handleAdminStats, type OverviewStore } from "./admin";
import { recordEvent, type CallEvent, type StatsNamespace } from "./stats";
import { handleHttp, MCP_PATH } from "./http";
import { API_PREFIX, bearer, creditsEnabled, handlePartnerApi, handlePartnerMcp } from "./partner";
import { DATA_SITE_URL } from "../core/links";
import { SERVER_VERSION, visibleTools, type Fetcher } from "./server";
import { captureWorld, CAPTURE_UA, WORKER_MARKET_PARTS, captureCrypto, captureEconomy, captureMarket, captureNews, type CaptureEnv } from "../data/capture";
import { readEconomyFile } from "../data/economy";
import { readWorldFile } from "../data/world";
import { captureDocs, decisionWindow, DOC_BANKS, docsChanged, readDocsFile } from "../data/docs";
import { STRIPE_WEBHOOK_PATH, handleStripeWebhook } from "./billing-webhook";
import { dataIndex } from "./data-index";
import { readCryptoFile } from "../data/crypto";
import { MARKET_SCHEMA, type MarketFile } from "../data/market-sources";
import { readNewsFile } from "../core/news";

/** The parts of Workers KV this Worker uses (no @cloudflare/workers-types dependency). */
export interface DataStore {
  get(key: string): Promise<string | null>;
  getWithMetadata<M>(key: string): Promise<{ value: string | null; metadata: M | null }>;
  put(key: string, value: string, options?: { metadata?: unknown; expirationTtl?: number }): Promise<void>;
}

export interface WorkerEnv {
  /** Workers KV namespace holding the three published files (wrangler.toml binding "DATA"). */
  DATA: DataStore;
  /** Optional Worker secret: a free eia.gov key. Without it energy prices are skipped. */
  EIA_API_KEY?: string;
  /** Billing secrets (docs/MONETIZATION.md, Go-live step 8). Without them the webhook answers 503. */
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_RESTRICTED_KEY?: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  /** v2 tools switched on, as a comma list (docs/V2_DESIGN.md, feature flags). Empty: none. */
  V2_TOOLS?: string;
  /** "1" counts partner usage in ATLAS credits (docs/USAGE_PRICING.md). Anything else: one call per request. */
  CREDITS_ENABLED?: string;
  /** Durable Object holding connector usage counts (src/mcp/stats.ts). Without it nothing is counted. */
  STATS?: StatsNamespace;
  /** Worker secret: the emails allowed into the admin view (src/mcp/admin.ts). */
  ADMIN_EMAILS?: string;
}

export interface WaitContext {
  waitUntil(promise: Promise<unknown>): void;
}

/** The only place the data comes from: this Worker's own /data/v1 address. */
export const DATA_ORIGIN = DATA_SITE_URL;
export const DATA_FILES = ["market.json", "news.json", "crypto.json", "economy.json", "world.json", "docs.json"] as const;
export type DataFile = (typeof DATA_FILES)[number];
const KEY = (file: DataFile) => `data/v1/${file}`;
const fileOf = (pathname: string): DataFile | null => {
  const name = pathname.replace(/^\/data\/v1\//, "");
  return pathname.startsWith("/data/v1/") && (DATA_FILES as readonly string[]).includes(name) ? (name as DataFile) : null;
};

/**
 * How old a stored file may be before a visit starts a new capture. Also the shortest gap between
 * two captures of a part: at most 480 + 96 + 24 = 600 KV writes a day from visits, plus 144 from
 * the crypto cron (which alone updates the price history), 744 in all, under the free 1,000.
 */
export const REFRESH_AFTER_MS: Record<DataFile, number> = {
  "crypto.json": 3 * 60_000,
  "news.json": 15 * 60_000,
  "market.json": 60 * 60_000,
  // Monthly and daily official figures: four captures a day is plenty (and BLS allows 25 keyless reads).
  "economy.json": 6 * 60 * 60_000,
  // Annual figures from the World Bank: once a day is plenty.
  "world.json": 24 * 60 * 60_000,
  // Statements and speeches (docs/V2_DESIGN.md): with the news; on decision days the 10-minute cron watches too.
  "docs.json": 3 * 60 * 60_000,
};

/** Browsers and the edge may keep a copy this long; short, so a refresh shows up quickly. */
const MAX_AGE_S: Record<DataFile, number> = { "crypto.json": 30, "news.json": 60, "market.json": 120, "economy.json": 600, "world.json": 3600, "docs.json": 300 };

const DATA_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
};

interface FileMeta {
  /** When this copy was captured (ISO). */
  capturedAt: string;
}

/** Captures in flight in this Worker instance, so one burst of visits starts one capture. */
const inFlight = new Map<DataFile, Promise<void>>();

/** The stored copy and its age. A copy stored before capture times were kept counts as old. */
async function read(env: WorkerEnv, file: DataFile, now: number): Promise<{ body: string | null; ageMs: number }> {
  const { value, metadata } = await env.DATA.getWithMetadata<FileMeta>(KEY(file));
  const at = metadata?.capturedAt ? Date.parse(metadata.capturedAt) : NaN;
  return { body: value, ageMs: Number.isFinite(at) ? now - at : Infinity };
}

/** Starts a background capture of `file` when its copy is too old and none is running here. */
function refreshIfStale(file: DataFile, ageMs: number, env: WorkerEnv, ctx: WaitContext | undefined, now: number): void {
  // The economy reads ten official sources, too many for a visit's ~30 seconds: only its cron captures it.
  // world.json is four quick requests, so a visit may refresh it (and the first visit fills it).
  if (!ctx || file === "economy.json" || ageMs < REFRESH_AFTER_MS[file] || inFlight.has(file)) return;
  const run = capture(file, env, now, "visit").finally(() => inFlight.delete(file));
  inFlight.set(file, run);
  ctx.waitUntil(run);
}

/**
 * How the connector reads data: straight from KV for this Worker's own /data/v1 files, so it never
 * calls a third-party API itself, and a stale file is refreshed the same way a visit refreshes it.
 * Any other address is refused.
 */
export function ownDataFetch(env?: WorkerEnv, ctx?: WaitContext): Fetcher {
  return async (url) => {
    const u = new URL(url);
    const file = u.origin === DATA_ORIGIN ? fileOf(u.pathname) : null;
    if (!file) throw new Error(`Refused: ${u.origin}${u.pathname} is not ATLAS Explain's data site.`);
    if (!env) return new Response("Not captured yet", { status: 404 });
    const now = Date.now();
    const { body, ageMs } = await read(env, file, now);
    refreshIfStale(file, ageMs, env, ctx, now);
    return body == null ? new Response("Not captured yet", { status: 404 }) : new Response(body, { headers: { "Content-Type": "application/json" } });
  };
}

/** GET /data/v1/<file>: the stored copy at once; a background capture when it is too old. */
export async function serveData(request: Request, env: WorkerEnv, file: DataFile, ctx?: WaitContext, now = Date.now()): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" } });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
  const { body, ageMs } = await read(env, file, now);
  refreshIfStale(file, ageMs, env, ctx, now);
  if (body == null) return new Response(JSON.stringify({ error: "Not captured yet. A capture has started; try again in a minute." }), { status: 503, headers: { ...DATA_HEADERS, "Cache-Control": "no-store" } });
  const headers = { ...DATA_HEADERS, "Cache-Control": `public, max-age=${MAX_AGE_S[file]}` };
  return new Response(request.method === "HEAD" ? null : body, { headers });
}

/**
 * The crons: a backup that keeps data fresh when nobody visits. Each runs one part, so every run
 * stays inside the free plan's CPU and subrequest limits, and skips a part a visit just refreshed.
 * Must match [triggers] in wrangler.toml.
 */
export const CRONS = {
  crypto: "*/10 * * * *",
  news: "37 */3 * * *",
  market: "47 */6 * * *",
  economy: "17 */6 * * *",
} as const;
const CRON_FILE: Record<string, DataFile> = { [CRONS.crypto]: "crypto.json", [CRONS.news]: "news.json", [CRONS.market]: "market.json", [CRONS.economy]: "economy.json" };

/** The pause between polite source requests. Tests swap it for an instant one. */
let pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export function setPauseForTests(fn: (ms: number) => Promise<void>): void {
  pause = fn;
}

function captureEnv(env: WorkerEnv, now: number): CaptureEnv {
  return {
    get: async (url, userAgent = CAPTURE_UA) => {
      // Every source gets 20 seconds, so one slow source can't hold up a run.
      const res = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "*/*" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
      return res.text();
    },
    sleep: (ms) => pause(ms),
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

async function save(env: WorkerEnv, file: DataFile, data: unknown, now: number): Promise<void> {
  const metadata: FileMeta = { capturedAt: new Date(now).toISOString() };
  await env.DATA.put(KEY(file), JSON.stringify(data), { metadata });
}

/**
 * Captures one part and stores it; each part keeps its last good values. A visit has about 30
 * seconds of background time, so it reads headlines from the official feeds only (GDELT is slow
 * and often refuses; the 3-hourly cron still asks it).
 */
async function capture(file: DataFile, env: WorkerEnv, now: number, why: "visit" | "cron", sleep?: (ms: number) => Promise<void>): Promise<void> {
  const cap = captureEnv(env, now);
  if (sleep) cap.sleep = sleep;
  if (file === "crypto.json") {
    // A visit refreshes prices only: ten coins' history with polite gaps outlasts its ~30 seconds.
    const data = await captureCrypto(cap, readCryptoFile(await stored(env, file)), { history: why === "cron" });
    if (data) await save(env, file, data, now);
  } else if (file === "economy.json") {
    const data = await captureEconomy(cap, readEconomyFile(await stored(env, file)));
    if (data) await save(env, file, data, now);
  } else if (file === "world.json") {
    const data = await captureWorld(cap, readWorldFile(await stored(env, file)));
    if (data) await save(env, file, data, now);
  } else if (file === "docs.json") {
    const prev = readDocsFile(await stored(env, file));
    const data = await captureDocs(cap, prev);
    // Most runs find nothing new; writing only on a change keeps the KV writes for when they matter.
    // Nothing read at all (every feed down) is never stored over, or instead of, a good copy.
    const any = DOC_BANKS.some((b) => data.statements[b].length || data.speeches[b].length);
    if (any && (!prev || docsChanged(prev, data))) await save(env, file, data, now);
  } else if (file === "news.json") {
    const data = await captureNews(cap, readNewsFile(await stored(env, file), now), { gdelt: why === "cron" });
    await save(env, file, data, now);
  } else {
    const prev = (await stored(env, file)) as MarketFile | null;
    // SEC filings are kept from the last computer run (npm run data:publish); see src/data/capture.ts.
    const data = await captureMarket(cap, prev?.schema === MARKET_SCHEMA ? prev : null, WORKER_MARKET_PARTS);
    if (data) await save(env, file, data, now);
  }
}

/**
 * A cron fires on the minute, but a capture is stamped a few seconds into its own run, so a file refreshed
 * by the last run of a cron is a little younger than the cron's interval when the next run comes. Without
 * this margin every other run skipped (economy.json went 12 hours between refreshes). A tenth of the
 * refresh gap, at most 10 minutes; a visit still waits the full gap.
 */
export const cronDue = (ageMs: number, file: DataFile): boolean => ageMs >= REFRESH_AFTER_MS[file] - Math.min(10 * 60_000, REFRESH_AFTER_MS[file] / 10);

/** Runs the part a cron belongs to, unless a visit refreshed it moments ago. */
export async function runCapture(cron: string, env: WorkerEnv, now = Date.now(), sleep?: (ms: number) => Promise<void>): Promise<void> {
  const file = CRON_FILE[cron];
  if (!file) return;
  // The free plan allows few crons, so the economy's cron also refreshes world.json once a day.
  if (file === "economy.json") {
    const world = await read(env, "world.json", now);
    if (cronDue(world.ageMs, "world.json")) await capture("world.json", env, now, "cron", sleep).catch((e: unknown) => console.log(`world: ${String(e)}`));
  }
  // The news cron also reads the banks' statements and speeches.
  if (file === "news.json") {
    const docs = await read(env, "docs.json", now);
    if (cronDue(docs.ageMs, "docs.json")) await capture("docs.json", env, now, "cron", sleep).catch((e: unknown) => console.log(`docs: ${String(e)}`));
  }
  // Decision watch: from a scheduled Fed or Bank of Canada decision to three hours after, every 10-minute run
  // looks for the new statement, so it's in docs.json within one run of being published.
  if (file === "crypto.json") {
    const economy = readEconomyFile(await stored(env, "economy.json"));
    if (economy && decisionWindow(economy, now)) await capture("docs.json", env, now, "cron", sleep).catch((e: unknown) => console.log(`docs watch: ${String(e)}`));
  }
  // News always runs on its cron, because only the cron asks GDELT.
  if (file === "crypto.json") {
    // Visits refresh prices only, so the cron goes by the age of the history, which only it updates.
    const history = readCryptoFile(await stored(env, file))?.history;
    const historyAge = history ? now - Date.parse(history.asOf) : Infinity;
    if (!cronDue(historyAge, file)) return;
  } else if (file !== "news.json") {
    const { ageMs } = await read(env, file, now);
    if (!cronDue(ageMs, file)) return;
  }
  await capture(file, env, now, "cron", sleep);
}

/** GET /data/v1/: what each published file holds, its sources and their terms, and when it was captured. */
export async function serveDataIndex(request: Request, env: WorkerEnv): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" } });
  if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
  const captured: Record<string, string | null> = {};
  for (const file of DATA_FILES) {
    const { metadata } = await env.DATA.getWithMetadata<FileMeta>(KEY(file));
    captured[file] = metadata?.capturedAt ?? null;
  }
  const body = JSON.stringify(dataIndex(new URL(request.url).origin, captured), null, 2);
  return new Response(request.method === "HEAD" ? null : body, { headers: { ...DATA_HEADERS, "Cache-Control": "public, max-age=60" } });
}

/** The Worker's request handler: live data at /data/v1, Stripe webhooks, the connector everywhere else. */
export function handleRequest(request: Request, env: WorkerEnv, ctx?: WaitContext): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path === STRIPE_WEBHOOK_PATH) return handleStripeWebhook(request, env);
  if (path === ADMIN_STATS_PATH) return handleAdminStats(request, env);
  if (path === ADMIN_OVERVIEW_PATH) {
    return handleAdminOverview(request, { ...env, DATA: env.DATA as unknown as OverviewStore }, {
      files: DATA_FILES,
      refreshAfterMs: REFRESH_AFTER_MS,
      // Statements and speeches are saved only when a bank publishes something new (see capture above).
      savedOnChange: ["docs.json"],
      service: { version: SERVER_VERSION, tools: visibleTools().map((t) => t.name), creditsEnabled: creditsEnabled() },
    });
  }
  // Counts each tool call and connection, after the answer, without holding it up.
  const stats = env.STATS;
  const onCall = stats && ctx ? (e: CallEvent) => ctx.waitUntil(recordEvent(stats, e)) : undefined;
  if (path === "/data/v1/" || path === "/data/v1" || path === "/data/v1/index.json") return serveDataIndex(request, env);
  const file = fileOf(path);
  if (file) return serveData(request, env, file, ctx);
  // The partner sandbox (src/mcp/partner.ts): REST under /api/v1, and the connector under a partner key.
  if (path === API_PREFIX || path.startsWith(`${API_PREFIX}/`)) return handlePartnerApi(request, env.DATA, ownDataFetch(env, ctx), ctx);
  if (path === MCP_PATH && bearer(request)?.startsWith("atlx_")) return handlePartnerMcp(request, env.DATA, ctx, (r, guard) => handleHttp(r, guard(ownDataFetch(env, ctx)), onCall));
  return handleHttp(request, ownDataFetch(env, ctx), onCall);
}

/**
 * Capturing ATLAS Explain's live data: the one place that turns public sources into the three
 * published files (data/v1/market.json, news.json, crypto.json). Both runners use it:
 *   - the hourly Cloudflare cron in the connector's Worker (src/mcp/worker.ts), which stores the
 *     files in Workers KV and serves them at MCP_ORIGIN/data/v1/…;
 *   - `npm run data:capture` on a computer (scripts/data/build-data.ts), which also refreshes the
 *     SEC filings, too large for a Worker's free CPU budget, and can upload the result.
 *
 * Every part keeps its last good values when a source fails, with their own times, and nothing is
 * ever filled in. Pure apart from the injected network, so it runs in Node, a Worker and tests.
 */
import { validateAsset, type Asset } from "../core/asset-schema.ts";
import { EXPLAIN_WEB_URL } from "../core/links.ts";
import { NEWS_GROUPS, NEWS_SCHEMA, NEWS_TARGETS, OFFICIAL_FEEDS, OFFICIAL_MAX, OFFICIAL_NEWS_ID, assignNews, gdeltUrl, isRateLimitNotice, parseGdelt, parseRss, type NewsFile, type NewsItem } from "../core/news.ts";
import {
  COINGECKO_PUBLIC_API,
  CRYPTO_COINS,
  CRYPTO_SCHEMA,
  KRAKEN_PUBLIC_API,
  parseCoinGeckoChart,
  parseCoinGeckoMarkets,
  parseKrakenOhlc,
  parseKrakenTicker,
  type CryptoFile,
  type CryptoSource,
} from "./crypto.ts";
import { EIA_SERIES, MARKET_SCHEMA, parseBocBonds, parseBocFx, parseEcbXml, parseEiaSeries, parseTreasuryCsv, type MarketFile } from "./market-sources.ts";
import { SEC_ETFS, SEC_STOCKS, cik10, etfFromSec, readTickerMap, stockFromSec } from "./sec.ts";

export const CAPTURE_UA = `ATLAS Explain data capture (+${EXPLAIN_WEB_URL}/how-its-built)`;

/** What a runner gives the capture: the network, a clock and a log. */
export interface CaptureEnv {
  /** GET a URL as text. Throws on a network error or a non-2xx answer. */
  get: (url: string, userAgent?: string) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  now: number;
  log: (line: string) => void;
  /** Optional free key from eia.gov/opendata; without it EIA is skipped, never faked. */
  eiaKey?: string;
  /** "Name contact@email" for SEC EDGAR's fair-access rule. */
  secUserAgent?: string;
}

/** The parts of the official-figures file, and how often each is worth refreshing. */
export type MarketPart = "us_treasury" | "ecb" | "boc_fx" | "boc_bonds" | "eia" | "sec_edgar";
export const MARKET_PARTS: readonly MarketPart[] = ["us_treasury", "ecb", "boc_fx", "boc_bonds", "eia", "sec_edgar"];
/** Light enough for a Worker's free CPU budget. SEC company files are megabytes each: computer only. */
export const WORKER_MARKET_PARTS: readonly MarketPart[] = ["us_treasury", "ecb", "boc_fx", "boc_bonds", "eia"];
/** SEC filings change quarterly: refreshed about once a day at most. */
const EVERY_HOURS: Partial<Record<MarketPart, number>> = { sec_edgar: 20 };

/** SEC fair access allows 10 requests a second; stay well under it. */
const SEC_GAP_MS = 250;

async function runPart(part: MarketPart, env: CaptureEnv): Promise<Asset[]> {
  const year = new Date(env.now).getUTCFullYear();
  switch (part) {
    case "us_treasury": {
      const url = (y: number) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
      const assets = parseTreasuryCsv(await env.get(url(year)), env.now);
      // In the first days of January the current year's file can be empty.
      return assets.length ? assets : parseTreasuryCsv(await env.get(url(year - 1)), env.now);
    }
    case "ecb":
      return parseEcbXml(await env.get("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml"), env.now);
    case "boc_fx":
      return parseBocFx(await env.get("https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?recent=5"), env.now);
    case "boc_bonds":
      return parseBocBonds(await env.get("https://www.bankofcanada.ca/valet/observations/group/bond_yields_benchmark/json?recent=5"), env.now);
    case "eia": {
      const key = env.eiaKey?.trim();
      if (!key) throw new Error("EIA_API_KEY is not set; skipped");
      const out: Asset[] = [];
      for (const meta of EIA_SERIES) {
        const asset = parseEiaSeries(await env.get(`https://api.eia.gov/v2/seriesid/${meta.seriesId}?api_key=${encodeURIComponent(key)}&length=10`), meta, env.now);
        if (asset) out.push(asset);
      }
      return out;
    }
    case "sec_edgar": {
      const ua = env.secUserAgent?.trim() || CAPTURE_UA;
      const sec = async (url: string) => {
        await env.sleep(SEC_GAP_MS);
        return env.get(url, ua);
      };
      const tickers = readTickerMap(await sec("https://www.sec.gov/files/company_tickers.json"));
      const out: Asset[] = [];
      const one = async (ticker: string, build: (cik: number, submissions: string, facts: string | null) => Asset | null) => {
        const hit = tickers.get(ticker);
        if (!hit) return;
        try {
          const submissions = await sec(`https://data.sec.gov/submissions/CIK${cik10(hit.cik)}.json`);
          const facts = await sec(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10(hit.cik)}.json`).catch(() => null);
          const asset = build(hit.cik, submissions, facts);
          if (asset) out.push(asset);
        } catch (error) {
          env.log(`[sec_edgar] ${ticker}: ${error instanceof Error ? error.message : "failed"}`);
        }
      };
      for (const [ticker, name] of SEC_STOCKS) await one(ticker, (cik, submissions, facts) => stockFromSec({ ticker, name, cik, submissions, facts, now: env.now }));
      for (const etf of SEC_ETFS) await one(etf.ticker, (cik, submissions, facts) => etfFromSec({ etf, cik, submissions, facts, now: env.now }));
      return out;
    }
  }
}

/** Which part produced an asset, so a part that fails or isn't run keeps its last good records. */
export function partOf(a: Asset): string {
  if (a.class === "stock" || a.class === "etf") return "sec_edgar";
  const p = a.quote?.source.providerId;
  if (p === "boc") return a.class === "rate" ? "boc_bonds" : "boc_fx";
  return p ?? "unknown";
}

/**
 * Official figures. Runs `parts` (all of them by default) and keeps every other part's last
 * published records, so a Worker can refresh the light parts and a computer the SEC filings.
 * Returns null only when nothing valid exists at all.
 */
export async function captureMarket(env: CaptureEnv, prev: MarketFile | null, parts: readonly MarketPart[] = MARKET_PARTS): Promise<MarketFile | null> {
  const sources: MarketFile["sources"] = {};
  const assets: Asset[] = [];
  const keep = (part: string) => (prev?.assets ?? []).filter((a) => partOf(a) === part && validateAsset(a, env.now).ok);
  for (const part of MARKET_PARTS) {
    const lastRun = prev?.sources[part];
    const lastAt = lastRun?.ok && lastRun.updatedAt ? Date.parse(lastRun.updatedAt) : NaN;
    const every = EVERY_HOURS[part];
    const fresh = Number.isFinite(lastAt) && every !== undefined && env.now - lastAt < every * 3_600_000;
    if (!parts.includes(part) || fresh) {
      const kept = keep(part);
      assets.push(...kept);
      if (lastRun) sources[part] = { ...lastRun, count: kept.length };
      continue;
    }
    let got: Asset[] = [];
    let note: string;
    try {
      got = await runPart(part, env);
      note = got.length ? "updated" : "no fresh values";
    } catch (error) {
      note = error instanceof Error ? error.message : "failed";
    }
    // Keep only records that pass the same contract the app enforces.
    const valid = got.filter((a) => {
      const v = validateAsset(a, env.now);
      if (!v.ok) env.log(`[${part}] dropped ${a.id}: ${v.errors.join("; ")}`);
      return v.ok;
    });
    if (valid.length) {
      assets.push(...valid);
      sources[part] = { ok: true, count: valid.length, note, updatedAt: new Date(env.now).toISOString() };
    } else {
      const kept = keep(part);
      assets.push(...kept);
      sources[part] = { ok: false, count: kept.length, note: `${note}${kept.length ? "; kept the last published values" : ""}`, ...(lastRun?.updatedAt ? { updatedAt: lastRun.updatedAt } : {}) };
    }
    env.log(`${part}: ${sources[part]!.ok ? "ok" : "not updated"} (${sources[part]!.count}) ${sources[part]!.note}`);
  }
  const ids = new Set<string>();
  const unique = assets.filter((a) => (ids.has(a.id) ? false : (ids.add(a.id), true)));
  if (unique.length === 0) return null;
  return { schema: MARKET_SCHEMA, generatedAt: new Date(env.now).toISOString(), sources, assets: unique };
}

/** GDELT asks for at most one request every 5 seconds. */
export const NEWS_GAP_MS = 6_000;

/** Headlines for each news target. A query that fails keeps that asset's last headlines. */
export async function captureNews(env: CaptureEnv, prev: NewsFile | null, options: { gdelt?: boolean } = {}): Promise<NewsFile> {
  // Official press releases first: keyless RSS feeds that answer reliably, read in parallel, so
  // a slow or refusing GDELT can never cost a run its headlines.
  const feeds = await Promise.all(OFFICIAL_FEEDS.map((feed) => env.get(feed.url).catch(() => "")));
  const official = feeds.flatMap((xml, i) => parseRss(xml, OFFICIAL_FEEDS[i]!.domain, env.now)).sort((a, b) => b.seenAt.localeCompare(a.seenAt));
  const feedsAnswered = feeds.filter((xml) => /<(rss|feed)\b/i.test(xml)).length;

  const all: NewsItem[] = [];
  let answered = 0;
  // GDELT is slow and often refuses; a quick refresh (a visit) skips it and keeps its last stories.
  for (const [i, query] of (options.gdelt === false ? [] : NEWS_GROUPS).entries()) {
    if (i > 0) await env.sleep(NEWS_GAP_MS);
    let body = await env.get(gdeltUrl(query)).catch(() => "");
    if (isRateLimitNotice(body)) {
      await env.sleep(NEWS_GAP_MS * 2);
      body = await env.get(gdeltUrl(query)).catch(() => "");
    }
    const parsed = parseGdelt(body, env.now);
    if (body.trim().startsWith("{")) answered += 1;
    all.push(...parsed);
  }

  const fresh = assignNews([...all, ...official]);
  const items: Record<string, NewsItem[]> = {};
  for (const t of NEWS_TARGETS) {
    // An asset with no fresh match keeps its last headlines.
    const list = fresh[t.assetId] ?? prev?.items[t.assetId] ?? [];
    if (list.length) items[t.assetId] = list;
  }
  // Market-wide: the newest releases across the feeds; the last ones if every feed failed.
  const market = official.length ? official.slice(0, OFFICIAL_MAX) : prev?.items[OFFICIAL_NEWS_ID] ?? [];
  if (market.length) items[OFFICIAL_NEWS_ID] = market;
  env.log(`news: GDELT ${answered}/${NEWS_GROUPS.length} queries answered (${all.length} headlines); official feeds ${feedsAnswered}/${OFFICIAL_FEEDS.length} (${official.length} releases); ${Object.keys(fresh).length} assets matched`);
  return { schema: NEWS_SCHEMA, generatedAt: new Date(env.now).toISOString(), items };
}

/** Kraken allows about one public call a second; CoinGecko's keyless API much less. */
export const KRAKEN_GAP_MS = 1_100;
const COINGECKO_GAP_MS = 6_000;
/** A coin's last history is reused for up to two days if both sources fail for it. */
const HISTORY_REUSE_MS = 2 * 86_400_000;
const HISTORY_DAYS = 30;

/** Joins hourly closes by time (newer values win), oldest first, keeping the last 30 days. */
export function mergeCloses(old: readonly [number, number][], add: readonly [number, number][], nowMs: number): [number, number][] {
  const byTime = new Map<number, number>();
  for (const [t, c] of old) byTime.set(t, c);
  for (const [t, c] of add) byTime.set(t, c);
  const since = nowMs / 1000 - HISTORY_DAYS * 86_400;
  return [...byTime.entries()].filter(([t]) => t >= since).sort((a, b) => a[0] - b[0]);
}

/**
 * Crypto prices and 30 days of hourly closes for the ten coins. Kraken first, CoinGecko as the
 * backup. With last hour's file it asks Kraken only for the bars since then (a few hundred
 * bytes per coin), which keeps an hourly Worker run to a few milliseconds of CPU.
 */
export async function captureCrypto(env: CaptureEnv, prev: CryptoFile | null, options: { history?: boolean } = {}): Promise<CryptoFile | null> {
  const at = new Date(env.now).toISOString();
  const json = async (url: string): Promise<unknown> => JSON.parse(await env.get(url));

  let prices: CryptoFile["prices"] | null = null;
  const kraken = parseKrakenTicker(await json(`${KRAKEN_PUBLIC_API}/Ticker?pair=${CRYPTO_COINS.map((c) => c.krakenPair).join(",")}`).catch(() => null));
  if (kraken.length >= CRYPTO_COINS.length / 2) prices = { source: "kraken", asOf: at, coins: kraken };
  else {
    const ids = CRYPTO_COINS.map((c) => c.coingeckoId).join(",");
    const cg = parseCoinGeckoMarkets(await json(`${COINGECKO_PUBLIC_API}/coins/markets?vs_currency=usd&ids=${ids}&price_change_percentage=24h`).catch(() => null));
    if (cg.length) prices = { source: "coingecko", asOf: at, coins: cg };
  }
  if (!prices && prev) {
    prices = prev.prices;
    env.log(`crypto prices: both sources failed; kept the last ones from ${prev.prices.asOf}`);
  }
  if (!prices) {
    env.log("crypto prices: both sources failed and nothing was published before");
    return null;
  }
  // Prices only (a visit's refresh, which has about 30 seconds): keep the last history as it is.
  // The 10-minute cron brings the history up to date.
  if (options.history === false && prev) {
    env.log(`crypto: ${prices.coins.length} prices (${prices.source}); history kept from ${prev.history.asOf}`);
    return { schema: CRYPTO_SCHEMA, generatedAt: at, prices, history: prev.history };
  }

  const series: Record<string, [number, number][]> = {};
  let usedCoinGecko = false;
  let fetched = 0;
  for (const coin of CRYPTO_COINS) {
    const old = prev?.history.source === "kraken" ? prev.history.series[coin.symbol] ?? [] : [];
    const lastT = old.length ? old[old.length - 1]![0] : 0;
    // Incremental when last hour's bars are recent; a full 30 days otherwise.
    const since = lastT && env.now / 1000 - lastT < 2 * 86_400 ? `&since=${lastT - 3_600}` : "";
    if (fetched++ > 0) await env.sleep(KRAKEN_GAP_MS);
    let rows = parseKrakenOhlc(await json(`${KRAKEN_PUBLIC_API}/OHLC?pair=${coin.krakenPair}&interval=60${since}`).catch(() => null));
    let merged = rows.length ? mergeCloses(since ? old : [], rows, env.now) : [];
    if (merged.length < 2) {
      await env.sleep(COINGECKO_GAP_MS);
      rows = parseCoinGeckoChart(await json(`${COINGECKO_PUBLIC_API}/coins/${coin.coingeckoId}/market_chart?vs_currency=usd&days=${HISTORY_DAYS}`).catch(() => null));
      merged = mergeCloses([], rows, env.now);
      if (merged.length >= 2) usedCoinGecko = true;
    }
    if (merged.length < 2 && prev?.history.series[coin.symbol] && env.now - Date.parse(prev.history.asOf) < HISTORY_REUSE_MS) {
      merged = prev.history.series[coin.symbol]!;
    }
    if (merged.length >= 2) series[coin.symbol] = merged;
  }
  // Any coin read from CoinGecko marks the history as CoinGecko's, so the next run starts afresh from Kraken.
  const source: CryptoSource = usedCoinGecko ? "coingecko" : "kraken";
  env.log(`crypto: ${prices.coins.length} prices (${prices.source}), history for ${Object.keys(series).length} coins (${source})`);
  return { schema: CRYPTO_SCHEMA, generatedAt: at, prices, history: { source, asOf: at, interval: "1h", series } };
}

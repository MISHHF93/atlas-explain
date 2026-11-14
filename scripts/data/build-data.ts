/**
 * Scheduled market-data job (docs/ux/MULTI_ASSET_CATALOG.md §3). Runs in GitHub Actions on Node 24,
 * with no npm packages. Fetches free official sources, normalises them to the Asset schema,
 * validates every record, and writes data-out/data/v1/market.json for the data hosting site.
 *
 *   node scripts/data/build-data.ts            # writes data-out/
 *
 * Env (all optional; a source without its key is skipped, never faked):
 *   EIA_API_KEY      free key from eia.gov/opendata
 *   SEC_USER_AGENT   "Name contact@email" for SEC EDGAR's fair-access rule (kept as a secret so the email is not public)
 *   PREVIOUS_URL     the currently published market.json, reused for any source that fails this run
 *   SKIP_NEWS=1      skip the GDELT headlines step
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { validateAsset, type Asset } from "../../src/core/asset-schema.ts";
import {
  EIA_SERIES,
  MARKET_SCHEMA,
  parseBocBonds,
  parseBocFx,
  parseEcbXml,
  parseEiaSeries,
  parseTreasuryCsv,
  type MarketFile,
} from "../../src/data/market-sources.ts";
import { SEC_ETFS, SEC_STOCKS, cik10, etfFromSec, readTickerMap, stockFromSec } from "../../src/data/sec.ts";
import { NEWS_GROUPS, NEWS_SCHEMA, NEWS_TARGETS, assignNews, gdeltUrl, isRateLimitNotice, parseGdelt, readNewsFile, type NewsFile, type NewsItem } from "../../src/core/news.ts";

const TIMEOUT_MS = 30_000;
const ATTEMPTS = 2;
const UA = "ATLAS Explain market-data job (+https://atlas-explain.web.app/how-its-built)";
const SEC_UA = process.env.SEC_USER_AGENT?.trim() || UA;
/** SEC fair access allows 10 requests a second; stay well under it. */
const SEC_GAP_MS = 250;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const now = Date.now();
const year = new Date(now).getUTCFullYear();

/** GET with a timeout and one retry after a short pause; government sites are sometimes slow. */
async function text(url: string, ua: string = UA): Promise<string> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    try {
      return await textOnce(url, ua);
    } catch (error) {
      lastError = error;
      if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 3_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("request failed");
}

async function textOnce(url: string, ua: string, timeoutMs: number = TIMEOUT_MS): Promise<string> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": ua, Accept: "*/*" }, signal: ctl.signal });
    if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/** everyHours: refresh at most this often, reusing the last published records in between. */
type Job = { id: string; run: () => Promise<Asset[]>; everyHours?: number };

async function secText(url: string): Promise<string> {
  await sleep(SEC_GAP_MS);
  return text(url, SEC_UA);
}

const jobs: Job[] = [
  {
    id: "us_treasury",
    run: async () => {
      const url = (y: number) => `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/${y}/all?type=daily_treasury_yield_curve&field_tdr_date_value=${y}&page&_format=csv`;
      const assets = parseTreasuryCsv(await text(url(year)), now);
      // In the first days of January the current year's file can be empty.
      return assets.length ? assets : parseTreasuryCsv(await text(url(year - 1)), now);
    },
  },
  { id: "ecb", run: async () => parseEcbXml(await text("https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml"), now) },
  { id: "boc_fx", run: async () => parseBocFx(await text("https://www.bankofcanada.ca/valet/observations/group/FX_RATES_DAILY/json?recent=5"), now) },
  { id: "boc_bonds", run: async () => parseBocBonds(await text("https://www.bankofcanada.ca/valet/observations/group/bond_yields_benchmark/json?recent=5"), now) },
  {
    id: "eia",
    run: async () => {
      const key = process.env.EIA_API_KEY?.trim();
      if (!key) throw new Error("EIA_API_KEY is not set; skipped");
      const out: Asset[] = [];
      for (const meta of EIA_SERIES) {
        const body = await text(`https://api.eia.gov/v2/seriesid/${meta.seriesId}?api_key=${encodeURIComponent(key)}&length=10`);
        const asset = parseEiaSeries(body, meta, now);
        if (asset) out.push(asset);
      }
      return out;
    },
  },
  {
    // Filings change slowly and company facts files are large, so this runs about once a day.
    id: "sec_edgar",
    everyHours: 20,
    run: async () => {
      const tickers = readTickerMap(await secText("https://www.sec.gov/files/company_tickers.json"));
      const out: Asset[] = [];
      for (const [ticker, name] of SEC_STOCKS) {
        const hit = tickers.get(ticker);
        if (!hit) continue;
        try {
          const submissions = await secText(`https://data.sec.gov/submissions/CIK${cik10(hit.cik)}.json`);
          const facts = await secText(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10(hit.cik)}.json`).catch(() => null);
          const asset = stockFromSec({ ticker, name, cik: hit.cik, submissions, facts, now });
          if (asset) out.push(asset);
        } catch (error) {
          console.warn(`[sec_edgar] ${ticker}: ${error instanceof Error ? error.message : "failed"}`);
        }
      }
      for (const etf of SEC_ETFS) {
        const hit = tickers.get(etf.ticker);
        if (!hit) continue;
        try {
          const submissions = await secText(`https://data.sec.gov/submissions/CIK${cik10(hit.cik)}.json`);
          const facts = await secText(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik10(hit.cik)}.json`).catch(() => null);
          const asset = etfFromSec({ etf, cik: hit.cik, submissions, facts, now });
          if (asset) out.push(asset);
        } catch (error) {
          console.warn(`[sec_edgar] ${etf.ticker}: ${error instanceof Error ? error.message : "failed"}`);
        }
      }
      return out;
    },
  },
];

async function previous(): Promise<MarketFile | null> {
  const url = process.env.PREVIOUS_URL?.trim();
  if (!url) return null;
  try {
    const body = JSON.parse(await text(url)) as MarketFile;
    return body.schema === MARKET_SCHEMA && Array.isArray(body.assets) ? body : null;
  } catch {
    return null;
  }
}

/** Which job produced an asset, so a failed job can fall back to its last good records. */
function jobOf(a: Asset): string {
  if (a.class === "stock" || a.class === "etf") return "sec_edgar";
  const p = a.quote?.source.providerId;
  if (p === "boc") return a.class === "rate" ? "boc_bonds" : "boc_fx";
  return p ?? "unknown";
}

async function main(): Promise<void> {
  const last = await previous();
  const sources: MarketFile["sources"] = {};
  const assets: Asset[] = [];
  for (const job of jobs) {
    const lastRun = last?.sources[job.id];
    const lastAt = lastRun?.ok && lastRun.updatedAt ? Date.parse(lastRun.updatedAt) : NaN;
    if (job.everyHours && Number.isFinite(lastAt) && now - lastAt < job.everyHours * 3_600_000) {
      const kept = (last?.assets ?? []).filter((a) => jobOf(a) === job.id && validateAsset(a, now).ok);
      if (kept.length) {
        assets.push(...kept);
        sources[job.id] = { ...lastRun!, count: kept.length, note: "up to date (refreshed daily)" };
        console.log(`${job.id}: reused ${kept.length} records from ${lastRun!.updatedAt}`);
        continue;
      }
    }
    let fresh: Asset[] = [];
    let note: string;
    try {
      fresh = await job.run();
      note = fresh.length ? "updated" : "no fresh values";
    } catch (error) {
      note = error instanceof Error ? error.message : "failed";
    }
    // Keep only records that pass the same contract the app enforces.
    const valid = fresh.filter((a) => {
      const v = validateAsset(a, now);
      if (!v.ok) console.warn(`[${job.id}] dropped ${a.id}: ${v.errors.join("; ")}`);
      return v.ok;
    });
    if (valid.length) {
      assets.push(...valid);
      sources[job.id] = { ok: true, count: valid.length, note, updatedAt: new Date(now).toISOString() };
    } else {
      // Reuse last run's records for this source; their own asOf dates show their age.
      const kept = (last?.assets ?? []).filter((a) => jobOf(a) === job.id && validateAsset(a, now).ok);
      assets.push(...kept);
      sources[job.id] = { ok: false, count: kept.length, note: `${note}${kept.length ? "; kept the last published values" : ""}`, ...(lastRun?.updatedAt ? { updatedAt: lastRun.updatedAt } : {}) };
    }
    console.log(`${job.id}: ${sources[job.id]!.ok ? "ok" : "not updated"} (${sources[job.id]!.count}) ${sources[job.id]!.note}`);
  }
  const ids = new Set<string>();
  const unique = assets.filter((a) => (ids.has(a.id) ? false : (ids.add(a.id), true)));
  if (unique.length === 0) throw new Error("No source produced valid data; nothing published.");
  const file: MarketFile = { schema: MARKET_SCHEMA, generatedAt: new Date(now).toISOString(), sources, assets: unique };
  mkdirSync("data-out/data/v1", { recursive: true });
  writeFileSync("data-out/data/v1/market.json", JSON.stringify(file));
  writeFileSync("data-out/index.html", "<!doctype html><title>ATLAS Explain data</title><p>Market data for ATLAS Explain. Sources and licences: https://atlas-explain.web.app/how-its-built</p>\n");
  console.log(`wrote ${unique.length} assets`);
  if (process.env.SKIP_NEWS !== "1") await buildNews();
}

/** GDELT asks for at most one request every 5 seconds. */
const NEWS_GAP_MS = 10_000;
const NEWS_EVERY_MS = 3 * 3_600_000;
/** GDELT can be slow; a stuck query must not hold up the whole run. */
const NEWS_TIMEOUT_MS = 30_000;

/** Headlines for each news target, refreshed every 3 hours; a failed query keeps its last headlines. */
async function buildNews(): Promise<void> {
  const prevUrl = process.env.PREVIOUS_URL?.trim().replace(/market\.json$/, "news.json");
  let prev: NewsFile | null = null;
  if (prevUrl) {
    try {
      prev = readNewsFile(JSON.parse(await text(prevUrl)), now);
    } catch {
      prev = null;
    }
  }
  if (prev && now - Date.parse(prev.generatedAt) < NEWS_EVERY_MS) {
    writeFileSync("data-out/data/v1/news.json", JSON.stringify(prev));
    console.log(`news: reused headlines from ${prev.generatedAt}`);
    return;
  }
  // A few grouped queries (GDELT allows one request every 5 seconds), then headlines are matched to assets by name.
  const all: NewsItem[] = [];
  let answered = 0;
  for (const query of NEWS_GROUPS) {
    await sleep(NEWS_GAP_MS);
    let body = await textOnce(gdeltUrl(query), UA, NEWS_TIMEOUT_MS).catch(() => "");
    if (isRateLimitNotice(body)) {
      await sleep(NEWS_GAP_MS * 2);
      body = await textOnce(gdeltUrl(query), UA, NEWS_TIMEOUT_MS).catch(() => "");
    }
    const parsed = parseGdelt(body, now);
    const status = body.trim().startsWith("{") ? "answered" : isRateLimitNotice(body) ? "rate-limited" : "no answer";
    if (status === "answered") answered += 1;
    console.log(`news query ${NEWS_GROUPS.indexOf(query) + 1}: ${status}, ${parsed.length} headlines`);
    all.push(...parsed);
  }
  const fresh = assignNews(all);
  const items: Record<string, NewsItem[]> = {};
  for (const t of NEWS_TARGETS) {
    // An asset with no fresh match keeps its last headlines while they are still recent.
    const list = fresh[t.assetId] ?? prev?.items[t.assetId] ?? [];
    if (list.length) items[t.assetId] = list;
  }
  const file: NewsFile = { schema: NEWS_SCHEMA, generatedAt: new Date(now).toISOString(), items };
  writeFileSync("data-out/data/v1/news.json", JSON.stringify(file));
  console.log(`news: ${answered}/${NEWS_GROUPS.length} queries answered, ${all.length} headlines, ${Object.keys(fresh).length} assets matched`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

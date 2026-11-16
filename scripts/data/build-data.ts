/**
 * Capture ATLAS Explain's live data on this computer (the same code the hourly Cloudflare cron runs;
 * see src/data/capture.ts). Use it to refresh the SEC filings, which are too large for the Worker's
 * free CPU budget, or to rebuild everything by hand.
 *
 *   npm run data:capture            # writes data-out/data/v1/{market,news,crypto}.json
 *   npm run data:publish            # the same, then uploads the three files to the Worker's KV
 *
 * Every part starts from the currently published files, so anything that fails keeps its last
 * good values with their own times. Nothing is filled in.
 *
 * Env (all optional; a source without its key is skipped, never faked):
 *   EIA_API_KEY      free key from eia.gov/opendata
 *   SEC_USER_AGENT   "Name contact@email" for SEC EDGAR's fair-access rule
 *   SKIP_NEWS=1      skip the GDELT headlines
 *   SKIP_CRYPTO=1    skip the crypto prices
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { CAPTURE_UA, captureCrypto, captureMarket, captureNews, type CaptureEnv } from "../../src/data/capture.ts";
import { readCryptoFile } from "../../src/data/crypto.ts";
import { MARKET_SCHEMA, type MarketFile } from "../../src/data/market-sources.ts";
import { readNewsFile } from "../../src/core/news.ts";
import { CRYPTO_DATA_URL, MARKET_DATA_URL, NEWS_DATA_URL } from "../../src/core/links.ts";

const TIMEOUT_MS = 30_000;
const now = Date.now();
const upload = process.argv.includes("--upload");

async function get(url: string, userAgent: string = CAPTURE_UA): Promise<string> {
  // One retry after a short pause; government sites are sometimes slow.
  for (let attempt = 1; ; attempt += 1) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, { headers: { "User-Agent": userAgent, Accept: "*/*" }, signal: ctl.signal });
      if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
      return await res.text();
    } catch (error) {
      if (attempt >= 2) throw error;
      await new Promise((r) => setTimeout(r, 3_000));
    } finally {
      clearTimeout(timer);
    }
  }
}

/** The currently published file, or null. A byte-order mark is tolerated. */
async function published(url: string): Promise<unknown> {
  try {
    const body = await get(url);
    return JSON.parse(body.charCodeAt(0) === 0xfeff ? body.slice(1) : body);
  } catch {
    return null;
  }
}

const env: CaptureEnv = {
  get,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  now,
  log: (line) => console.log(line),
  eiaKey: process.env.EIA_API_KEY,
  secUserAgent: process.env.SEC_USER_AGENT,
};

const out = "data-out/data/v1";
const written: [string, string][] = [];
function write(name: string, file: unknown): void {
  const path = `${out}/${name}`;
  writeFileSync(path, JSON.stringify(file));
  written.push([name, path]);
}

async function main(): Promise<void> {
  mkdirSync(out, { recursive: true });
  const prevMarket = (await published(MARKET_DATA_URL)) as MarketFile | null;
  const market = await captureMarket(env, prevMarket?.schema === MARKET_SCHEMA ? prevMarket : null);
  if (market) {
    write("market.json", market);
    console.log(`market: ${market.assets.length} assets`);
  } else console.log("market: no source produced valid data; market.json not written");

  if (process.env.SKIP_NEWS !== "1") write("news.json", await captureNews(env, readNewsFile(await published(NEWS_DATA_URL), now)));
  if (process.env.SKIP_CRYPTO !== "1") {
    const crypto = await captureCrypto(env, readCryptoFile(await published(CRYPTO_DATA_URL)));
    if (crypto) write("crypto.json", crypto);
  }

  if (upload) {
    // Same keys the Worker's cron writes; wrangler uses this computer's Cloudflare login.
    for (const [name, path] of written) {
      execFileSync("npx", ["wrangler@4", "kv", "key", "put", `data/v1/${name}`, "--path", path, "--binding", "DATA", "--remote"], { stdio: "inherit", shell: process.platform === "win32" });
    }
    console.log(`uploaded ${written.length} files to the Worker's KV`);
  }
}

// Exit explicitly once everything is written: open keep-alive connections to the sources can
// otherwise keep Node running.
main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);

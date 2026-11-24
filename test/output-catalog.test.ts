import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CRYPTO_DATA_URL } from "../src/core/links";
import { CATALOG_SCHEMA, outputCatalog, REUSE, TOOL_REUSE } from "../src/mcp/catalog";
import { handleHttp } from "../src/mcp/http";
import { ENDPOINTS, handlePartnerApi, handlePartnerMcp, PARTNER_HIDDEN_TOOLS, resetPartnerCaches, setPartnerCredits, sha256Hex, withoutCrypto, type PartnerStore } from "../src/mcp/partner";
import { setFeatures, TOOLS, V2_TOOLS, visibleTools, type Fetcher } from "../src/mcp/server";

const KEY = "atlx_sbx_" + "C".repeat(32); // a throwaway key, held only in this in-memory store
const kv = new Map<string, string>();
const store: PartnerStore = { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) };
const at = new Date().toISOString();
const t = Math.floor(Date.now() / 1000);
// Thirty days of quiet closes, then a big last day: notable_today would list it as a crypto move.
const series = Array.from({ length: 24 * 30 }, (_, i) => [t - (24 * 30 - i) * 3600, i > 24 * 29 ? 80000 : 60000 + (Math.floor(i / 24) % 2) * 300] as [number, number]);
const crypto = { schema: "atlas-explain-crypto-v1", generatedAt: at, prices: { source: "kraken", asOf: at, coins: [{ symbol: "BTC", name: "Bitcoin", priceUsd: 80000, changePct: 30, changeWindow: "over 24 hours" }] }, history: { source: "kraken", asOf: at, interval: "1h", series: { BTC: series } } };
let cryptoReads = 0;
const net: Fetcher = async (url) => {
  if (url.startsWith(CRYPTO_DATA_URL)) { cryptoReads += 1; return new Response(JSON.stringify(crypto)); }
  return new Response("not here", { status: 404 });
};
const v2 = /^V2_TOOLS\s*=\s*"([^"]*)"/m.exec(readFileSync("wrangler.toml", "utf8"))?.[1];
const CRYPTO_PRICE = /Kraken|CoinGecko|80,000|80000|crypto_move/;

beforeAll(async () => {
  kv.set(`partners/keys/${await sha256Hex(KEY)}`, JSON.stringify({ name: "test", tier: "sandbox", dailyLimit: 100000, createdAt: at, active: true }));
  setFeatures(v2);
});
afterAll(() => { setFeatures(undefined); setPartnerCredits(undefined); });
beforeEach(() => { resetPartnerCaches(); cryptoReads = 0; });

const post = (body: unknown, guarded = true) =>
  handlePartnerMcp(new Request("https://x.dev/mcp", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }), store, undefined, (r, guard) => handleHttp(r, guarded ? guard(net) : net));
const call = async (name: string, args: Record<string, unknown>, guarded = true) => (await post({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, guarded)).text();
const rest = (path: string, init: RequestInit = {}, key: string | null = KEY) => handlePartnerApi(new Request(`https://x.dev/api/v1/${path}`, { ...init, headers: key ? { Authorization: `Bearer ${key}` } : {} }), store, net);

describe("no crypto prices reach a partner key", () => {
  it("is a real danger: the public connector does answer these with prices", async () => {
    const open = async (name: string, args: Record<string, unknown>) => (await handleHttp(new Request("https://x.dev/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), net)).text();
    expect(await open("asset_details", { asset: "Bitcoin" })).toMatch(CRYPTO_PRICE);
    expect(await open("evidence_brief", { asset: "BTC" })).toMatch(CRYPTO_PRICE);
    expect(await open("notable_today", {})).toContain("crypto_move");
  });

  it("holds for every tool the connector has, asked about a coin every way, and never reads the crypto file", async () => {
    for (const tool of visibleTools()) {
      for (const coin of ["Bitcoin", "btc", " BTC ", "bitcoin"]) {
        const args = Object.fromEntries(Object.keys((tool.inputSchema as { properties: object }).properties).map((k) => [k, coin]));
        expect(await call(tool.name, args), `${tool.name} ${coin}`).not.toMatch(/Prices: Kraken|Prices by CoinGecko|80,000|"priceUsd":80000|crypto_move/);
      }
    }
    expect(cryptoReads).toBe(0);
  });

  it("refuses a coin with the reason, and says the truth in notable_today", async () => {
    for (const name of ["evidence_brief", "asset_details"]) expect(await call(name, { asset: "Bitcoin" })).toContain("don't allow redistribution");
    const n = await call("notable_today", {});
    expect(n).toContain("Crypto moves aren't part of partner answers.");
    expect(n).not.toContain("Crypto prices couldn't be loaded");
  });

  it("refuses the finished answer when a caller forgets the guard, with credits on too, and charges nothing", async () => {
    expect(await call("notable_today", {}, false)).toContain("don't allow redistribution");
    setPartnerCredits("1");
    expect(await call("notable_today", {}, false)).toContain("don't allow redistribution");
    expect(await call("notable_today", {})).toContain("io.atlas-explain/credits");
    setPartnerCredits(undefined);
  });

  it("holds on REST, and other data still gets through", async () => {
    expect((await rest("brief/Bitcoin")).status).toBe(403);
    expect(await (await rest("notable")).text()).not.toMatch(CRYPTO_PRICE);
    expect(cryptoReads).toBe(0);
    const seen: string[] = [];
    await withoutCrypto(async (u) => { seen.push(u); return new Response("{}"); })("https://x.dev/data/v1/economy.json");
    expect(seen).toHaveLength(1);
  });
});

describe("the output catalog", () => {
  type Catalog = { schema: string; educationOnly: boolean; counts: { mcpTools: number; restEndpoints: number; series: number | null }; tools: { name: string; reuse: string; inputSchema: object; outputSchema: object }[]; rest: { path: string; credit: string[] }[]; series: unknown; notOffered: { name: string }[] };
  const catalog = async () => (await (await rest("catalog", {}, null)).json()) as Catalog;

  it("classes every tool, so a new one can't be offered by accident", () => {
    for (const tool of [...TOOLS, ...V2_TOOLS]) expect(REUSE[TOOL_REUSE[tool.name]!], tool.name).toBeTruthy();
    for (const name of PARTNER_HIDDEN_TOOLS) expect(TOOL_REUSE[name]).toBe("not_offered");
    expect(Object.keys(TOOL_REUSE).filter((n) => TOOL_REUSE[n] === "not_offered").sort()).toEqual([...PARTNER_HIDDEN_TOOLS].sort());
  });

  it("is public, names what a partner key can use with its schemas, and lists what isn't offered", async () => {
    const c = await catalog();
    expect(c.schema).toBe(CATALOG_SCHEMA);
    expect(c.educationOnly).toBe(true);
    expect(c.tools.map((x) => x.name)).not.toEqual(expect.arrayContaining(["crypto_prices"]));
    expect(c.tools.map((x) => x.name)).not.toContain("learning_check");
    for (const x of c.tools) expect(x.inputSchema && x.outputSchema && x.reuse, x.name).toBeTruthy();
    expect(c.rest).toHaveLength(ENDPOINTS.length);
    for (const e of c.rest) expect(e.credit.length, e.path).toBeGreaterThan(0);
    expect(c.notOffered.map((x) => x.name).sort()).toEqual([...PARTNER_HIDDEN_TOOLS].sort());
    expect((await rest("catalog", { method: "POST" }, null)).status).toBe(405);
  });

  it("flags each central bank's series as to be confirmed before paid use, and no other", () => {
    const row = (source: string) => ({ id: source, name: source, unit: "%", points: 2, source, licence: "Free to reuse." });
    const banks = ["European Central Bank", "Bank of Canada", "Bank of England", "Federal Reserve Bank of New York"];
    const c = outputCatalog({ endpoints: [], credit: {}, hidden: new Set(), now: 0, series: [...banks, "U.S. Bureau of Labor Statistics", "Statistics Canada, table 18-10-0004-01"].map(row) });
    for (const s of c.series!) expect(s.licence.includes("To be confirmed"), s.id).toBe(banks.includes(s.source));
  });

  it("says so (null) when the series can't be read, and doesn't let that be cached", async () => {
    const r = await rest("catalog", {}, null);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(((await r.json()) as Catalog).series).toBeNull();
  });

  it("matches the counts on the partner page, which links it", async () => {
    const page = readFileSync("partners.html", "utf8");
    const c = await catalog();
    expect(page).toContain('href="%DATA_ORIGIN%/api/v1/catalog"');
    expect(page).toContain(`the ${c.counts.mcpTools} connector tools a partner key can use`);
    expect(page).toContain(`all ${c.counts.restEndpoints} REST endpoints`);
  });
});

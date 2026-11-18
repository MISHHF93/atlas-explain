import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { ECONOMY_SCHEMA, parseBlsSchedule, parseBoeBankRate, parseBoeMpcDates } from "../src/data/economy";
import { handlePartnerApi, handlePartnerMcp, resetPartnerCaches, sha256Hex, type PartnerStore } from "../src/mcp/partner";
import { handleHttp } from "../src/mcp/http";
import type { Fetcher } from "../src/mcp/server";

const fx = (name: string) => readFileSync(`test/fixtures/economy/${name}`, "utf8");
const AT = "2026-11-18T15:00:00.000Z";
const NOW = Date.parse(AT);
const KEY = "atlx_sbx_abcdefghijklmnopqrstuvwxyzABCDEF";
const economy = {
  schema: ECONOMY_SCHEMA, generatedAt: AT,
  indicators: [parseBoeBankRate(fx("boe-bank-rate.csv"), AT)],
  calendar: { capturedAt: AT, events: parseBoeMpcDates(fx("boe-mpc-dates.html")) },
  releases: { capturedAt: AT, events: parseBlsSchedule(fx("bls-schedule.ics")) },
};
const crypto = { schema: "atlas-explain-crypto-v1", generatedAt: AT, prices: { source: "kraken", asOf: AT, coins: [{ symbol: "BTC", name: "Bitcoin", priceUsd: 65000, changePct: -1, changeWindow: "since 00:00 UTC" }] }, history: { source: "kraken", asOf: AT, interval: "1h", series: {} } };
const net: Fetcher = async (url) => {
  if (url.includes("economy")) return new Response(JSON.stringify(economy));
  if (url.includes("crypto")) return new Response(JSON.stringify(crypto));
  return new Response("not here", { status: 404 });
};

function store(): PartnerStore & { data: Record<string, string>; writes: number } {
  const s = {
    data: {} as Record<string, string>,
    writes: 0,
    async get(k: string) { return s.data[k] ?? null; },
    async put(k: string, v: string) { s.data[k] = v; s.writes += 1; },
  };
  return s;
}
async function withPartner(limit = 3) {
  const s = store();
  s.data[`partners/keys/${await sha256Hex(KEY)}`] = JSON.stringify({ name: "Test Bank", tier: "sandbox", dailyLimit: limit, createdAt: AT, active: true });
  return s;
}
const call = (s: PartnerStore, path: string, init: RequestInit = {}, key: string | null = KEY) =>
  handlePartnerApi(new Request(`https://x.dev${path}`, { ...init, headers: { ...(key ? { Authorization: `Bearer ${key}` } : {}), "Content-Type": "application/json" } }), s, net, undefined, NOW);

beforeEach(() => resetPartnerCaches());

describe("partner sandbox: keys and limits", () => {
  it("lists its endpoints without a key, and needs a valid key for everything else", async () => {
    const s = await withPartner();
    const index = (await (await call(s, "/api/v1", {}, null)).json()) as { endpoints: unknown[] };
    expect(index.endpoints.length).toBeGreaterThan(5);
    expect((await call(s, "/api/v1/terms?q=bond", {}, null)).status).toBe(401);
    expect((await call(s, "/api/v1/terms?q=bond", {}, "atlx_sbx_wrongwrongwrongwrongwrongwrongwr")).status).toBe(401);
    expect((await call(s, "/api/v1/terms?q=bond", {}, "sk_live_123")).status).toBe(401);
    // Only the hash is stored; the key itself never is.
    expect(JSON.stringify(s.data)).not.toContain(KEY);
  });

  it("counts calls against the daily limit and says when it resets", async () => {
    const s = await withPartner(2);
    expect((await call(s, "/api/v1/terms?q=bond")).headers.get("X-RateLimit-Remaining")).toBe("1");
    expect((await call(s, "/api/v1/terms?q=bond")).status).toBe(200);
    const third = await call(s, "/api/v1/terms?q=bond");
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("keeps KV writes far below one per call", async () => {
    const s = await withPartner(1000);
    for (let i = 0; i < 60; i++) await call(s, "/api/v1/terms?q=bond");
    expect(s.writes).toBeLessThanOrEqual(3);
  });

  it("a turned-off key stops working", async () => {
    const s = await withPartner();
    s.data[`partners/keys/${await sha256Hex(KEY)}`] = JSON.stringify({ name: "Test Bank", tier: "sandbox", dailyLimit: 5, createdAt: AT, active: false });
    expect((await call(s, "/api/v1/terms?q=bond")).status).toBe(401);
  });
});

describe("partner sandbox: what it serves", () => {
  it("answers with the data, what to credit, and that it is education only", async () => {
    const s = await withPartner();
    const r = (await (await call(s, "/api/v1/calendar?only=data")).json()) as { data: { events: { kind: string }[] }; meta: { educationOnly: boolean; credit: string[] } };
    expect(r.data.events.length).toBeGreaterThan(0);
    expect(r.data.events.every((e) => e.kind !== "rate_decision")).toBe(true);
    expect(r.meta.educationOnly).toBe(true);
    expect(r.meta.credit.join(" ")).toContain("Bureau of Labor Statistics");
  });

  it("gives the calendar as one iCalendar file", async () => {
    const s = await withPartner();
    const res = await call(s, "/api/v1/calendar?format=ics");
    expect(res.headers.get("Content-Type")).toMatch(/text\/calendar/);
    const ics = await res.text();
    expect(ics.match(/BEGIN:VCALENDAR/g)).toHaveLength(1);
    expect(ics.match(/BEGIN:VEVENT/g)!.length).toBeGreaterThan(3);
  });

  it("never passes on crypto prices, which aren't licensed for redistribution", async () => {
    const s = await withPartner(10);
    const brief = await call(s, "/api/v1/brief/Bitcoin");
    expect(brief.status).toBe(403);
    expect(((await brief.json()) as { error: { code: string } }).error.code).toBe("not_licensed");
  });

  it("checks a message for scam warning signs and does money maths, by POST", async () => {
    const s = await withPartner(10);
    const scam = (await (await call(s, "/api/v1/scam-check", { method: "POST", body: JSON.stringify({ text: "Guaranteed 3% a day, act now" }) })).json()) as { data: { matched: { id: string }[] } };
    expect(scam.data.matched.map((m) => m.id)).toEqual(expect.arrayContaining(["guaranteed_returns", "pressure"]));
    const money = (await (await call(s, "/api/v1/money", { method: "POST", body: JSON.stringify({ calculation: "inflation", amount: 1000, inflation_pct: 3, years: 10 }) })).json()) as { data: { lines: string[] } };
    expect(money.data.lines[0]).toMatch(/buys about what/);
    expect((await call(s, "/api/v1/money")).status).toBe(405);
    expect((await call(s, "/api/v1/nope")).status).toBe(404);
  });
});

describe("partner keys on the connector", () => {
  const mcp = (s: PartnerStore, body: unknown) =>
    handlePartnerMcp(new Request("https://x.dev/mcp", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }), s, undefined, (r) => handleHttp(r, net), NOW);

  it("hides the crypto tools and refuses calls to them", async () => {
    const s = await withPartner(10);
    const list = (await (await mcp(s, { jsonrpc: "2.0", id: 1, method: "tools/list" })).json()) as { result: { tools: { name: string }[] } };
    const names = list.result.tools.map((t) => t.name);
    expect(names).toContain("upcoming_events");
    expect(names).not.toContain("crypto_prices");
    expect(names).not.toContain("market_depth");
    const refused = (await (await mcp(s, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "price_history", arguments: { coin: "BTC" } } })).json()) as { error: { message: string } };
    expect(refused.error.message).toMatch(/aren't licensed for redistribution/);
  });
});

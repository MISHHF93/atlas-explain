import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { creditCost, ENDPOINTS, handlePartnerApi, setPartnerCredits, sha256Hex } from "../src/mcp/partner";
import type { Fetcher } from "../src/mcp/server";

// A throwaway sandbox key, held only in this in-memory store.
const KEY = "atlx_sbx_" + "T".repeat(32);
const kv = new Map<string, string>();
const store = { get: async (k: string) => kv.get(k) ?? null, put: async (k: string, v: string) => void kv.set(k, v) };
const none: Fetcher = async () => new Response("no", { status: 404 });
beforeAll(async () => {
  kv.set(`partners/keys/${await sha256Hex(KEY)}`, JSON.stringify({ name: "test", tier: "sandbox", dailyLimit: 1000, createdAt: "2026-11-23T00:00:00Z", active: true }));
});
const call = (path: string, init: { method?: string; body?: unknown; key?: string } = {}) =>
  handlePartnerApi(
    new Request(`https://w/api/v1/${path}`, { method: init.method ?? (init.body ? "POST" : "GET"), headers: { ...(init.key !== "" ? { Authorization: `Bearer ${init.key ?? KEY}` } : {}), "Content-Type": "application/json" }, body: init.body ? JSON.stringify(init.body) : undefined }),
    store,
    none,
  );

describe("the six newer partner endpoints", () => {
  afterEach(() => setPartnerCredits(undefined));

  it("are listed in the public index", async () => {
    const r = await call("", { key: "" });
    const paths = ((await r.json()) as { endpoints: { path: string }[] }).endpoints.map((e) => e.path.split("?")[0]);
    for (const p of ["/api/v1/decisions/{bank}", "/api/v1/speeches/{bank}", "/api/v1/whats-changed", "/api/v1/inflation", "/api/v1/rate-impact", "/api/v1/debt-payoff"]) expect(paths).toContain(p);
    expect(ENDPOINTS).toHaveLength(17);
  });

  it("need a key, like every other endpoint", async () => {
    expect((await call("inflation?amount=100&from_year=2000", { key: "" })).status).toBe(401);
  });

  it("answer the calculators from the same code as the connector, wrapped for partners", async () => {
    const inf = await call("inflation?amount=1000&from_year=1990&country=US");
    expect(inf.status).toBe(200);
    const ib = (await inf.json()) as { data: { country: string; value: number }; meta: { educationOnly: boolean; credit: string[] } };
    expect(ib.data.country).toBe("US");
    expect(ib.data.value).toBeGreaterThan(2000);
    expect(ib.meta.educationOnly).toBe(true);
    const debt = await call("debt-payoff", { body: { monthly_budget: 800, debts: [{ name: "Card", balance: 6000, rate_pct: 22.99, min_payment: 180 }, { name: "Loan", balance: 9000, rate_pct: 6.9, min_payment: 250 }] } });
    expect(((await debt.json()) as { data: { plans: unknown[] } }).data.plans).toHaveLength(2);
    const rate = await call("rate-impact", { body: { product: "heloc", balance: 50000, rate_pct: 7, change_pts: -0.25, country: "US" } });
    expect(rate.status).toBe(200);
    expect(((await rate.json()) as { data: { product: string } }).data.product).toBe("heloc");
  });

  it("say plainly what's missing, and refuse a wrong method or a missing bank", async () => {
    // No data reachable: "what changed" still answers, and says so.
    const wc = await call("whats-changed?topic=rates&days=30");
    expect(wc.status).toBe(200);
    expect(((await wc.json()) as { data: { notes: string[] } }).data.notes.join(" ")).toContain("couldn't be loaded");
    expect((await call("debt-payoff")).status).toBe(405);
    expect((await call("decisions")).status).toBe(405);
    expect((await call("inflation?amount=10&from_year=1970&country=UK")).status).toBe(404);
  });

  it("cost credits by weight when credits are on, and nothing when an answer fails", async () => {
    expect(creditCost("decisions", "rest")).toBe(3);
    expect(creditCost("whats-changed", "rest")).toBe(2);
    expect(creditCost("inflation", "rest")).toBe(1);
    setPartnerCredits("1");
    const bad = await call("inflation?amount=10&from_year=1970&country=UK");
    expect(bad.headers.get("X-Credits-Used")).toBe("0");
  });
});

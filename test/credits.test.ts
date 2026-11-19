import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ECONOMY_SCHEMA, parseBoeBankRate, parseBoeMpcDates } from "../src/data/economy";
import { creditCost, handlePartnerApi, handlePartnerMcp, resetPartnerCaches, setPartnerCredits, sha256Hex, type PartnerStore } from "../src/mcp/partner";
import { handleHttp } from "../src/mcp/http";
import type { Fetcher } from "../src/mcp/server";

// ATLAS credits (docs/USAGE_PRICING.md, section 3), switched on by the Worker's CREDITS_ENABLED.
const fx = (name: string) => readFileSync(`test/fixtures/economy/${name}`, "utf8");
const AT = "2026-11-18T15:00:00.000Z";
const NOW = Date.parse(AT);
const KEY = "atlx_sbx_abcdefghijklmnopqrstuvwxyzABCDEF";
const economy = { schema: ECONOMY_SCHEMA, generatedAt: AT, indicators: [parseBoeBankRate(fx("boe-bank-rate.csv"), AT)], calendar: { capturedAt: AT, events: parseBoeMpcDates(fx("boe-mpc-dates.html")) } };
const net: Fetcher = async (url) => (url.includes("economy") ? new Response(JSON.stringify(economy)) : new Response("not here", { status: 404 }));

async function partner(limit: number) {
  const data: Record<string, string> = {};
  const s: PartnerStore = { async get(k) { return data[k] ?? null; }, async put(k, v) { data[k] = v; } };
  data[`partners/keys/${await sha256Hex(KEY)}`] = JSON.stringify({ name: "Test", tier: "sandbox", dailyLimit: limit, createdAt: AT, active: true });
  return s;
}
const rest = (s: PartnerStore, path: string) => handlePartnerApi(new Request(`https://x.dev${path}`, { headers: { Authorization: `Bearer ${KEY}` } }), s, net, undefined, NOW);
const mcp = (s: PartnerStore, body: unknown) =>
  handlePartnerMcp(new Request("https://x.dev/mcp", { method: "POST", headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(body) }), s, undefined, (r) => handleHttp(r, net), NOW);

beforeEach(() => resetPartnerCaches());
afterEach(() => setPartnerCredits(undefined));

describe("ATLAS credits", () => {
  it("weighs each tool and endpoint as the pricing plan says", () => {
    expect([creditCost("explain_term", "tool"), creditCost("data_series", "tool"), creditCost("notable_today", "tool"), creditCost("evidence_brief", "tool"), creditCost("decision_explainer", "tool")]).toEqual([1, 2, 2, 3, 3]);
    expect([creditCost("terms", "rest"), creditCost("series", "rest"), creditCost("notable", "rest"), creditCost("brief", "rest")]).toEqual([1, 2, 2, 3]);
  });

  it("is off by default: one call per request, no credit headers", async () => {
    setPartnerCredits(undefined);
    const s = await partner(10);
    const r = await rest(s, "/api/v1/terms?q=bond");
    expect(r.headers.get("X-RateLimit-Remaining")).toBe("9");
    expect(r.headers.get("X-Credits-Used")).toBeNull();
    expect(((await r.json()) as { meta: Record<string, unknown> }).meta.credits).toBeUndefined();
  });

  it("charges REST answers by weight, nothing for an error, and says what is left", async () => {
    setPartnerCredits("1");
    const s = await partner(10);
    const terms = await rest(s, "/api/v1/terms?q=bond");
    expect([terms.headers.get("X-Credits-Used"), terms.headers.get("X-Credits-Remaining")]).toEqual(["1", "9"]);
    expect(((await terms.json()) as { meta: { credits: unknown } }).meta.credits).toEqual({ used: 1, remainingToday: 9, unit: "credit" });
    // A failed answer costs nothing.
    const missing = await rest(s, "/api/v1/brief/Unobtainium");
    expect(missing.status).toBe(404);
    expect([missing.headers.get("X-Credits-Used"), missing.headers.get("X-Credits-Remaining")]).toEqual(["0", "9"]);
    const economyAnswer = await rest(s, "/api/v1/economy?topic=uk");
    expect(economyAnswer.headers.get("X-Credits-Remaining")).toBe("8");
  });

  it("stops at the daily limit in credits, and says credits", async () => {
    setPartnerCredits("true");
    const s = await partner(2);
    await rest(s, "/api/v1/terms?q=bond");
    await rest(s, "/api/v1/terms?q=bond");
    const over = await rest(s, "/api/v1/terms?q=bond");
    expect(over.status).toBe(429);
    expect(((await over.json()) as { error: { message: string } }).error.message).toContain("2 credits a day");
  });

  it("charges the keyed connector only for tool calls that answer, and reports credits in the result", async () => {
    setPartnerCredits("1");
    const s = await partner(10);
    const list = await mcp(s, { jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(list.headers.get("X-Credits-Used")).toBe("0");
    const tools = ((await list.json()) as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
    expect(tools).not.toContain("crypto_prices");
    const ok = await mcp(s, { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "explain_term", arguments: { term: "bond" } } });
    const body = (await ok.json()) as { result: { _meta: Record<string, unknown> } };
    expect(body.result._meta["io.atlas-explain/credits"]).toEqual({ used: 1, remainingToday: 9, unit: "credit" });
    const err = await mcp(s, { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "explain_term", arguments: { term: "" } } });
    expect([err.headers.get("X-Credits-Used"), err.headers.get("X-Credits-Remaining")]).toEqual(["0", "9"]);
  });
});

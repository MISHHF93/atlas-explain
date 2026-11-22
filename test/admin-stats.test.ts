import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { ADMIN_STATS_PATH, allowedEmails, handleAdminStats, verifyFirebaseToken, type KeyFetcher } from "../src/mcp/admin";
import { handleHttp } from "../src/mcp/http";
import { handleRequest, type WorkerEnv } from "../src/mcp/live-data";
import { agentOf, eventOf, UsageCounts, UsageStats, type CallEvent, type SqlStorage, type StatsNamespace } from "../src/mcp/stats";

/** Durable Object SQLite storage, played by node:sqlite. */
function sqlite(): SqlStorage {
  const db = new DatabaseSync(":memory:");
  return {
    exec(query, ...bindings) {
      const st = db.prepare(query);
      if (/^\s*(SELECT)/i.test(query)) {
        const rows = st.all(...bindings) as Record<string, unknown>[];
        return { toArray: () => rows };
      }
      st.run(...bindings);
      return { toArray: () => [] };
    },
  };
}

/** The STATS binding, backed by one in-memory UsageStats object. */
function namespace(): StatsNamespace & { obj: UsageStats } {
  const obj = new UsageStats({ storage: { sql: sqlite() } });
  return { obj, idFromName: () => "global", get: () => ({ fetch: (input: string, init?: RequestInit) => obj.fetch(new Request(input, init)) }) };
}

const NOW = Date.parse("2026-11-22T15:00:00Z");
const DAY = 86_400_000;

describe("connector usage counts", () => {
  it("counts tool calls by day, tool and assistant, errors apart, and connections by the name the assistant gives", () => {
    const c = new UsageCounts(sqlite());
    const call = (tool: string, agent: string, error = false): CallEvent => ({ kind: "tool", tool, agent, error });
    c.record(call("explain_term", "Claude"), NOW - DAY);
    c.record(call("explain_term", "Claude"), NOW);
    c.record(call("crypto_prices", "ChatGPT", true), NOW);
    c.record({ kind: "connect", client: "claude-ai", agent: "Claude" }, NOW);
    const s = c.summary(7, NOW);
    expect(s.totals).toEqual({ calls: 3, errors: 1, connects: 1 });
    expect(s.days).toHaveLength(7);
    expect(s.days.at(-1)).toEqual({ day: "2026-11-22", calls: 2, errors: 1, connects: 1 });
    expect(s.days.at(-2)?.calls).toBe(1);
    expect(s.tools[0]).toEqual({ name: "explain_term", calls: 2, errors: 0 });
    expect(s.tools.find((t) => t.name === "crypto_prices")).toEqual({ name: "crypto_prices", calls: 1, errors: 1 });
    expect(s.agents).toEqual([{ name: "Claude", calls: 2 }, { name: "ChatGPT", calls: 1 }]);
    expect(s.clients).toEqual([{ name: "claude-ai", connects: 1 }]);
    expect(s.since).toBe("2026-11-21");
  });

  it("drops counts older than about 13 months", () => {
    const c = new UsageCounts(sqlite());
    c.record({ kind: "tool", tool: "x", agent: "Claude", error: false }, NOW - 500 * DAY);
    c.record({ kind: "tool", tool: "x", agent: "Claude", error: false }, NOW);
    expect(c.summary(400, NOW).since).toBe("2026-11-22");
  });

  it("keeps only a broad assistant name, never the raw User-Agent, and only what a request is", () => {
    expect(agentOf("Claude-User (+https://support.anthropic.com/)")).toBe("Claude");
    expect(agentOf("openai-mcp/1.0")).toBe("ChatGPT");
    expect(agentOf("Cursor/2.1 (darwin)")).toBe("Cursor");
    expect(agentOf("node")).toBe("Other");
    expect(agentOf(null)).toBe("Unknown");
    expect(eventOf({ method: "tools/call", params: { name: "explain_term", arguments: { term: "secret question" } } }, { result: { content: [] } }, "Claude-User")).toEqual({ kind: "tool", tool: "explain_term", agent: "Claude", error: false });
    expect(eventOf({ method: "tools/call", params: { name: "x" } }, { result: { isError: true } }, null)?.kind === "tool" && true).toBe(true);
    expect(eventOf({ method: "initialize", params: { clientInfo: { name: "claude-ai <script>" } } }, { result: {} }, "")).toEqual({ kind: "connect", client: "claude-ai script", agent: "Unknown" });
    expect(eventOf({ method: "tools/list" }, { result: {} }, "")).toBeNull();
  });

  it("counts real connector calls without changing the answers, and a failing counter changes nothing", async () => {
    const post = (body: unknown) => new Request("https://w/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", "User-Agent": "Claude-User" }, body: JSON.stringify(body) });
    const msg = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "explain_term", arguments: { term: "spread" } } };
    const fetcher = async () => new Response("no", { status: 404 });
    const plain = await (await handleHttp(post(msg), fetcher)).text();
    const heard: CallEvent[] = [];
    const counted = await (await handleHttp(post(msg), fetcher, (e) => heard.push(e))).text();
    expect(counted).toBe(plain);
    expect(heard).toEqual([{ kind: "tool", tool: "explain_term", agent: "Claude", error: false }]);
    const broken = await (await handleHttp(post(msg), fetcher, () => { throw new Error("storage full"); })).text();
    expect(broken).toBe(plain);
  });
});

/* ---------- the sign-in check ---------- */

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
async function signer() {
  const pair = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = { ...(await crypto.subtle.exportKey("jwk", pair.publicKey)), kid: "k1" };
  const keys: KeyFetcher = async () => [jwk];
  const token = async (claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "k1" }) => {
    const body = `${enc(header)}.${enc(claims)}`;
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, new TextEncoder().encode(body));
    return `${body}.${Buffer.from(sig).toString("base64url")}`;
  };
  return { keys, token };
}
const secs = Math.floor(NOW / 1000);
const good = { aud: "atlas-explain", iss: "https://securetoken.google.com/atlas-explain", sub: "u1", iat: secs - 60, exp: secs + 3000, email: "Owner@Example.com", email_verified: true };

describe("the admin sign-in check", () => {
  it("accepts a valid Firebase sign-in and nothing else", async () => {
    const { keys, token } = await signer();
    expect(await verifyFirebaseToken(await token(good), keys, NOW)).toEqual({ email: "owner@example.com", uid: "u1" });
    for (const bad of [
      { ...good, aud: "other-project" },
      { ...good, iss: "https://securetoken.google.com/other" },
      { ...good, exp: secs - 1 },
      { ...good, iat: secs + 3600 },
      { ...good, email_verified: false },
      { ...good, sub: "" },
    ]) expect(await verifyFirebaseToken(await token(bad), keys, NOW)).toBeNull();
    expect(await verifyFirebaseToken(await token(good, { alg: "none", kid: "k1" }), keys, NOW)).toBeNull();
    expect(await verifyFirebaseToken(await token(good, { alg: "RS256", kid: "other" }), keys, NOW)).toBeNull();
    // Signed by someone else's key.
    const other = await signer();
    expect(await verifyFirebaseToken(await other.token(good), keys, NOW)).toBeNull();
    // Claims edited after signing.
    const [h, , s] = (await token(good)).split(".");
    expect(await verifyFirebaseToken(`${h}.${enc({ ...good, email: "intruder@example.com" })}.${s}`, keys, NOW)).toBeNull();
    expect(await verifyFirebaseToken("not-a-token", keys, NOW)).toBeNull();
  });

  it("serves the counts only to an allowed email, from the web app, never cached", async () => {
    const { keys, token } = await signer();
    const ns = namespace();
    await ns.get("global").fetch("https://stats/record", { method: "POST", body: JSON.stringify({ kind: "tool", tool: "explain_term", agent: "Claude", error: false }) });
    const env = { STATS: ns, ADMIN_EMAILS: "owner@example.com, second@example.com" };
    const ask = async (auth?: string, origin = "https://atlas-explain.web.app", e: typeof env | Record<string, unknown> = env) =>
      handleAdminStats(new Request(`https://w${ADMIN_STATS_PATH}?days=7`, { headers: { Origin: origin, ...(auth ? { Authorization: `Bearer ${auth}` } : {}) } }), e, keys, NOW);
    const ok = await ask(await token(good));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Cache-Control")).toBe("no-store");
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://atlas-explain.web.app");
    expect(((await ok.json()) as { totals: { calls: number } }).totals.calls).toBe(1);
    expect((await ask()).status).toBe(401);
    expect((await ask(await token({ ...good, email: "someone@example.com" }))).status).toBe(403);
    expect((await ask(await token(good), "https://evil.example")).status).toBe(403);
    // No list set: nobody gets in.
    expect((await ask(await token(good), undefined, { STATS: ns })).status).toBe(403);
    expect(allowedEmails(" A@b.com ,,c@d.com").has("a@b.com")).toBe(true);
  });

  it("is routed by the Worker, and the email list lives only in a Worker secret", async () => {
    const r = await handleRequest(new Request(`https://w${ADMIN_STATS_PATH}`), {} as WorkerEnv);
    expect(r.status).toBe(401);
    const { readFileSync } = await import("node:fs");
    const toml = readFileSync("wrangler.toml", "utf8");
    expect(toml).toContain('new_sqlite_classes = ["UsageStats"]');
    expect(toml).not.toMatch(/ADMIN_EMAILS\s*=/);
    expect(toml).not.toMatch(/@gmail\.com/);
  });
});

describe("the Connector usage card in the web app", () => {
  it("asks the connector with the account's token, and shows nothing when it says no or the visitor is signed out", async () => {
    const { mountAdminUsage } = await import("../src/wallet/admin-usage");
    let filled = 0;
    const slot = { replaceChildren: () => { filled += 1; } } as unknown as HTMLElement;
    const asked: [string, string | null][] = [];
    const fetcher = (async (url: string, init?: RequestInit) => {
      asked.push([url, new Headers(init?.headers).get("Authorization")]);
      return new Response(JSON.stringify({ error: "Not allowed" }), { status: 403 });
    }) as unknown as typeof fetch;
    await mountAdminUsage(slot, async () => "tok", fetcher);
    expect(asked).toEqual([["https://atlas-explain-mcp.atlas-explain.workers.dev/admin/stats?days=30", "Bearer tok"]]);
    await mountAdminUsage(slot, async () => null, fetcher);
    expect(asked).toHaveLength(1);
    await mountAdminUsage(slot, async () => "tok", (async () => { throw new Error("offline"); }) as unknown as typeof fetch);
    expect(filled).toBe(0);
  });

  it("opens from /app/admin, and loads only for a signed-in account, on demand", async () => {
    const { parseRoute } = await import("../src/app/routes");
    expect(parseRoute("/app/admin")).toEqual({ kind: "tab", tab: "settings" });
    const { readFileSync } = await import("node:fs");
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app).toContain('if (account?.signedIn && token) void import("../wallet/admin-usage")');
    expect(readFileSync("src/wallet/admin-usage.ts", "utf8")).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i);
  });
});

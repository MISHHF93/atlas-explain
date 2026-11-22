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

describe("the owner dashboard", () => {
  /** KV as the overview reads it: values with metadata, and a prefix list. */
  function kv(entries: Record<string, { value: string; metadata?: unknown }>) {
    return {
      async get(k: string) {
        return entries[k]?.value ?? null;
      },
      async getWithMetadata<M>(k: string) {
        return { value: entries[k]?.value ?? null, metadata: (entries[k]?.metadata ?? null) as M | null };
      },
      async list({ prefix }: { prefix: string }) {
        return { keys: Object.keys(entries).filter((k) => k.startsWith(prefix)).map((name) => ({ name })), list_complete: true };
      },
    };
  }
  const deps = { files: ["crypto.json", "docs.json", "news.json"], refreshAfterMs: { "crypto.json": 3 * 60_000, "docs.json": 3 * 3_600_000, "news.json": 15 * 60_000 }, savedOnChange: ["docs.json"], service: { version: "1.20.0", tools: ["explain_term"], creditsEnabled: false } };

  it("shows usage, how fresh each data file is, and partner keys with their use, to the owner only", async () => {
    const { handleAdminOverview } = await import("../src/mcp/admin");
    const { keys, token } = await signer();
    const ns = namespace();
    await ns.get("global").fetch("https://stats/record", { method: "POST", body: JSON.stringify({ kind: "tool", tool: "explain_term", agent: "Claude", error: false }) });
    const store = kv({
      "data/v1/crypto.json": { value: "{}", metadata: { capturedAt: new Date(NOW - 2 * 60_000).toISOString() } },
      "data/v1/docs.json": { value: "{}", metadata: { capturedAt: new Date(NOW - 2 * DAY).toISOString() } },
      "data/v1/news.json": { value: "{}", metadata: { capturedAt: new Date(NOW - 3 * 3_600_000).toISOString() } },
      "partners/keys/abc": { value: JSON.stringify({ name: "Acme Bank", tier: "pilot", dailyLimit: 10000, createdAt: "2026-11-01T00:00:00Z", active: true }) },
      "partners/keys/old": { value: JSON.stringify({ name: "revoked", tier: "sandbox", dailyLimit: 0, createdAt: "2026-11-01T00:00:00Z", active: false }) },
      "partners/usage/abc/2026-11-22": { value: "40" },
      "partners/usage/abc/2026-11-20": { value: "2" },
    });
    const env = { STATS: ns, ADMIN_EMAILS: "owner@example.com", DATA: store };
    const ask = async (claims: Record<string, unknown>, e: Record<string, unknown> = env) =>
      handleAdminOverview(new Request("https://w/admin/overview?days=7", { headers: { Origin: "https://atlas-explain.web.app", Authorization: `Bearer ${await token(claims)}` } }), e as typeof env, deps, keys, NOW);
    const r = await ask(good);
    expect(r.status).toBe(200);
    const o = (await r.json()) as import("../src/mcp/admin").Overview;
    expect(o.owner).toBe("owner@example.com");
    expect(o.usage?.totals.calls).toBe(1);
    expect(o.data).toEqual([
      { file: "crypto.json", capturedAt: new Date(NOW - 2 * 60_000).toISOString(), ageMinutes: 2, expectedEveryMinutes: 3, savedOnChange: false, late: false },
      // Saved only when a bank publishes: two quiet days is normal.
      { file: "docs.json", capturedAt: new Date(NOW - 2 * DAY).toISOString(), ageMinutes: 2880, expectedEveryMinutes: 180, savedOnChange: true, late: false },
      // Three hours on a 15-minute schedule is behind.
      { file: "news.json", capturedAt: new Date(NOW - 3 * 3_600_000).toISOString(), ageMinutes: 180, expectedEveryMinutes: 15, savedOnChange: false, late: true },
    ]);
    expect(o.partners).toEqual([{ name: "Acme Bank", tier: "pilot", dailyLimit: 10000, active: true, createdAt: "2026-11-01T00:00:00Z", today: 40, last7Days: 42 }]);
    expect(o.service).toEqual({ ...deps.service, counting: true });
    // Anyone else: refused, and told whether an owner is set up at all.
    const other = await ask({ ...good, email: "someone@example.com" });
    expect(other.status).toBe(403);
    expect(await other.json()).toMatchObject({ setup: true });
    const none = await ask(good, { ...env, ADMIN_EMAILS: "" });
    expect(none.status).toBe(403);
    expect(await none.json()).toMatchObject({ setup: false });
  });

  it("is its own page at /admin, apart from the user app, never indexed", async () => {
    const { readFileSync } = await import("node:fs");
    const fb = JSON.parse(readFileSync("firebase.json", "utf8")) as { hosting: { rewrites: unknown[]; redirects: unknown[]; headers: { source: string; headers: { key: string; value: string }[] }[] } };
    expect(fb.hosting.rewrites).toContainEqual({ source: "/admin", destination: "/admin.html" });
    expect(fb.hosting.redirects).toContainEqual({ source: "/app/admin", destination: "/admin", type: 301 });
    expect(fb.hosting.headers.find((x) => x.source === "/admin")?.headers).toContainEqual({ key: "X-Robots-Tag", value: "noindex, nofollow" });
    expect(readFileSync("admin.html", "utf8")).toContain('<meta name="robots" content="noindex, nofollow" />');
    expect(readFileSync("vite.config.ts", "utf8")).toContain('admin: "admin.html"');
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app).not.toContain("admin-usage");
    // The page never names the owner: the connector decides.
    for (const f of ["src/admin/main.ts", "src/admin/view.ts", "admin.html"]) expect(readFileSync(f, "utf8")).not.toMatch(/@gmail\.com/);
    expect(readFileSync("src/admin/main.ts", "utf8")).toContain("/admin/overview?days=");
  });
});

/**
 * The owner's admin view of connector usage (docs/ADMIN.md). GET /admin/stats answers only to a Firebase
 * sign-in (the web app's own Google or email-link sign-in) whose verified email is in the ADMIN_EMAILS
 * Worker secret. No password exists; the email list is never in the code or the website.
 */
import { EXPLAIN_WEB_ALT_URL, EXPLAIN_WEB_URL } from "../core/links";
import { readSummary, type StatsNamespace, type UsageSummary } from "./stats";

export const ADMIN_STATS_PATH = "/admin/stats";
/** The Firebase project whose sign-ins are accepted. */
export const FIREBASE_PROJECT_ID = "atlas-explain";
const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
/** Only the web app (and a local copy of it) may read the numbers from a browser. */
const ALLOWED_ORIGINS = [EXPLAIN_WEB_URL, EXPLAIN_WEB_ALT_URL];

export interface AdminEnv {
  STATS?: StatsNamespace;
  /** Worker secret: comma list of the emails allowed in. Unset: nobody is. */
  ADMIN_EMAILS?: string;
}

type Jwk = JsonWebKey & { kid?: string };
export type KeyFetcher = () => Promise<Jwk[]>;

let cachedKeys: { keys: Jwk[]; until: number } | null = null;
/** Google's public keys for Firebase sign-in tokens, kept for an hour. */
export const googleKeys: KeyFetcher = async () => {
  if (cachedKeys && cachedKeys.until > Date.now()) return cachedKeys.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error(`keys ${r.status}`);
  const keys = ((await r.json()) as { keys?: Jwk[] }).keys ?? [];
  cachedKeys = { keys, until: Date.now() + 3_600_000 };
  return keys;
};

const b64url = (s: string): Uint8Array<ArrayBuffer> => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export interface SignIn {
  email: string;
  uid: string;
}

/**
 * Checks a Firebase ID token the way Firebase's own servers do: RS256 signed by one of Google's current keys,
 * for this project, not expired, issued in the past, with a verified email. Null for anything else.
 */
export async function verifyFirebaseToken(token: string, keys: KeyFetcher, now: number = Date.now(), projectId = FIREBASE_PROJECT_ID): Promise<SignIn | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts as [string, string, string];
    const header = JSON.parse(new TextDecoder().decode(b64url(h))) as { alg?: string; kid?: string };
    if (header.alg !== "RS256" || !header.kid) return null;
    const jwk = (await keys()).find((k) => k.kid === header.kid);
    if (!jwk) return null;
    const key = await crypto.subtle.importKey("jwk", { ...jwk, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!ok) return null;
    const c = JSON.parse(new TextDecoder().decode(b64url(p))) as Record<string, unknown>;
    const secs = Math.floor(now / 1000);
    if (c.aud !== projectId || c.iss !== `https://securetoken.google.com/${projectId}`) return null;
    if (typeof c.exp !== "number" || c.exp <= secs) return null;
    if (typeof c.iat !== "number" || c.iat > secs + 300) return null;
    if (typeof c.sub !== "string" || !c.sub) return null;
    if (c.email_verified !== true || typeof c.email !== "string") return null;
    return { email: c.email.toLowerCase(), uid: c.sub };
  } catch {
    return null;
  }
}

export const allowedEmails = (list: string | undefined): Set<string> =>
  new Set((list ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean));

function originOk(origin: string | null): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  try {
    const u = new URL(origin);
    return u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname);
  } catch {
    return false;
  }
}

function cors(origin: string | null): Record<string, string> {
  return origin && originOk(origin)
    ? { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Authorization", "Access-Control-Max-Age": "600", Vary: "Origin" }
    : { Vary: "Origin" };
}

type Gate = { ok: true; reply: (status: number, body: unknown) => Response; email: string } | { ok: false; response: Response };

/**
 * The one owner check for every /admin address: the web app's own origin, a valid Firebase sign-in, and an
 * email in ADMIN_EMAILS. With no list set, it says so, so the owner can tell setup apart from a wrong account.
 */
async function ownerGate(request: Request, env: AdminEnv, keys: KeyFetcher, now: number): Promise<Gate> {
  const origin = request.headers.get("Origin");
  const headers = { ...cors(origin), "Cache-Control": "no-store" };
  const reply = (status: number, body: unknown) => Response.json(body, { status, headers });
  if (request.method === "OPTIONS") return { ok: false, response: new Response(null, { status: 204, headers }) };
  if (request.method !== "GET") return { ok: false, response: reply(405, { error: "Method not allowed" }) };
  if (!originOk(origin)) return { ok: false, response: reply(403, { error: "Not allowed" }) };
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return { ok: false, response: reply(401, { error: "Sign in first" }) };
  const who = await verifyFirebaseToken(token, keys, now);
  if (!who) return { ok: false, response: reply(401, { error: "Your sign-in has expired. Sign in again." }) };
  const owners = allowedEmails(env.ADMIN_EMAILS);
  if (owners.size === 0) return { ok: false, response: reply(403, { error: "No owner account is set up yet", setup: false }) };
  if (!owners.has(who.email)) return { ok: false, response: reply(403, { error: "This account isn't the owner's", setup: true }) };
  return { ok: true, reply, email: who.email };
}

const daysParam = (request: Request) => Math.min(400, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));

/** GET /admin/stats?days=30 with "Authorization: Bearer <Firebase ID token>": the usage counts alone. */
export async function handleAdminStats(request: Request, env: AdminEnv, keys: KeyFetcher = googleKeys, now: number = Date.now()): Promise<Response> {
  const gate = await ownerGate(request, env, keys, now);
  if (!gate.ok) return gate.response;
  if (!env.STATS) return gate.reply(503, { error: "Counting isn't set up on this Worker" });
  try {
    return gate.reply(200, await readSummary(env.STATS, daysParam(request)));
  } catch {
    return gate.reply(503, { error: "The counts couldn't be read right now" });
  }
}

/* ---------- the owner dashboard's overview ---------- */

export const ADMIN_OVERVIEW_PATH = "/admin/overview";

/** What the overview reads from the Worker's KV: the data files' capture times and the partner keys. */
export interface OverviewStore {
  getWithMetadata<M>(key: string): Promise<{ value: string | null; metadata: M | null }>;
  get(key: string): Promise<string | null>;
  list?(options: { prefix: string; cursor?: string }): Promise<{ keys: { name: string }[]; list_complete: boolean; cursor?: string }>;
}

export interface OverviewDeps {
  files: readonly string[];
  /** How often each file is meant to refresh, in ms; a file twice that old is marked late. */
  refreshAfterMs: Readonly<Record<string, number>>;
  /** Files checked on schedule but saved only when something new appears; late only after two weeks unchanged. */
  savedOnChange?: readonly string[];
  service: { version: string; tools: string[]; creditsEnabled: boolean };
}

export interface Overview {
  generatedAt: string;
  owner: string;
  usage: UsageSummary | null;
  usageError: string | null;
  data: { file: string; capturedAt: string | null; ageMinutes: number | null; expectedEveryMinutes: number; savedOnChange: boolean; late: boolean }[];
  partners: { name: string; tier: string; dailyLimit: number; active: boolean; createdAt: string; today: number; last7Days: number }[];
  service: OverviewDeps["service"] & { counting: boolean };
}

const dayKey = (t: number) => new Date(t).toISOString().slice(0, 10);

async function partnerRows(store: OverviewStore, now: number): Promise<Overview["partners"]> {
  if (!store.list) return [];
  const names: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await store.list({ prefix: "partners/keys/", cursor });
    names.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && names.length < 500);
  const rows: Overview["partners"] = [];
  for (const name of names) {
    const hash = name.slice("partners/keys/".length);
    try {
      const rec = JSON.parse((await store.get(name)) ?? "null") as { name?: string; tier?: string; dailyLimit?: number; active?: boolean; createdAt?: string } | null;
      if (!rec || rec.name === "revoked") continue;
      const counts = await Promise.all(Array.from({ length: 7 }, (_, i) => store.get(`partners/usage/${hash}/${dayKey(now - i * 86_400_000)}`).then((v) => Number(v) || 0).catch(() => 0)));
      rows.push({ name: String(rec.name ?? "unnamed"), tier: String(rec.tier ?? "sandbox"), dailyLimit: Number(rec.dailyLimit) || 0, active: rec.active !== false, createdAt: String(rec.createdAt ?? ""), today: counts[0]!, last7Days: counts.reduce((a, b) => a + b, 0) });
    } catch {
      /* a record that can't be read is left out */
    }
  }
  return rows.sort((a, b) => b.last7Days - a.last7Days);
}

/** GET /admin/overview?days=30: usage, data freshness, partner keys and service settings, for the owner. */
export async function handleAdminOverview(request: Request, env: AdminEnv & { DATA: OverviewStore }, deps: OverviewDeps, keys: KeyFetcher = googleKeys, now: number = Date.now()): Promise<Response> {
  const gate = await ownerGate(request, env, keys, now);
  if (!gate.ok) return gate.response;
  let usage: UsageSummary | null = null;
  let usageError: string | null = env.STATS ? null : "Counting isn't set up on this Worker.";
  if (env.STATS) {
    try {
      usage = await readSummary(env.STATS, daysParam(request));
    } catch {
      usageError = "The counts couldn't be read right now.";
    }
  }
  const data = await Promise.all(
    deps.files.map(async (file) => {
      const every = deps.refreshAfterMs[file] ?? 3_600_000;
      const onChange = deps.savedOnChange?.includes(file) ?? false;
      const lateAfter = onChange ? Math.max(every * 2, 14 * 86_400_000) : every * 2;
      try {
        const { metadata } = await env.DATA.getWithMetadata<{ capturedAt?: string }>(`data/v1/${file}`);
        const at = metadata?.capturedAt && Number.isFinite(Date.parse(metadata.capturedAt)) ? metadata.capturedAt : null;
        const age = at ? Math.round((now - Date.parse(at)) / 60_000) : null;
        return { file, capturedAt: at, ageMinutes: age, expectedEveryMinutes: Math.round(every / 60_000), savedOnChange: onChange, late: age == null || age * 60_000 > lateAfter };
      } catch {
        return { file, capturedAt: null, ageMinutes: null, expectedEveryMinutes: Math.round(every / 60_000), savedOnChange: onChange, late: true };
      }
    }),
  );
  const partners = await partnerRows(env.DATA, now).catch(() => []);
  const body: Overview = { generatedAt: new Date(now).toISOString(), owner: gate.email, usage, usageError, data, partners, service: { ...deps.service, counting: Boolean(env.STATS) } };
  return gate.reply(200, body);
}

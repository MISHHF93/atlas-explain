/**
 * The owner's admin view of connector usage (docs/ADMIN.md). GET /admin/stats answers only to a Firebase
 * sign-in (the web app's own Google or email-link sign-in) whose verified email is in the ADMIN_EMAILS
 * Worker secret. No password exists; the email list is never in the code or the website.
 */
import { EXPLAIN_WEB_ALT_URL, EXPLAIN_WEB_URL } from "../core/links";
import { readSummary, type StatsNamespace } from "./stats";

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

/** GET /admin/stats?days=30 with "Authorization: Bearer <Firebase ID token>". */
export async function handleAdminStats(request: Request, env: AdminEnv, keys: KeyFetcher = googleKeys, now: number = Date.now()): Promise<Response> {
  const origin = request.headers.get("Origin");
  const headers = { ...cors(origin), "Cache-Control": "no-store" };
  const reply = (status: number, body: unknown) => Response.json(body, { status, headers });
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "GET") return reply(405, { error: "Method not allowed" });
  if (!originOk(origin)) return reply(403, { error: "Not allowed" });
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
  if (!token) return reply(401, { error: "Sign in first" });
  const who = await verifyFirebaseToken(token, keys, now);
  if (!who || !allowedEmails(env.ADMIN_EMAILS).has(who.email)) return reply(403, { error: "Not allowed" });
  if (!env.STATS) return reply(503, { error: "Counting isn't set up on this Worker" });
  const days = Math.min(400, Math.max(1, Number(new URL(request.url).searchParams.get("days")) || 30));
  try {
    return reply(200, await readSummary(env.STATS, days));
  } catch {
    return reply(503, { error: "The counts couldn't be read right now" });
  }
}

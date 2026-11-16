/**
 * Stripe → Pro, on the connector's Worker (docs/MONETIZATION.md, phase 2). Stripe sends webhooks
 * to POST /billing/v1/stripe; this checks Stripe's signature, then writes or deletes the account's
 * plan document (users/{uid}/plan/current) in Firestore through the REST API, using a Google
 * service account. Pro is on as soon as Stripe confirms the payment.
 *
 * Rules: verify before anything else; every write is the subscription's current state fetched
 * from Stripe, so retries and out-of-order events change nothing; any failure answers 500 so
 * Stripe retries, and a failure never removes a plan. No card or address data is read or stored.
 *
 * Needs three Worker secrets (npx wrangler secret put …): STRIPE_WEBHOOK_SECRET (whsec_…),
 * STRIPE_RESTRICTED_KEY (rk_…, read only on Checkout Sessions and Subscriptions) and
 * FIREBASE_SERVICE_ACCOUNT (JSON, role Cloud Datastore User). Without them it answers 503.
 */
import { isAccountUid, planFields, planFromFields, planFromSubscription, sessionSubscriptionId, type FsFields, type StripeSession, type StripeSubscription } from "../core/billing-sync";

export const STRIPE_WEBHOOK_PATH = "/billing/v1/stripe";
/** How old a signed request may be (Stripe's own default). */
export const SIGNATURE_TOLERANCE_S = 300;
const STRIPE_API = "https://api.stripe.com/v1";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface BillingEnv {
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_RESTRICTED_KEY?: string;
  FIREBASE_SERVICE_ACCOUNT?: string;
  /** The Worker's KV store: subscription id → account id. */
  DATA: { get(key: string): Promise<string | null>; put(key: string, value: string): Promise<void> };
}

export interface BillingDeps {
  fetch: typeof fetch;
  /** Milliseconds since the epoch. */
  now: () => number;
  log: (line: string) => void;
}

const defaultDeps = (): BillingDeps => ({ fetch: (input, init) => fetch(input, init), now: () => Date.now(), log: (line) => console.log(line) });
const SUB_KEY = (subId: string) => `billing/v1/sub/${subId}`;
const json = (status: number, body: Record<string, unknown>) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

/* ---------- Stripe's signature ---------- */

const enc = new TextEncoder();
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");

/** Compares two strings in time that does not depend on where they differ. */
function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Stripe-Signature "t=…,v1=…[,v1=…]": HMAC-SHA256 of "t.body" with the endpoint's secret. */
export async function verifyStripeSignature(body: string, header: string | null, secret: string, nowS: number, toleranceS = SIGNATURE_TOLERANCE_S): Promise<boolean> {
  if (!header) return false;
  const parts = header.split(",").map((p) => p.trim().split("=") as [string, string]);
  const t = Number(parts.find(([k]) => k === "t")?.[1]);
  const signatures = parts.filter(([k, v]) => k === "v1" && typeof v === "string").map(([, v]) => v);
  if (!Number.isFinite(t) || !signatures.length || Math.abs(nowS - t) > toleranceS) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`)));
  return signatures.some((s) => sameText(s, expected));
}

/* ---------- Google service account → access token ---------- */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

export function readServiceAccount(raw: string): ServiceAccount | null {
  try {
    const a = JSON.parse(raw) as Partial<ServiceAccount>;
    return a.project_id && a.client_email && a.private_key ? (a as ServiceAccount) : null;
  } catch {
    return null;
  }
}

const b64url = (bytes: Uint8Array | string) => {
  const b = typeof bytes === "string" ? enc.encode(bytes) : bytes;
  let s = "";
  for (const byte of b) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function pemToDer(pem: string): ArrayBuffer {
  const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\\n/g, "").replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** One token per Worker instance, reused until a minute before it expires. */
let cachedToken: { token: string; until: number; email: string } | null = null;
export function clearTokenCacheForTests(): void {
  cachedToken = null;
}

async function accessToken(account: ServiceAccount, deps: BillingDeps): Promise<string> {
  const nowMs = deps.now();
  if (cachedToken && cachedToken.email === account.client_email && cachedToken.until > nowMs) return cachedToken.token;
  const iat = Math.floor(nowMs / 1000);
  const unsigned = `${b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${b64url(JSON.stringify({
    iss: account.client_email, scope: "https://www.googleapis.com/auth/datastore", aud: GOOGLE_TOKEN_URL, iat, exp: iat + 3600,
  }))}`;
  const key = await crypto.subtle.importKey("pkcs8", pemToDer(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned)));
  const res = await deps.fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(signature)}` }).toString(),
  });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !body.access_token) throw new Error(`Google sign-in for the service account answered ${res.status}`);
  cachedToken = { token: body.access_token, until: nowMs + Math.max(60, (body.expires_in ?? 3600) - 60) * 1000, email: account.client_email };
  return body.access_token;
}

/* ---------- Stripe and Firestore calls ---------- */

async function stripeSubscription(id: string, key: string, deps: BillingDeps): Promise<StripeSubscription> {
  const res = await deps.fetch(`${STRIPE_API}/subscriptions/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Stripe answered ${res.status} for the subscription`);
  return (await res.json()) as StripeSubscription;
}

interface Firestore {
  doc: (uid: string) => string;
  auth: Record<string, string>;
}

async function firestore(account: ServiceAccount, deps: BillingDeps): Promise<Firestore> {
  const base = `https://firestore.googleapis.com/v1/projects/${account.project_id}/databases/(default)/documents`;
  return { doc: (uid) => `${base}/users/${uid}/plan/current`, auth: { Authorization: `Bearer ${await accessToken(account, deps)}` } };
}

async function storedPlanSubscription(fs: Firestore, uid: string, deps: BillingDeps): Promise<string | null> {
  const res = await deps.fetch(fs.doc(uid), { headers: fs.auth });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore answered ${res.status} reading the plan`);
  const doc = (await res.json()) as { fields?: FsFields };
  return planFromFields(doc.fields)?.subscriptionId ?? null;
}

/** Writes the subscription's current plan, or removes it when the subscription no longer pays for Pro. */
async function applySubscription(uid: string, sub: StripeSubscription, fs: Firestore, deps: BillingDeps): Promise<string> {
  const record = planFromSubscription(sub);
  if (record) {
    const res = await deps.fetch(fs.doc(uid), { method: "PATCH", headers: { ...fs.auth, "Content-Type": "application/json" }, body: JSON.stringify({ fields: planFields(record, new Date(deps.now())) }) });
    if (!res.ok) throw new Error(`Firestore answered ${res.status} writing the plan`);
    return `pro (${sub.status})`;
  }
  return removePlan(uid, sub.id, fs, deps);
}

/** Deletes the plan only if it belongs to this subscription, so ending an old one never removes a newer one. */
async function removePlan(uid: string, subId: string, fs: Firestore, deps: BillingDeps): Promise<string> {
  const held = await storedPlanSubscription(fs, uid, deps);
  if (held !== subId) return held ? "kept (another subscription)" : "already free";
  const res = await deps.fetch(fs.doc(uid), { method: "DELETE", headers: fs.auth });
  if (!res.ok && res.status !== 404) throw new Error(`Firestore answered ${res.status} removing the plan`);
  return "free";
}

/* ---------- the webhook ---------- */

interface StripeEvent {
  id?: string;
  type?: string;
  data?: { object?: Record<string, unknown> };
}

export async function handleStripeWebhook(request: Request, env: BillingEnv, deps: BillingDeps = defaultDeps()): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "POST" } });
  const secret = env.STRIPE_WEBHOOK_SECRET?.trim();
  const key = env.STRIPE_RESTRICTED_KEY?.trim();
  const account = env.FIREBASE_SERVICE_ACCOUNT ? readServiceAccount(env.FIREBASE_SERVICE_ACCOUNT) : null;
  if (!secret || !key || !account) return json(503, { error: "Billing isn't set up on this server." });

  const body = await request.text();
  if (!(await verifyStripeSignature(body, request.headers.get("Stripe-Signature"), secret, Math.floor(deps.now() / 1000)))) {
    return json(400, { error: "Invalid signature." });
  }
  let event: StripeEvent;
  try {
    event = JSON.parse(body) as StripeEvent;
  } catch {
    return json(400, { error: "Invalid JSON." });
  }
  const object = event.data?.object ?? {};
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = object as StripeSession & { mode?: string };
        const uid = session.client_reference_id;
        const subId = sessionSubscriptionId(session);
        if (session.mode !== "subscription" || !subId || !isAccountUid(uid)) return json(200, { received: true, ignored: "not a subscription for an account" });
        await env.DATA.put(SUB_KEY(subId), uid);
        const fs = await firestore(account, deps);
        const outcome = await applySubscription(uid, await stripeSubscription(subId, key, deps), fs, deps);
        deps.log(`billing ${event.id}: checkout for ${uid}: ${outcome}`);
        return json(200, { received: true });
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subId = typeof object.id === "string" ? object.id : "";
        const uid = subId ? await env.DATA.get(SUB_KEY(subId)) : null;
        // A subscription not started through our checkout (or whose checkout event is still on its way:
        // that event writes the current state itself).
        if (!isAccountUid(uid)) return json(200, { received: true, ignored: "unknown subscription" });
        const fs = await firestore(account, deps);
        const outcome = event.type === "customer.subscription.deleted"
          ? await removePlan(uid, subId, fs, deps)
          : await applySubscription(uid, await stripeSubscription(subId, key, deps), fs, deps);
        deps.log(`billing ${event.id}: ${event.type} for ${uid}: ${outcome}`);
        return json(200, { received: true });
      }
      default:
        return json(200, { received: true, ignored: event.type ?? "no type" });
    }
  } catch (err) {
    // Stripe retries a 500 for up to three days; nothing was removed.
    deps.log(`billing ${event.id}: ${event.type} failed: ${err instanceof Error ? err.message : String(err)}`);
    return json(500, { error: "Couldn't apply the event; Stripe will retry." });
  }
}

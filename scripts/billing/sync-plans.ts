/**
 * Plan sync: reads who has a paid subscription from Stripe and writes that to Firestore, so
 * the app can show Pro. It runs on a schedule in GitHub Actions (.github/workflows/billing-sync.yml)
 * because the project is on Firebase's free plan, which has no server functions for a Stripe webhook.
 *
 * Uses only Node built-ins and the repo's own TypeScript: no npm install.
 *
 * Secrets, from the environment only (never committed, never printed):
 *   STRIPE_RESTRICTED_KEY     a read-only restricted key: Checkout Sessions (read), Subscriptions (read)
 *   FIREBASE_SERVICE_ACCOUNT  service-account JSON with the "Cloud Datastore User" role
 *
 * DRY_RUN=1 reads everything and reports what it would change, without writing.
 *
 * Safety: if any read from Stripe or Firestore fails, the job stops before writing anything,
 * so an outage can never switch a paying account back to Free.
 */
import { createSign } from "node:crypto";
import { planChanges, plansFromStripe, type PlanRecord, type StripeSession, type StripeSubscription } from "../../src/core/billing-sync.ts";

const TIMEOUT_MS = 30_000;
const DRY_RUN = process.env.DRY_RUN === "1";

function fail(message: string): never {
  throw new Error(message);
}

async function getJson(url: string, init: RequestInit, what: string): Promise<unknown> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  // Response bodies are not logged: they can carry customer details.
  if (!res.ok) throw new Error(`${what} failed with HTTP ${res.status}`);
  return res.json();
}

/* ---------- Stripe (read only) ---------- */

async function stripeList<T extends { id?: string }>(path: string, key: string, what: string): Promise<T[]> {
  const out: T[] = [];
  let after = "";
  for (let page = 0; page < 500; page += 1) {
    const url = `https://api.stripe.com/v1/${path}${path.includes("?") ? "&" : "?"}limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`;
    const body = (await getJson(url, { headers: { Authorization: `Bearer ${key}` } }, what)) as { data?: T[]; has_more?: boolean };
    const data = Array.isArray(body.data) ? body.data : [];
    out.push(...data);
    const last = data.at(-1)?.id;
    if (!body.has_more || !last) return out;
    after = last;
  }
  throw new Error(`${what} did not finish after 500 pages`);
}

/* ---------- Firestore (REST, with a service-account token) ---------- */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function readServiceAccount(raw: string): ServiceAccount {
  let parsed: Partial<ServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<ServiceAccount>;
  } catch {
    fail("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
  }
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) fail("FIREBASE_SERVICE_ACCOUNT is missing project_id, client_email or private_key.");
  return parsed as ServiceAccount;
}

const b64url = (value: string | Buffer): string => Buffer.from(value).toString("base64url");

async function accessToken(account: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 600,
  }));
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key, "base64url");
  const body = (await getJson("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${signature}` }),
  }, "Google sign-in for the service account")) as { access_token?: string };
  if (!body.access_token) throw new Error("Google sign-in for the service account returned no token");
  return body.access_token;
}

type FsValue = { stringValue?: string; booleanValue?: boolean; timestampValue?: string; nullValue?: null };
type FsFields = Record<string, FsValue>;

function toFields(record: PlanRecord, now: Date): FsFields {
  return {
    plan: { stringValue: record.plan },
    status: { stringValue: record.status },
    subscriptionId: { stringValue: record.subscriptionId },
    interval: { stringValue: record.interval },
    cancelAtPeriodEnd: { booleanValue: record.cancelAtPeriodEnd },
    currentPeriodEnd: record.currentPeriodEndMs === null ? { nullValue: null } : { timestampValue: new Date(record.currentPeriodEndMs).toISOString() },
    updatedAt: { timestampValue: now.toISOString() },
  };
}

/** A stored document back as a PlanRecord, or null when it is not one this job wrote (it is then rewritten). */
function fromFields(fields: FsFields | undefined): PlanRecord | null {
  const interval = fields?.interval?.stringValue;
  const end = fields?.currentPeriodEnd?.timestampValue;
  if (fields?.plan?.stringValue !== "pro" || !fields.status?.stringValue || !fields.subscriptionId?.stringValue) return null;
  if (interval !== "month" && interval !== "year" && interval !== "other") return null;
  return {
    plan: "pro",
    status: fields.status.stringValue,
    subscriptionId: fields.subscriptionId.stringValue,
    interval,
    cancelAtPeriodEnd: fields.cancelAtPeriodEnd?.booleanValue === true,
    currentPeriodEndMs: end ? Date.parse(end) : null,
  };
}

const PLAN_DOC = /\/documents\/users\/([A-Za-z0-9]{1,128})\/plan\/current$/;

/** Every plan document that exists. They exist only for paying accounts, so this stays small. */
async function storedPlans(base: string, auth: Record<string, string>): Promise<Map<string, PlanRecord | null>> {
  const rows = (await getJson(`${base}:runQuery`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "plan", allDescendants: true }] } }),
  }, "Reading stored plans from Firestore")) as Array<{ document?: { name: string; fields?: FsFields } }>;
  const stored = new Map<string, PlanRecord | null>();
  for (const row of rows) {
    const uid = row.document ? PLAN_DOC.exec(row.document.name)?.[1] : undefined;
    if (uid && row.document) stored.set(uid, fromFields(row.document.fields));
  }
  return stored;
}

/* ---------- main ---------- */

async function main(): Promise<void> {
  const stripeKey = process.env.STRIPE_RESTRICTED_KEY?.trim();
  const rawAccount = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!stripeKey) fail("STRIPE_RESTRICTED_KEY is not set. Add it as a GitHub Actions secret (docs/MONETIZATION.md).");
  if (!/^rk_(test|live)_/.test(stripeKey)) fail("STRIPE_RESTRICTED_KEY must be a restricted key (rk_...), not a secret key. This job only needs read access.");
  if (!rawAccount) fail("FIREBASE_SERVICE_ACCOUNT is not set.");
  const account = readServiceAccount(rawAccount);

  const [sessions, subscriptions] = await Promise.all([
    stripeList<StripeSession & { id?: string }>("checkout/sessions?status=complete", stripeKey, "Reading Checkout Sessions from Stripe"),
    stripeList<StripeSubscription>("subscriptions?status=all", stripeKey, "Reading subscriptions from Stripe"),
  ]);
  const wanted = plansFromStripe(sessions, subscriptions);

  const base = `https://firestore.googleapis.com/v1/projects/${account.project_id}/databases/(default)/documents`;
  const auth = { Authorization: `Bearer ${await accessToken(account)}` };
  const stored = await storedPlans(base, auth);
  const changes = planChanges(wanted, stored);

  const mode = stripeKey.startsWith("rk_test_") ? "Stripe test mode" : "Stripe live mode";
  console.log(`${mode}: ${wanted.size} paying account(s). To write: ${changes.write.length}. To remove: ${changes.remove.length}. Unchanged: ${changes.unchanged}.`);
  if (DRY_RUN) {
    console.log("DRY_RUN=1: nothing was written.");
    return;
  }

  const now = new Date();
  for (const { uid, record } of changes.write) {
    await getJson(`${base}/users/${uid}/plan/current`, {
      method: "PATCH",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: toFields(record, now) }),
    }, "Writing a plan to Firestore");
  }
  for (const uid of changes.remove) {
    const res = await fetch(`${base}/users/${uid}/plan/current`, { method: "DELETE", headers: auth, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Removing an ended plan from Firestore failed with HTTP ${res.status}`);
  }
  console.log("Plans are in sync.");
}

main().catch((error: unknown) => {
  console.error(`::error::${error instanceof Error ? error.message : "Plan sync failed."}`);
  process.exitCode = 1;
});

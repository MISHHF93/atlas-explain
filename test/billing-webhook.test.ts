import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTokenCacheForTests, handleStripeWebhook, STRIPE_WEBHOOK_PATH, verifyStripeSignature, type BillingDeps, type BillingEnv } from "../src/mcp/billing-webhook";
import worker from "../src/mcp/worker";

const SECRET = "whsec_test_atlas";
const NOW = Date.parse("2026-11-16T22:30:00Z");
const NOW_S = Math.floor(NOW / 1000);
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

/** Signs a body the way Stripe does: HMAC-SHA256 of "t.body" with the endpoint secret. */
async function sign(body: string, t = NOW_S, secret = SECRET): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `t=${t},v1=${hex(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`)))}`;
}

let serviceAccount = "";
beforeAll(async () => {
  // A real RSA key, so the Google token step signs a real JWT.
  const pair = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const der = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64").replace(/(.{64})/g, "$1\n")}\n-----END PRIVATE KEY-----\n`;
  serviceAccount = JSON.stringify({ project_id: "atlas-explain", client_email: "billing@atlas-explain.iam.gserviceaccount.com", private_key: pem });
});
beforeEach(() => clearTokenCacheForTests());

const sub = (id: string, status: string, interval = "month") => ({ id, status, cancel_at_period_end: false, items: { data: [{ current_period_end: NOW_S + 30 * 86_400, price: { recurring: { interval } } }] } });

/** Stand-ins for Stripe, Google and Firestore that record every call. */
function world(opts: { subs?: Record<string, ReturnType<typeof sub>>; storedPlanSub?: string | null; firestoreDown?: boolean } = {}) {
  const calls: { method: string; url: string; body?: string }[] = [];
  const kv = new Map<string, string>();
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: typeof init?.body === "string" ? init.body : undefined });
    if (url === "https://oauth2.googleapis.com/token") {
      const assertion = new URLSearchParams(String(init?.body)).get("assertion") ?? "";
      expect(assertion.split(".")).toHaveLength(3);
      return new Response(JSON.stringify({ access_token: "ya29.test", expires_in: 3600 }));
    }
    if (url.startsWith("https://api.stripe.com/v1/subscriptions/")) {
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer rk_test_readonly");
      const s = opts.subs?.[url.split("/").pop()!];
      return s ? new Response(JSON.stringify(s)) : new Response("{}", { status: 404 });
    }
    if (url.startsWith("https://firestore.googleapis.com/")) {
      if (opts.firestoreDown) return new Response("down", { status: 503 });
      if (method === "GET") {
        return opts.storedPlanSub
          ? new Response(JSON.stringify({ fields: { plan: { stringValue: "pro" }, status: { stringValue: "active" }, subscriptionId: { stringValue: opts.storedPlanSub }, interval: { stringValue: "month" } } }))
          : new Response("{}", { status: 404 });
      }
      return new Response("{}");
    }
    throw new Error(`unexpected ${method} ${url}`);
  }) as typeof fetch;
  const env: BillingEnv = {
    STRIPE_WEBHOOK_SECRET: SECRET,
    STRIPE_RESTRICTED_KEY: "rk_test_readonly",
    FIREBASE_SERVICE_ACCOUNT: serviceAccount,
    DATA: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) },
  };
  const logs: string[] = [];
  const deps: BillingDeps = { fetch: fetcher, now: () => NOW, log: (l) => logs.push(l) };
  return { calls, kv, env, deps, logs };
}

async function deliver(w: ReturnType<typeof world>, event: Record<string, unknown>, signature?: string): Promise<Response> {
  const body = JSON.stringify(event);
  const req = new Request(`https://atlas-explain-mcp.atlas-explain.workers.dev${STRIPE_WEBHOOK_PATH}`, { method: "POST", body, headers: { "Stripe-Signature": signature ?? (await sign(body)) } });
  return handleStripeWebhook(req, w.env, w.deps);
}
const firestoreWrites = (w: ReturnType<typeof world>) => w.calls.filter((c) => c.url.startsWith("https://firestore") && c.method !== "GET");

const checkout = (uid: string | null, subscription = "sub_1", mode = "subscription") => ({ id: "evt_1", type: "checkout.session.completed", data: { object: { client_reference_id: uid, subscription, mode, status: "complete" } } });

describe("Stripe's signature", () => {
  it("accepts Stripe's format and rejects a wrong secret, a changed body or an old timestamp", async () => {
    const body = '{"id":"evt_1"}';
    expect(await verifyStripeSignature(body, await sign(body), SECRET, NOW_S)).toBe(true);
    // Several v1 values are allowed while a secret is being rolled.
    expect(await verifyStripeSignature(body, `${await sign(body)},v1=deadbeef`, SECRET, NOW_S)).toBe(true);
    expect(await verifyStripeSignature(body, await sign(body, NOW_S, "whsec_other"), SECRET, NOW_S)).toBe(false);
    expect(await verifyStripeSignature('{"id":"evt_2"}', await sign(body), SECRET, NOW_S)).toBe(false);
    expect(await verifyStripeSignature(body, await sign(body, NOW_S - 600), SECRET, NOW_S)).toBe(false);
    expect(await verifyStripeSignature(body, null, SECRET, NOW_S)).toBe(false);
  });

  it("reads and writes nothing for an unsigned or badly signed request", async () => {
    const w = world({ subs: { sub_1: sub("sub_1", "active") } });
    const res = await deliver(w, checkout("Alice1"), "t=1,v1=00");
    expect(res.status).toBe(400);
    expect(w.calls).toHaveLength(0);
    expect(w.kv.size).toBe(0);
  });
});

describe("the webhook turns Pro on and off", () => {
  it("turns Pro on at checkout: remembers the subscription, reads it from Stripe, writes the plan", async () => {
    const w = world({ subs: { sub_1: sub("sub_1", "active", "year") } });
    const res = await deliver(w, checkout("Alice1"));
    expect(res.status).toBe(200);
    expect(w.kv.get("billing/v1/sub/sub_1")).toBe("Alice1");
    const [write] = firestoreWrites(w);
    expect(write!.method).toBe("PATCH");
    expect(write!.url).toBe("https://firestore.googleapis.com/v1/projects/atlas-explain/databases/(default)/documents/users/Alice1/plan/current");
    const fields = JSON.parse(write!.body!).fields;
    expect(fields).toMatchObject({ plan: { stringValue: "pro" }, status: { stringValue: "active" }, subscriptionId: { stringValue: "sub_1" }, interval: { stringValue: "year" } });
    expect(JSON.stringify(fields)).not.toMatch(/card|address|email/i);
  });

  it("is idempotent: the same event twice writes the same state", async () => {
    const w = world({ subs: { sub_1: sub("sub_1", "active") } });
    await deliver(w, checkout("Alice1"));
    await deliver(w, checkout("Alice1"));
    const bodies = firestoreWrites(w).map((c) => JSON.parse(c.body!).fields.status.stringValue);
    expect(bodies).toEqual(["active", "active"]);
  });

  it("follows updates with the subscription's current state, and keeps Pro while Stripe retries a card", async () => {
    const w = world({ subs: { sub_1: sub("sub_1", "past_due") } });
    w.kv.set("billing/v1/sub/sub_1", "Alice1");
    const res = await deliver(w, { id: "evt_2", type: "customer.subscription.updated", data: { object: { id: "sub_1", status: "active" } } });
    expect(res.status).toBe(200);
    // The event said active, but the state comes from Stripe itself.
    expect(JSON.parse(firestoreWrites(w)[0]!.body!).fields.status.stringValue).toBe("past_due");
  });

  it("removes Pro when the subscription ends, but never a newer subscription's plan", async () => {
    const ended = world({ storedPlanSub: "sub_1" });
    ended.kv.set("billing/v1/sub/sub_1", "Alice1");
    await deliver(ended, { id: "evt_3", type: "customer.subscription.deleted", data: { object: { id: "sub_1" } } });
    expect(firestoreWrites(ended).map((c) => c.method)).toEqual(["DELETE"]);

    const newer = world({ storedPlanSub: "sub_2" });
    newer.kv.set("billing/v1/sub/sub_1", "Alice1");
    await deliver(newer, { id: "evt_4", type: "customer.subscription.deleted", data: { object: { id: "sub_1" } } });
    expect(firestoreWrites(newer)).toHaveLength(0);
  });

  it("an update to a status that no longer pays removes the plan", async () => {
    const w = world({ subs: { sub_1: sub("sub_1", "unpaid") }, storedPlanSub: "sub_1" });
    w.kv.set("billing/v1/sub/sub_1", "Alice1");
    await deliver(w, { id: "evt_5", type: "customer.subscription.updated", data: { object: { id: "sub_1" } } });
    expect(firestoreWrites(w).map((c) => c.method)).toEqual(["DELETE"]);
  });

  it("ignores events it doesn't need, payments without an account, and unknown subscriptions", async () => {
    const w = world({ subs: { sub_1: sub("sub_1", "active") } });
    expect((await deliver(w, { id: "evt_6", type: "invoice.paid", data: { object: {} } })).status).toBe(200);
    expect((await deliver(w, checkout(null))).status).toBe(200);
    expect((await deliver(w, checkout("not a uid!"))).status).toBe(200);
    expect((await deliver(w, checkout("Alice1", "sub_1", "payment"))).status).toBe(200);
    expect((await deliver(w, { id: "evt_7", type: "customer.subscription.updated", data: { object: { id: "sub_9" } } })).status).toBe(200);
    expect(w.calls).toHaveLength(0);
  });

  it("answers 500 so Stripe retries when Firestore is down, and never removes a plan on an error", async () => {
    const w = world({ storedPlanSub: "sub_1", firestoreDown: true });
    w.kv.set("billing/v1/sub/sub_1", "Alice1");
    const res = await deliver(w, { id: "evt_8", type: "customer.subscription.deleted", data: { object: { id: "sub_1" } } });
    expect(res.status).toBe(500);
    expect(w.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(w.logs.join("\n")).toContain("failed");
  });

  it("answers 503 until the three secrets are set, and only accepts POST", async () => {
    const w = world();
    delete w.env.FIREBASE_SERVICE_ACCOUNT;
    expect((await deliver(w, checkout("Alice1"))).status).toBe(503);
    expect((await handleStripeWebhook(new Request(`https://x${STRIPE_WEBHOOK_PATH}`), w.env, w.deps)).status).toBe(405);
  });

  it("is routed by the Worker, which answers 503 while billing isn't set up", async () => {
    const DATA = { get: async () => null, getWithMetadata: async () => ({ value: null, metadata: null }), put: async () => undefined };
    const res = await worker.fetch(new Request(`https://atlas-explain-mcp.atlas-explain.workers.dev${STRIPE_WEBHOOK_PATH}`, { method: "POST", body: "{}" }), { DATA }, { waitUntil: () => undefined });
    expect(res.status).toBe(503);
  });
});

describe("the app and the webhook agree", () => {
  it("checkout copy promises what the webhook does: Pro on when Stripe confirms", () => {
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app).toContain("Pro turns on as soon as Stripe confirms the payment");
    expect(app).not.toContain("within about 15 minutes");
  });
});

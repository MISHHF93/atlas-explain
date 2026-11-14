/**
 * Firestore security rules, run against the real rules engine in the Firestore emulator.
 * Not part of `npm test` (it needs the emulator and Java 21). Run with `npm run test:rules`,
 * which wraps this in `firebase emulators:exec`; CI runs it on every push.
 */
import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
const today = new Date().toISOString().slice(0, 10);
const longAgo = "2025-01-15";

beforeAll(async () => {
  const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080").split(":");
  env = await initializeTestEnvironment({
    projectId: "demo-atlas-explain",
    firestore: { rules: readFileSync("firestore.rules", "utf8"), host, port: Number(port) },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => env.clearFirestore());

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });

describe("daily usage counters", () => {
  it("lets the owner start today's counter at 1 and add exactly one", async () => {
    const ref = doc(as("alice"), `users/alice/usage/${today}`);
    await assertFails(setDoc(ref, { cloudCalls: 2, date: today }));
    await assertSucceeds(setDoc(ref, { cloudCalls: 1, date: today }));
    await assertSucceeds(updateDoc(ref, { cloudCalls: 2 }));
    await assertFails(updateDoc(ref, { cloudCalls: 5 }));
    await assertFails(updateDoc(ref, { cloudCalls: 1 }));
  });

  it("never lets anyone delete today's counter, but lets the owner delete past days'", async () => {
    await seed(`users/alice/usage/${today}`, { cloudCalls: 3, date: today });
    await seed(`users/alice/usage/${longAgo}`, { cloudCalls: 9, date: longAgo });
    await assertFails(deleteDoc(doc(as("alice"), `users/alice/usage/${today}`)));
    await assertFails(deleteDoc(doc(as("bob"), `users/alice/usage/${longAgo}`)));
    await assertSucceeds(deleteDoc(doc(as("alice"), `users/alice/usage/${longAgo}`)));
  });

  it("keeps counters private to their owner", async () => {
    await seed(`users/alice/usage/${today}`, { cloudCalls: 1, date: today });
    await assertFails(getDoc(doc(as("bob"), `users/alice/usage/${today}`)));
    await assertFails(getDoc(doc(anon(), `users/alice/usage/${today}`)));
    await assertSucceeds(getDoc(doc(as("alice"), `users/alice/usage/${today}`)));
  });
});

describe("settings and watchlist", () => {
  it("accepts only a known theme, with a server time, from the owner", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice/prefs/app"), { theme: "dark", updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as("alice"), "users/alice/prefs/app"), { theme: "neon", updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as("alice"), "users/alice/prefs/app"), { theme: "dark", updatedAt: serverTimestamp(), extra: 1 }));
    await assertFails(setDoc(doc(as("bob"), "users/alice/prefs/app"), { theme: "dark", updatedAt: serverTimestamp() }));
  });

  it("caps the watchlist at 50 and rejects other fields", async () => {
    const ref = doc(as("alice"), "users/alice/prefs/watchlist");
    await assertSucceeds(setDoc(ref, { ids: Array.from({ length: 50 }, (_, i) => `stock:US:S${i}`), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref, { ids: Array.from({ length: 51 }, (_, i) => `stock:US:S${i}`), updatedAt: serverTimestamp() }));
    await assertFails(setDoc(ref, { ids: [], updatedAt: serverTimestamp(), balance: 100 }));
    await assertFails(setDoc(ref, { ids: "crypto:BTC", updatedAt: serverTimestamp() }));
    await assertFails(setDoc(doc(as("bob"), "users/alice/prefs/watchlist"), { ids: [], updatedAt: serverTimestamp() }));
  });

  it("lets the owner delete settings and the watchlist (account deletion)", async () => {
    await seed("users/alice/prefs/app", { theme: "dark" });
    await seed("users/alice/prefs/watchlist", { ids: [] });
    await assertFails(deleteDoc(doc(as("bob"), "users/alice/prefs/app")));
    await assertSucceeds(deleteDoc(doc(as("alice"), "users/alice/prefs/app")));
    await assertSucceeds(deleteDoc(doc(as("alice"), "users/alice/prefs/watchlist")));
  });
});

describe("saved explanations", () => {
  const valid = { symbol: "NVDA", movePct: -6, summary: "A plain summary.", inferenceSource: "on_device", buyerReasons: [], sellerReasons: [], whatWouldChange: "More data." };

  it("accepts a well-formed explanation from its owner and never stores private notes", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice/explanations/e1"), valid));
    await assertFails(setDoc(doc(as("alice"), "users/alice/explanations/e2"), { ...valid, notes: "my private note" }));
    await assertFails(setDoc(doc(as("alice"), "users/alice/explanations/e3"), { ...valid, symbol: "" }));
    await assertFails(setDoc(doc(as("bob"), "users/alice/explanations/e4"), valid));
  });

  it("lets only the owner read and delete them", async () => {
    await seed("users/alice/explanations/e1", valid);
    await assertFails(getDoc(doc(as("bob"), "users/alice/explanations/e1")));
    await assertSucceeds(getDoc(doc(as("alice"), "users/alice/explanations/e1")));
    await assertSucceeds(deleteDoc(doc(as("alice"), "users/alice/explanations/e1")));
  });
});

describe("payments (Stripe extension collections)", () => {
  it("lets a user start a subscription checkout but never write a subscription or payment", async () => {
    await assertSucceeds(setDoc(doc(as("alice"), "customers/alice/checkout_sessions/s1"), { price: "price_123", success_url: "https://atlas-explain.web.app/app", cancel_url: "https://atlas-explain.web.app/app", mode: "subscription" }));
    await assertFails(setDoc(doc(as("alice"), "customers/alice/checkout_sessions/s2"), { price: "price_123", success_url: "https://atlas-explain.web.app/app", cancel_url: "https://atlas-explain.web.app/app", mode: "payment" }));
    await assertFails(setDoc(doc(as("alice"), "customers/alice/subscriptions/sub1"), { status: "active" }));
    await assertFails(setDoc(doc(as("alice"), "customers/alice/payments/p1"), { amount: 1 }));
    await assertFails(setDoc(doc(as("bob"), "customers/alice/checkout_sessions/s3"), { price: "price_123", success_url: "https://x.example", cancel_url: "https://x.example", mode: "subscription" }));
  });
});

describe("everything else", () => {
  it("is closed by default", async () => {
    await assertFails(getDoc(doc(as("alice"), "admin/settings")));
    await assertFails(setDoc(doc(as("alice"), "users/alice/secrets/x"), { a: 1 }));
    await assertFails(getDoc(doc(anon(), "users/alice")));
  });
});

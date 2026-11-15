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

  it("stores only the fields the app writes, within size caps, and is never edited", async () => {
    await assertFails(setDoc(doc(as("alice"), "users/alice/explanations/e5"), { ...valid, anything: "x".repeat(500_000) }));
    await assertFails(setDoc(doc(as("alice"), "users/alice/explanations/e6"), { ...valid, buyerReasons: Array(13).fill("a") }));
    await assertFails(setDoc(doc(as("alice"), "users/alice/explanations/e7"), { ...valid, cardJson: "x".repeat(100_000) }));
    await assertSucceeds(setDoc(doc(as("alice"), "users/alice/explanations/e8"), { ...valid, question: "What moved?", cardJson: "{}", headlineTopics: [] }));
    await seed("users/alice/explanations/e9", valid);
    await assertFails(updateDoc(doc(as("alice"), "users/alice/explanations/e9"), { summary: "Edited." }));
  });

  it("lets only the owner read and delete them", async () => {
    await seed("users/alice/explanations/e1", valid);
    await assertFails(getDoc(doc(as("bob"), "users/alice/explanations/e1")));
    await assertSucceeds(getDoc(doc(as("alice"), "users/alice/explanations/e1")));
    await assertSucceeds(deleteDoc(doc(as("alice"), "users/alice/explanations/e1")));
  });
});

describe("the paid plan", () => {
  it("lets an account read its own plan and never write or delete it", async () => {
    await seed("users/alice/plan/current", { plan: "pro", status: "active" });
    await assertSucceeds(getDoc(doc(as("alice"), "users/alice/plan/current")));
    await assertFails(getDoc(doc(as("bob"), "users/alice/plan/current")));
    await assertFails(getDoc(doc(anon(), "users/alice/plan/current")));
    await assertFails(setDoc(doc(as("alice"), "users/alice/plan/current"), { plan: "pro", status: "active" }));
    await assertFails(setDoc(doc(as("bob"), "users/bob/plan/current"), { plan: "pro" }));
    await assertFails(updateDoc(doc(as("alice"), "users/alice/plan/current"), { status: "trialing" }));
    await assertFails(deleteDoc(doc(as("alice"), "users/alice/plan/current")));
  });
});

describe("everything else", () => {
  it("is closed by default", async () => {
    await assertFails(getDoc(doc(as("alice"), "admin/settings")));
    await assertFails(setDoc(doc(as("alice"), "users/alice/secrets/x"), { a: 1 }));
    await assertFails(getDoc(doc(anon(), "users/alice")));
  });
});

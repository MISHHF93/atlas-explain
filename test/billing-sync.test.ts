import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planChanges, plansFromStripe, type PlanRecord, type StripeSession, type StripeSubscription } from "../src/core/billing-sync";

const sub = (id: string, status: string, over: Partial<StripeSubscription> = {}): StripeSubscription => ({
  id,
  status,
  cancel_at_period_end: false,
  items: { data: [{ current_period_end: 1_800_000_000, price: { recurring: { interval: "month" } } }] },
  ...over,
});
const session = (uid: string | null, subscription: string | null, status = "complete"): StripeSession => ({ client_reference_id: uid, subscription, status });

describe("plans from Stripe records", () => {
  it("gives Pro to the account that paid, with the period Stripe reports", () => {
    const plans = plansFromStripe([session("Alice1", "sub_1")], [sub("sub_1", "active")]);
    expect(plans.get("Alice1")).toEqual({
      plan: "pro",
      status: "active",
      subscriptionId: "sub_1",
      interval: "month",
      cancelAtPeriodEnd: false,
      currentPeriodEndMs: 1_800_000_000_000,
    });
  });

  it("keeps Pro on during a trial or a card retry, and ends it when Stripe ends the subscription", () => {
    const sessions = [session("A1", "sub_a"), session("B1", "sub_b"), session("C1", "sub_c"), session("D1", "sub_d"), session("E1", "sub_e")];
    const subs = [sub("sub_a", "trialing"), sub("sub_b", "past_due"), sub("sub_c", "canceled"), sub("sub_d", "unpaid"), sub("sub_e", "incomplete")];
    expect([...plansFromStripe(sessions, subs).keys()]).toEqual(["A1", "B1"]);
  });

  it("ignores payments it cannot tie to an account", () => {
    const subs = [sub("sub_1", "active")];
    expect(plansFromStripe([session(null, "sub_1")], subs).size).toBe(0);
    expect(plansFromStripe([session("not a uid!", "sub_1")], subs).size).toBe(0);
    expect(plansFromStripe([session("Alice1", "sub_1", "open")], subs).size).toBe(0);
    expect(plansFromStripe([session("Alice1", "sub_missing")], subs).size).toBe(0);
    expect(plansFromStripe([session("Alice1", null)], subs).size).toBe(0);
  });

  it("reads the period end from older API versions and the yearly interval", () => {
    const yearly = sub("sub_y", "active", { current_period_end: 1_900_000_000, cancel_at_period_end: true, items: { data: [{ price: { recurring: { interval: "year" } } }] } });
    const expanded: StripeSession = { client_reference_id: "Alice1", subscription: { id: "sub_y" }, status: "complete" };
    expect(plansFromStripe([expanded], [yearly]).get("Alice1")).toMatchObject({ interval: "year", cancelAtPeriodEnd: true, currentPeriodEndMs: 1_900_000_000_000 });
  });

  it("keeps the longest-running plan when an account subscribed twice", () => {
    const plans = plansFromStripe(
      [session("Alice1", "sub_short"), session("Alice1", "sub_long")],
      [sub("sub_short", "active"), sub("sub_long", "active", { current_period_end: 1_950_000_000 })],
    );
    expect(plans.get("Alice1")?.subscriptionId).toBe("sub_long");
  });
});

describe("what the sync job writes", () => {
  const record = (over: Partial<PlanRecord> = {}): PlanRecord => ({ plan: "pro", status: "active", subscriptionId: "sub_1", interval: "month", cancelAtPeriodEnd: false, currentPeriodEndMs: 1, ...over });

  it("writes nothing when nothing changed", () => {
    expect(planChanges(new Map([["A1", record()]]), new Map([["A1", record()]]))).toEqual({ write: [], remove: [], unchanged: 1 });
  });

  it("writes new and changed plans, and removes ended ones", () => {
    const wanted = new Map([["New1", record()], ["Changed1", record({ cancelAtPeriodEnd: true })]]);
    const stored = new Map<string, PlanRecord | null>([["Changed1", record()], ["Ended1", record()], ["Odd1", null]]);
    const changes = planChanges(wanted, stored);
    expect(changes.write.map((w) => w.uid)).toEqual(["New1", "Changed1"]);
    expect(changes.remove).toEqual(["Ended1", "Odd1"]);
  });
});

describe("the sync job keeps secrets and customers safe", () => {
  const job = readFileSync("scripts/billing/sync-plans.ts", "utf8");
  const workflow = readFileSync(".github/workflows/billing-sync.yml", "utf8");

  it("takes keys only from the environment and accepts only a restricted Stripe key", () => {
    expect(job).toContain("process.env.STRIPE_RESTRICTED_KEY");
    expect(job).toContain("/^rk_(test|live)_/");
    expect(job + workflow).not.toMatch(/\b(sk|rk|pk|whsec)_(live|test)_[A-Za-z0-9]{8,}/);
    expect(workflow).toContain("${{ secrets.STRIPE_RESTRICTED_KEY }}");
  });

  it("only reads from Stripe", () => {
    expect(job).toContain("https://api.stripe.com/v1/");
    const stripeList = job.slice(job.indexOf("async function stripeList"), job.indexOf("/* ---------- Firestore"));
    expect(stripeList).not.toMatch(/method:/);
  });

  it("stays off until the owner switches it on", () => {
    expect(workflow).toContain("if: vars.BILLING_SYNC == 'on'");
  });
});

/**
 * Turns Stripe's records into the plan each account should have. Pure: no network, no
 * Firebase, and no imports, so the scheduled job (scripts/billing/sync-plans.ts) can run it
 * with plain Node. See docs/MONETIZATION.md.
 *
 * How an account is matched to a payment: the app opens the Stripe Payment Link with
 * `client_reference_id` set to the Firebase account id. Stripe stores that on the Checkout
 * Session, next to the subscription the payment created.
 */

/** The parts of a Stripe Checkout Session this job reads. */
export interface StripeSession {
  client_reference_id?: string | null;
  subscription?: string | { id?: string } | null;
  status?: string | null;
}

/** The parts of a Stripe Subscription this job reads. */
export interface StripeSubscription {
  id: string;
  status: string;
  cancel_at_period_end?: boolean | null;
  /** Older API versions put the period end here; newer ones put it on each item. */
  current_period_end?: number | null;
  items?: { data?: Array<{ current_period_end?: number | null; price?: { recurring?: { interval?: string | null } | null } | null }> } | null;
}

/** What is stored at users/{uid}/plan/current. The document exists only while the plan is paid for. */
export interface PlanRecord {
  plan: "pro";
  status: string;
  subscriptionId: string;
  interval: "month" | "year" | "other";
  cancelAtPeriodEnd: boolean;
  /** When the paid period ends or renews, in milliseconds; null when Stripe did not say. */
  currentPeriodEndMs: number | null;
}

/**
 * Statuses that keep Pro on. `past_due` stays on while Stripe retries the card, so a failed
 * renewal does not cut someone off mid-retry; Stripe ends the subscription itself if the retries fail.
 */
export const PAID_STATUSES: readonly string[] = ["active", "trialing", "past_due"];

/** Firebase Auth uids: letters and digits only. Anything else in client_reference_id is ignored. */
const ACCOUNT_UID = /^[A-Za-z0-9]{1,128}$/;

function periodEndMs(sub: StripeSubscription): number | null {
  const seconds = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
  return typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

function intervalOf(sub: StripeSubscription): PlanRecord["interval"] {
  const interval = sub.items?.data?.[0]?.price?.recurring?.interval;
  return interval === "month" || interval === "year" ? interval : "other";
}

/** The plan every paying account should have right now, keyed by account id. */
export function plansFromStripe(sessions: readonly StripeSession[], subscriptions: readonly StripeSubscription[]): Map<string, PlanRecord> {
  const byId = new Map(subscriptions.map((sub) => [sub.id, sub]));
  const plans = new Map<string, PlanRecord>();
  for (const session of sessions) {
    const uid = session.client_reference_id ?? "";
    if (session.status !== "complete" || !ACCOUNT_UID.test(uid)) continue;
    const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
    const sub = subId ? byId.get(subId) : undefined;
    if (!sub || !PAID_STATUSES.includes(sub.status)) continue;
    const record: PlanRecord = {
      plan: "pro",
      status: sub.status,
      subscriptionId: sub.id,
      interval: intervalOf(sub),
      cancelAtPeriodEnd: sub.cancel_at_period_end === true,
      currentPeriodEndMs: periodEndMs(sub),
    };
    // Someone who subscribed twice keeps the plan that runs longest.
    const held = plans.get(uid);
    if (!held || (record.currentPeriodEndMs ?? 0) > (held.currentPeriodEndMs ?? 0)) plans.set(uid, record);
  }
  return plans;
}

export function samePlan(a: PlanRecord, b: PlanRecord): boolean {
  return a.plan === b.plan
    && a.status === b.status
    && a.subscriptionId === b.subscriptionId
    && a.interval === b.interval
    && a.cancelAtPeriodEnd === b.cancelAtPeriodEnd
    && a.currentPeriodEndMs === b.currentPeriodEndMs;
}

export interface PlanChanges {
  /** Accounts whose plan document must be written (new or changed). */
  write: Array<{ uid: string; record: PlanRecord }>;
  /** Accounts whose plan ended: their plan document is deleted, which puts them back on Free. */
  remove: string[];
  unchanged: number;
}

/** Only differences are written, so a quiet run costs no Firestore writes. */
export function planChanges(wanted: ReadonlyMap<string, PlanRecord>, stored: ReadonlyMap<string, PlanRecord | null>): PlanChanges {
  const changes: PlanChanges = { write: [], remove: [], unchanged: 0 };
  for (const [uid, record] of wanted) {
    const held = stored.get(uid);
    if (held && samePlan(held, record)) changes.unchanged += 1;
    else changes.write.push({ uid, record });
  }
  for (const uid of stored.keys()) if (!wanted.has(uid)) changes.remove.push(uid);
  return changes;
}

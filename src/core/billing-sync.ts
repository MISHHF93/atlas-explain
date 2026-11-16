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

/** True for a Firebase Auth uid this code will write a plan for. */
export const isAccountUid = (uid: unknown): uid is string => typeof uid === "string" && ACCOUNT_UID.test(uid);

/** The subscription id a Checkout Session created, if any. */
export function sessionSubscriptionId(session: StripeSession): string | null {
  const id = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  return typeof id === "string" && id.startsWith("sub_") ? id : null;
}

/** The plan one subscription gives, or null when its status no longer pays for Pro. */
export function planFromSubscription(sub: StripeSubscription): PlanRecord | null {
  if (!PAID_STATUSES.includes(sub.status)) return null;
  return {
    plan: "pro",
    status: sub.status,
    subscriptionId: sub.id,
    interval: intervalOf(sub),
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
    currentPeriodEndMs: periodEndMs(sub),
  };
}

/** Firestore REST field values for a plan document (shared by the sync job and the Worker's webhook). */
export type FsValue = { stringValue?: string; booleanValue?: boolean; timestampValue?: string; nullValue?: null };
export type FsFields = Record<string, FsValue>;

export function planFields(record: PlanRecord, now: Date): FsFields {
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

/** A stored document back as a PlanRecord, or null when it is not one this code wrote. */
export function planFromFields(fields: FsFields | undefined): PlanRecord | null {
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

/** The plan every paying account should have right now, keyed by account id. */
export function plansFromStripe(sessions: readonly StripeSession[], subscriptions: readonly StripeSubscription[]): Map<string, PlanRecord> {
  const byId = new Map(subscriptions.map((sub) => [sub.id, sub]));
  const plans = new Map<string, PlanRecord>();
  for (const session of sessions) {
    const uid = session.client_reference_id ?? "";
    if (session.status !== "complete" || !ACCOUNT_UID.test(uid)) continue;
    const subId = sessionSubscriptionId(session);
    const sub = subId ? byId.get(subId) : undefined;
    const record = sub ? planFromSubscription(sub) : null;
    if (!record) continue;
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

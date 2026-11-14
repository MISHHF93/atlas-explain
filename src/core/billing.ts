import type { PathDecision } from "./types";

export type PlanId = "free" | "pro";

/** A numeric cap, or no cap. On-device explanations are always unlimited. */
export type Quota = number | "unlimited";

export interface Entitlements {
  /** Cloud fallback calls. On-device Gemini Nano is not counted here. */
  cloudExplanationsPerDay: Quota;
  watchlistSize: Quota;
  dailyBrief: boolean;
  extensionHighlightToExplain: boolean;
  onDeviceExplanations: "unlimited";
}

export const FREE_BADGE = "Free";
export const FREE_WATCHLIST_SIZE = 10;
/** Hard cap already enforced by move-card validation. */
export const WATCHLIST_HARD_CAP = 50;
/** Used when Remote Config has no `pro_cloud_daily_limit`. Sized for the free Gemini tier, not the 300 in docs/PRICING.md. */
export const DEFAULT_PRO_CLOUD_DAILY_LIMIT = 100;
/** Approved list prices (docs/PRICING.md). Stripe shows the amount actually charged, with tax. */
export const PRO_PRICE_LABELS = { monthly: "US$5.99 a month", yearly: "US$47.99 a year" } as const;
export type ProInterval = keyof typeof PRO_PRICE_LABELS;

export const PRO_ENTITLEMENTS: Entitlements = {
  cloudExplanationsPerDay: "unlimited",
  watchlistSize: "unlimited",
  dailyBrief: true,
  extensionHighlightToExplain: true,
  onDeviceExplanations: "unlimited",
};

export function freeEntitlements(freeCloudDailyLimit: number): Entitlements {
  return {
    cloudExplanationsPerDay: freeCloudDailyLimit,
    watchlistSize: FREE_WATCHLIST_SIZE,
    dailyBrief: false,
    // Highlight-to-explain is the core product and is free on every plan (docs/PRICING.md).
    extensionHighlightToExplain: true,
    onDeviceExplanations: "unlimited",
  };
}

export interface BillingInput {
  billingEnabled: boolean;
  plan: PlanId;
  freeCloudDailyLimit: number;
  /** Pro's printed fair-use cap. Never below the free cap. */
  proCloudDailyLimit?: number;
}

export function proCloudLimit(input: Pick<BillingInput, "freeCloudDailyLimit" | "proCloudDailyLimit">): number {
  return Math.max(input.freeCloudDailyLimit, input.proCloudDailyLimit ?? DEFAULT_PRO_CLOUD_DAILY_LIMIT);
}

/**
 * While billing is off, every plan receives Pro entitlements with no cloud cap.
 * Turning billing on meters both plans: Free at its daily limit, Pro at its higher printed limit.
 */
export function resolveEntitlements(input: BillingInput): Entitlements {
  if (!input.billingEnabled) return { ...PRO_ENTITLEMENTS };
  if (input.plan === "pro") return { ...PRO_ENTITLEMENTS, cloudExplanationsPerDay: proCloudLimit(input) };
  return freeEntitlements(input.freeCloudDailyLimit);
}

export function cloudCallsRemaining(input: BillingInput & { cloudCallsToday: number }): Quota {
  const cap = resolveEntitlements(input).cloudExplanationsPerDay;
  if (cap === "unlimited") return "unlimited";
  return Math.max(0, cap - Math.max(0, input.cloudCallsToday));
}

export function allowCloudCall(input: BillingInput & { cloudCallsToday: number }): boolean {
  const remaining = cloudCallsRemaining(input);
  return remaining === "unlimited" || remaining > 0;
}

export function watchlistFits(symbolCount: number, entitlements: Entitlements): boolean {
  const cap = entitlements.watchlistSize;
  if (cap === "unlimited") return symbolCount <= WATCHLIST_HARD_CAP;
  return symbolCount <= cap;
}

export interface BillingSnapshot {
  billingEnabled: boolean;
  plan: PlanId;
  cloudCallsToday: number;
  entitlements: Entitlements;
  pricing: PricingView;
  /** Stripe Payment Links for this account; null when signed out or a link is not set up. */
  checkout: Record<ProInterval, string | null>;
  /** Stripe's customer portal, where a subscriber changes or cancels the plan. */
  portalUrl: string | null;
}

export function billingSnapshot(
  input: BillingInput & { cloudCallsToday: number; links?: BillingLinks; accountUid?: string | null },
): BillingSnapshot {
  const links = input.links ?? NO_BILLING_LINKS;
  const uid = input.billingEnabled ? input.accountUid ?? null : null;
  return {
    checkout: {
      monthly: uid ? checkoutUrl(links.proMonthlyLink, uid) : null,
      yearly: uid ? checkoutUrl(links.proYearlyLink, uid) : null,
    },
    portalUrl: input.billingEnabled ? portalUrl(links.billingPortalLink) : null,
    billingEnabled: input.billingEnabled,
    plan: input.billingEnabled ? input.plan : "free",
    cloudCallsToday: input.cloudCallsToday,
    entitlements: resolveEntitlements(input),
    pricing: pricingView(input),
  };
}

export interface PricingView {
  badge: string;
  /** False while billing is off, and for a customer who is already Pro. */
  showCheckout: boolean;
  /** True for a subscriber, who gets a "Manage or cancel" control instead of checkout. */
  showManage: boolean;
  /** One plain line under the plan name. */
  note: string;
  rows: { label: string; free: string; pro: string }[];
}

export function pricingView(input: BillingInput): PricingView {
  const limit = input.freeCloudDailyLimit;
  return {
    badge: input.billingEnabled && input.plan === "pro" ? "Pro" : FREE_BADGE,
    showCheckout: input.billingEnabled && input.plan !== "pro",
    showManage: input.billingEnabled && input.plan === "pro",
    note: input.billingEnabled
      ? "Answers on your device are unlimited on every plan."
      : "Everything is included. Answers on your device are always unlimited.",
    // While billing is off there is nothing to compare, so the table is not shown.
    rows: !input.billingEnabled ? [] : [
      { label: "On-device explanations", free: "Unlimited", pro: "Unlimited" },
      { label: "Cloud explanations", free: `${limit} a day`, pro: `Up to ${proCloudLimit(input)} a day` },
      { label: "Watchlist", free: `${FREE_WATCHLIST_SIZE} symbols`, pro: `Up to ${WATCHLIST_HARD_CAP}` },
    ],
  };
}

/** Checkout is omitted from the panel unless this list contains "checkout". */
export function pricingActions(view: PricingView): Array<"close" | "link-google" | "checkout"> {
  const actions: Array<"close" | "link-google" | "checkout"> = ["close", "link-google"];
  if (view.showCheckout) actions.push("checkout");
  return actions;
}

export type CloudGate =
  | { kind: "proceed"; decision: PathDecision }
  | { kind: "blocked" };

/**
 * When the cloud meter is closed, paths that must use the cloud stop here.
 * Paths that can run on device are narrowed to device-only so the SDK cannot
 * spend a cloud fallback.
 */
export function applyCloudGate(decision: PathDecision, allowCloud: boolean): CloudGate {
  if (allowCloud) return { kind: "proceed", decision };
  if (decision.mode === "only_in_cloud" || decision.mode === "prefer_in_cloud") {
    return { kind: "blocked" };
  }
  return {
    kind: "proceed",
    decision: {
      ...decision,
      mode: "only_on_device",
      retryWithoutPrivate: false,
    },
  };
}

export class CloudAllowanceUsed extends Error {
  readonly friendly = true;

  constructor() {
    super(
      "You've used today's cloud explanations on your plan. Answers on this device still work, and the limit resets at 00:00 UTC.",
    );
    this.name = "CloudAllowanceUsed";
  }
}

export class WatchlistAllowance extends Error {
  readonly friendly = true;

  constructor(limit: number) {
    super(
      `This watchlist has more than ${limit} symbols. Shorten it to continue.`,
    );
    this.name = "WatchlistAllowance";
  }
}

export function usageDayId(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface UsageDoc {
  cloudCalls: number;
  date: string;
}

export function isUsageDayId(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Mirrors firestore.rules for users/{uid}/usage/{day}.
 * Create starts at 1. Update may only add 1. The date must match the document id.
 */
export function usageWriteAllowed(dayId: string, before: UsageDoc | null, after: UsageDoc): boolean {
  if (!isUsageDayId(dayId) || after.date !== dayId) return false;
  if (!Number.isInteger(after.cloudCalls) || after.cloudCalls < 1) return false;
  if (before === null) return after.cloudCalls === 1;
  if (before.date !== dayId || !Number.isInteger(before.cloudCalls)) return false;
  return after.cloudCalls === before.cloudCalls + 1;
}

/* ---------- Stripe without a server (docs/MONETIZATION.md) ---------- */

/** Public Stripe links from Remote Config. They are not secrets: anyone can open them. */
export interface BillingLinks {
  proMonthlyLink: string;
  proYearlyLink: string;
  billingPortalLink: string;
}

export const NO_BILLING_LINKS: BillingLinks = { proMonthlyLink: "", proYearlyLink: "", billingPortalLink: "" };

/** Link-shaped values for the development preview of the plan card only (/app?plan=...). They lead nowhere. */
export const PREVIEW_BILLING_LINKS: BillingLinks = {
  proMonthlyLink: "https://buy.stripe.com/test_previewMonthly",
  proYearlyLink: "https://buy.stripe.com/test_previewYearly",
  billingPortalLink: "https://billing.stripe.com/p/login/test_preview",
};

const PAYMENT_LINK = /^https:\/\/buy\.stripe\.com\/[A-Za-z0-9_]{4,80}$/;
const PORTAL_LINK = /^https:\/\/billing\.stripe\.com\/p\/login\/[A-Za-z0-9_]{4,80}$/;
/** Firebase Auth uids. Also the only characters Stripe accepts in client_reference_id. */
const ACCOUNT_UID = /^[A-Za-z0-9]{1,128}$/;

export function isPaymentLink(value: string): boolean {
  return PAYMENT_LINK.test(value);
}

export function isPortalLink(value: string): boolean {
  return PORTAL_LINK.test(value);
}

/**
 * The Payment Link with the account id attached, so the plan sync job can tell which
 * account paid. Null when the link is not set up or is not a Stripe Payment Link.
 */
export function checkoutUrl(link: string, uid: string): string | null {
  if (!isPaymentLink(link) || !ACCOUNT_UID.test(uid)) return null;
  return `${link}?client_reference_id=${uid}`;
}

export function portalUrl(link: string): string | null {
  return isPortalLink(link) ? link : null;
}

/**
 * users/{uid}/plan/current is written only by the plan sync job (scripts/billing/sync-plans.ts)
 * and exists only while the account has an active subscription.
 */
export function planFromDoc(data: unknown): PlanId {
  return data && typeof data === "object" && (data as { plan?: unknown }).plan === "pro" ? "pro" : "free";
}

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

export const PRO_PRICE_LABEL = "Pro — coming after beta";
export const BETA_BADGE = "Free during beta";
export const FREE_WATCHLIST_SIZE = 10;
/** Hard cap already enforced by move-card validation. */
export const WATCHLIST_HARD_CAP = 50;
/** Placeholder until a Stripe price exists. Not a secret. */
export const PRO_PRICE_ID = "price_pro_placeholder";

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
    extensionHighlightToExplain: false,
    onDeviceExplanations: "unlimited",
  };
}

export interface BillingInput {
  billingEnabled: boolean;
  plan: PlanId;
  freeCloudDailyLimit: number;
}

/**
 * While billing is off, every plan receives Pro entitlements.
 * Turning billing on leaves Free on the metered map and Pro on the full map.
 */
export function resolveEntitlements(input: BillingInput): Entitlements {
  if (!input.billingEnabled || input.plan === "pro") {
    return { ...PRO_ENTITLEMENTS };
  }
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
}

export function billingSnapshot(
  input: BillingInput & { cloudCallsToday: number },
): BillingSnapshot {
  return {
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
  priceLabel: string;
  betaNote: string | null;
  rows: { label: string; free: string; pro: string }[];
}

export function pricingView(input: BillingInput): PricingView {
  const limit = input.freeCloudDailyLimit;
  return {
    badge: input.billingEnabled ? (input.plan === "pro" ? "Pro" : "Free") : BETA_BADGE,
    showCheckout: input.billingEnabled && input.plan !== "pro",
    priceLabel: PRO_PRICE_LABEL,
    betaNote: input.billingEnabled
      ? null
      : "Billing is off. During beta every Pro entitlement is free, including cloud explanations. On-device explanations stay unlimited on every plan.",
    rows: [
      { label: "On-device explanations", free: "Unlimited", pro: "Unlimited" },
      { label: "Cloud explanations", free: `${limit} a day`, pro: "Unlimited" },
      { label: "Watchlist", free: `${FREE_WATCHLIST_SIZE} symbols`, pro: `Up to ${WATCHLIST_HARD_CAP}` },
      { label: "Daily brief", free: "Not included", pro: "Included" },
      { label: "Extension highlight-to-explain", free: "Not included", pro: "Included" },
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
      "Today's free cloud explanations are used up. Explanations that run on this device are still unlimited. Pro is coming after beta.",
    );
    this.name = "CloudAllowanceUsed";
  }
}

export class WatchlistAllowance extends Error {
  readonly friendly = true;

  constructor(limit: number) {
    super(
      `This watchlist has more than ${limit} symbols. Shorten it to continue on the free plan. Pro is coming after beta.`,
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

export interface CheckoutSessionWrite {
  price: string;
  success_url: string;
  cancel_url: string;
  mode: "subscription";
}

export function checkoutSessionAllowed(data: CheckoutSessionWrite): boolean {
  return (
    data.mode === "subscription" &&
    typeof data.price === "string" &&
    data.price.length > 0 &&
    data.price.length < 80 &&
    isHttpUrl(data.success_url) &&
    isHttpUrl(data.cancel_url)
  );
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\/\S{1,480}$/.test(value);
}

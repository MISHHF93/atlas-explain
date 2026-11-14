import { describe, expect, it } from "vitest";
import {
  CloudAllowanceUsed,
  PRO_ENTITLEMENTS,
  allowCloudCall,
  applyCloudGate,
  billingSnapshot,
  checkoutUrl,
  planFromDoc,
  portalUrl,
  pricingActions,
  pricingView,
  resolveEntitlements,
  usageWriteAllowed,
  watchlistFits,
} from "../src/core/billing";
import type { PathDecision } from "../src/core/types";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import { runExplanation } from "../src/core/run-explanation";
import type { HybridExplainer, MoveCard } from "../src/core/types";

const baseDecision = (mode: PathDecision["mode"], retry = false): PathDecision => ({
  mode,
  includePrivateContext: false,
  retryWithoutPrivate: retry,
  reason: "remote_config",
});

describe("entitlements", () => {
  it("gives every pro entitlement while billing is off", () => {
    const entitlements = resolveEntitlements({
      billingEnabled: false,
      plan: "free",
      freeCloudDailyLimit: 50,
    });
    expect(entitlements).toEqual(PRO_ENTITLEMENTS);
    expect(entitlements.onDeviceExplanations).toBe("unlimited");
    expect(allowCloudCall({
      billingEnabled: false,
      plan: "free",
      freeCloudDailyLimit: 50,
      cloudCallsToday: 10_000,
    })).toBe(true);
  });

  it("meters only cloud calls on the free plan when billing is on", () => {
    const input = { billingEnabled: true, plan: "free" as const, freeCloudDailyLimit: 50, cloudCallsToday: 50 };
    expect(resolveEntitlements(input).cloudExplanationsPerDay).toBe(50);
    expect(resolveEntitlements(input).onDeviceExplanations).toBe("unlimited");
    expect(allowCloudCall(input)).toBe(false);
    expect(allowCloudCall({ ...input, cloudCallsToday: 49 })).toBe(true);
    expect(allowCloudCall({ ...input, plan: "pro", proCloudDailyLimit: 100, cloudCallsToday: 99 })).toBe(true);
  });

  it("gives Pro a higher printed cap, never an unlimited one, and never below Free", () => {
    const pro = { billingEnabled: true, plan: "pro" as const, freeCloudDailyLimit: 10, proCloudDailyLimit: 100 };
    expect(resolveEntitlements(pro).cloudExplanationsPerDay).toBe(100);
    expect(allowCloudCall({ ...pro, cloudCallsToday: 100 })).toBe(false);
    expect(resolveEntitlements({ ...pro, proCloudDailyLimit: 3 }).cloudExplanationsPerDay).toBe(10);
    const rows = pricingView({ ...pro, plan: "free" }).rows;
    expect(rows.find((row) => row.label === "Cloud explanations")).toEqual({ label: "Cloud explanations", free: "10 a day", pro: "Up to 100 a day" });
  });

  it("limits the free watchlist and leaves pro at the card cap", () => {
    const free = resolveEntitlements({ billingEnabled: true, plan: "free", freeCloudDailyLimit: 50 });
    const pro = resolveEntitlements({ billingEnabled: true, plan: "pro", freeCloudDailyLimit: 50 });
    expect(watchlistFits(10, free)).toBe(true);
    expect(watchlistFits(11, free)).toBe(false);
    expect(watchlistFits(50, pro)).toBe(true);
    expect(watchlistFits(51, pro)).toBe(false);
  });
});

describe("billing flag off", () => {
  it("does not make checkout reachable and shows a plain Free plan with nothing to compare", () => {
    const view = pricingView({ billingEnabled: false, plan: "free", freeCloudDailyLimit: 50 });
    expect(view.badge).toBe("Free");
    expect(view.rows).toEqual([]);
    expect(`${view.badge} ${view.note}`).not.toMatch(/beta|coming|Pro/i);
    expect(view.showCheckout).toBe(false);
    expect(pricingActions(view)).not.toContain("checkout");
    expect(DEFAULT_SETTINGS.billingEnabled).toBe(false);
  });

  it("shows checkout only when billing is on and the plan is free", () => {
    const view = pricingView({ billingEnabled: true, plan: "free", freeCloudDailyLimit: 50 });
    expect(pricingActions(view)).toContain("checkout");
    const pro = pricingView({ billingEnabled: true, plan: "pro", freeCloudDailyLimit: 50 });
    expect(pro.showCheckout).toBe(false);
    expect(pro.showManage).toBe(true);
    expect(view.showManage).toBe(false);
  });
});

describe("cloud gate", () => {
  it("blocks a forced cloud path and narrows a prefer-on-device path", () => {
    expect(applyCloudGate(baseDecision("only_in_cloud"), false).kind).toBe("blocked");
    const narrowed = applyCloudGate(baseDecision("prefer_on_device", true), false);
    expect(narrowed).toEqual({
      kind: "proceed",
      decision: { ...baseDecision("prefer_on_device", true), mode: "only_on_device", retryWithoutPrivate: false },
    });
    expect(applyCloudGate(baseDecision("only_on_device"), false)).toEqual({
      kind: "proceed",
      decision: baseDecision("only_on_device"),
    });
  });

  it("uses a friendly limit message rather than an error tone", () => {
    const error = new CloudAllowanceUsed();
    expect(error.friendly).toBe(true);
    expect(error.message.toLowerCase()).not.toContain("error");
    expect(error.message).toContain("Answers on this device still work");
    expect(error.message).toContain("resets");
    expect(error.message).not.toMatch(/beta|coming/i);
  });
});

describe("usage writes", () => {
  const day = "2026-11-13";

  it("allows the first call and then only plus one", () => {
    expect(usageWriteAllowed(day, null, { cloudCalls: 1, date: day })).toBe(true);
    expect(usageWriteAllowed(day, null, { cloudCalls: 2, date: day })).toBe(false);
    expect(usageWriteAllowed(day, { cloudCalls: 1, date: day }, { cloudCalls: 2, date: day })).toBe(true);
    expect(usageWriteAllowed(day, { cloudCalls: 4, date: day }, { cloudCalls: 6, date: day })).toBe(false);
    expect(usageWriteAllowed(day, { cloudCalls: 2, date: day }, { cloudCalls: 1, date: day })).toBe(false);
    expect(usageWriteAllowed("not-a-day", null, { cloudCalls: 1, date: "not-a-day" })).toBe(false);
    expect(usageWriteAllowed(day, null, { cloudCalls: 1, date: "2026-11-14" })).toBe(false);
  });

});

describe("Stripe links without a server", () => {
  const links = {
    proMonthlyLink: "https://buy.stripe.com/test_aBc123XyZ",
    proYearlyLink: "https://buy.stripe.com/test_dEf456UvW",
    billingPortalLink: "https://billing.stripe.com/p/login/test_gHi789",
  };
  const base = { billingEnabled: true, plan: "free" as const, freeCloudDailyLimit: 10, cloudCallsToday: 0, links };

  it("attaches the account id to the Payment Link and nothing else", () => {
    expect(checkoutUrl(links.proMonthlyLink, "Uid123abc")).toBe("https://buy.stripe.com/test_aBc123XyZ?client_reference_id=Uid123abc");
  });

  it("refuses anything that is not a Stripe link or a plain account id", () => {
    expect(checkoutUrl("https://buy.stripe.com.evil.example/x1234", "Uid123")).toBeNull();
    expect(checkoutUrl("http://buy.stripe.com/test_aBc123XyZ", "Uid123")).toBeNull();
    expect(checkoutUrl("https://buy.stripe.com/test_aBc123XyZ?x=1", "Uid123")).toBeNull();
    expect(checkoutUrl("", "Uid123")).toBeNull();
    expect(checkoutUrl(links.proMonthlyLink, "uid&prefilled_email=x")).toBeNull();
    expect(portalUrl("https://billing.stripe.com/p/login/test_gHi789")).toBe(links.billingPortalLink);
    expect(portalUrl("https://example.com/p/login/test_gHi789")).toBeNull();
  });

  it("offers checkout only to a signed-in account, and only while billing is on", () => {
    expect(billingSnapshot({ ...base, accountUid: null }).checkout).toEqual({ monthly: null, yearly: null });
    expect(billingSnapshot({ ...base, accountUid: "Uid123" }).checkout.yearly).toBe("https://buy.stripe.com/test_dEf456UvW?client_reference_id=Uid123");
    const off = billingSnapshot({ ...base, billingEnabled: false, accountUid: "Uid123" });
    expect(off.checkout).toEqual({ monthly: null, yearly: null });
    expect(off.portalUrl).toBeNull();
    expect(billingSnapshot({ ...base, links: undefined, accountUid: "Uid123" }).checkout).toEqual({ monthly: null, yearly: null });
  });

  it("reads Pro only from a plan document that says so", () => {
    expect(planFromDoc({ plan: "pro", status: "active" })).toBe("pro");
    expect(planFromDoc({ plan: "free" })).toBe("free");
    expect(planFromDoc(undefined)).toBe("free");
    expect(planFromDoc("pro")).toBe("free");
  });
});

describe("runExplanation metering", () => {
  const card: MoveCard = {
    symbol: "NVDA",
    movePct: -6,
    headlines: [],
    peerMoves: [],
    upcomingEvents: [],
    watchlist: [],
  };

  it("does not call the model when the cloud path is over the free limit", async () => {
    let calls = 0;
    const explainer: HybridExplainer = {
      async explain() {
        calls += 1;
        return { rawText: "{}", inferenceSource: "in_cloud" };
      },
    };
    await expect(runExplanation({
      card,
      question: "",
      settings: { ...DEFAULT_SETTINGS, inferenceMode: "only_in_cloud", billingEnabled: true },
      explainer,
      meter: { allowCloud: false, onCloudInference: async () => undefined },
    })).rejects.toBeInstanceOf(CloudAllowanceUsed);
    expect(calls).toBe(0);
  });
});

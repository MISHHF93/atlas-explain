import { describe, expect, it } from "vitest";
import {
  CloudAllowanceUsed,
  PRO_ENTITLEMENTS,
  PRO_PRICE_LABEL,
  allowCloudCall,
  applyCloudGate,
  checkoutSessionAllowed,
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
    expect(allowCloudCall({ ...input, plan: "pro", cloudCallsToday: 500 })).toBe(true);
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
  it("does not make checkout reachable and shows the beta price", () => {
    const view = pricingView({ billingEnabled: false, plan: "free", freeCloudDailyLimit: 50 });
    expect(view.badge).toBe("Free during beta");
    expect(view.priceLabel).toBe(PRO_PRICE_LABEL);
    expect(view.showCheckout).toBe(false);
    expect(pricingActions(view)).not.toContain("checkout");
    expect(DEFAULT_SETTINGS.billingEnabled).toBe(false);
  });

  it("shows checkout only when billing is on and the plan is free", () => {
    const view = pricingView({ billingEnabled: true, plan: "free", freeCloudDailyLimit: 50 });
    expect(pricingActions(view)).toContain("checkout");
    const pro = pricingView({ billingEnabled: true, plan: "pro", freeCloudDailyLimit: 50 });
    expect(pro.showCheckout).toBe(false);
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
    expect(error.message).toContain("unlimited");
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

  it("allows a checkout session shape and rejects a missing price", () => {
    expect(checkoutSessionAllowed({
      mode: "subscription",
      price: "price_pro_placeholder",
      success_url: "https://atlas-explain.web.app/",
      cancel_url: "https://atlas-explain.web.app/",
    })).toBe(true);
    expect(checkoutSessionAllowed({
      mode: "subscription",
      price: "",
      success_url: "https://atlas-explain.web.app/",
      cancel_url: "https://atlas-explain.web.app/",
    })).toBe(false);
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

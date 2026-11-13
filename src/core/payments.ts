import type { PlanId } from "./billing";

export interface CheckoutRequest {
  uid: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

/**
 * Provider port. The web app ships a Stripe adapter that follows the
 * "Run Payments with Stripe" extension (a checkout session write plus a
 * subscription read). No provider is called while billing is off.
 */
export interface PaymentProvider {
  readonly id: string;
  startCheckout(request: CheckoutRequest): Promise<void>;
  currentPlan(uid: string): Promise<PlanId>;
}

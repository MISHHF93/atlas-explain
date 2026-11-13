import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import type { PaymentProvider } from "../../core/payments";
import type { HybridExplainer } from "../../core/types";

/**
 * Firebase AI Logic is the biggest part of the web bundle. It is only
 * needed when someone asks for an explanation, so it loads on first use.
 */
export function lazyExplainer(app: FirebaseApp): HybridExplainer {
  let ready: Promise<HybridExplainer> | null = null;
  return {
    async explain(request, hooks) {
      ready ??= import("./explainer").then((mod) => mod.createFirebaseExplainer(app));
      const explainer = await ready;
      return explainer.explain(request, hooks);
    },
  };
}

/**
 * Billing ships switched off. The Stripe checkout module is only fetched
 * when Remote Config turns billing on and a plan or checkout is needed.
 */
export function lazyPayments(db: () => Promise<Firestore>): PaymentProvider {
  let ready: Promise<PaymentProvider> | null = null;
  const load = () => (ready ??= Promise.all([import("./stripe-payments"), db()]).then(([mod, firestore]) => mod.createStripePayments(firestore)));
  return {
    id: "stripe",
    async startCheckout(request) {
      return (await load()).startCheckout(request);
    },
    async currentPlan(uid) {
      return (await load()).currentPlan(uid);
    },
  };
}

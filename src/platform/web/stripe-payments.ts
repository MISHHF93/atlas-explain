import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
  type Firestore,
} from "firebase/firestore";
import type { PlanId } from "../../core/billing";
import type { PaymentProvider } from "../../core/payments";

/**
 * Firebase "Run Payments with Stripe" extension shape.
 * The client writes a checkout session. The extension, once installed,
 * adds `url` or `error` with the Admin SDK. This module has no Stripe secret.
 */
export function createStripePayments(db: Firestore): PaymentProvider {
  return {
    id: "stripe",
    async startCheckout(request) {
      const ref = await addDoc(collection(db, "customers", request.uid, "checkout_sessions"), {
        price: request.priceId,
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        mode: "subscription",
      });
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          stop();
          reject(new Error("Checkout did not return a link. The Stripe extension is not installed yet."));
        }, 8_000);
        const stop = onSnapshot(
          ref,
          (snap) => {
            const data = snap.data();
            const url = data?.url;
            if (typeof url === "string" && url.length > 0) {
              clearTimeout(timeout);
              stop();
              window.location.assign(url);
              resolve();
              return;
            }
            const error = data?.error;
            const message =
              error && typeof error === "object" && "message" in error && typeof error.message === "string"
                ? error.message
                : null;
            if (message) {
              clearTimeout(timeout);
              stop();
              reject(new Error(message));
            }
          },
          (error) => {
            clearTimeout(timeout);
            stop();
            reject(error);
          },
        );
      });
    },
    async currentPlan(uid) {
      return readActivePlan(db, uid);
    },
  };
}

export async function readActivePlan(db: Firestore, uid: string): Promise<PlanId> {
  try {
    const snap = await getDocs(
      query(collection(db, "customers", uid, "subscriptions"), where("status", "in", ["trialing", "active"])),
    );
    return snap.empty ? "free" : "pro";
  } catch {
    return "free";
  }
}

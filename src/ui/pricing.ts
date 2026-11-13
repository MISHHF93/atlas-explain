import type { BillingSnapshot } from "../core/billing";
import { pricingActions } from "../core/billing";
import { h } from "./dom";

export function fillPricingDialog(
  dialog: HTMLDialogElement,
  snapshot: BillingSnapshot,
  handlers: {
    onLink: () => Promise<"linked" | "already">;
    onCheckout?: () => Promise<void>;
  },
): void {
  const view = snapshot.pricing;
  const actions = pricingActions(view);
  const note = h("p", { className: "status", attrs: { role: "status" } });
  const buttons = [
    h("button", { className: "secondary", attrs: { type: "button" }, text: "Close" }),
  ];
  buttons[0]?.addEventListener("click", () => dialog.close());

  if (actions.includes("link-google")) {
    const link = h("button", {
      className: "secondary",
      attrs: { type: "button", id: "link-google" },
      text: "Link a Google account",
    });
    link.addEventListener("click", () => {
      note.textContent = "Opening Google…";
      void handlers.onLink().then(
        (result) => {
          note.textContent =
            result === "already"
              ? "This browser is already linked to Google. Your explanations stay on this account."
              : "Google is linked. Saved explanations and usage stay with this account.";
        },
        (error: unknown) => {
          note.textContent = error instanceof Error ? error.message : "Google sign-in did not finish.";
        },
      );
    });
    buttons.push(link);
  }

  if (actions.includes("checkout") && handlers.onCheckout) {
    const checkout = h("button", {
      className: "primary",
      attrs: { type: "button", id: "checkout" },
      text: "Continue to checkout",
    });
    checkout.addEventListener("click", () => {
      note.textContent = "Starting checkout…";
      void handlers.onCheckout?.().catch((error: unknown) => {
        note.textContent = error instanceof Error ? error.message : "Checkout did not start.";
      });
    });
    buttons.push(checkout);
  }

  const table = h("table", { className: "plan-table" });
  table.append(
    h("caption", { className: "fine", text: "What each plan includes once billing is on." }),
    h("thead", {},
      h("tr", {}, h("th", { text: "Feature" }), h("th", { text: "Free" }), h("th", { text: "Pro" })),
    ),
    h("tbody", {}, ...view.rows.map((row) =>
      h("tr", {}, h("th", { attrs: { scope: "row" }, text: row.label }), h("td", { text: row.free }), h("td", { text: row.pro })),
    )),
  );

  dialog.replaceChildren(
    h("h2", { attrs: { id: "pricing-title" }, text: "Pricing" }),
    h("p", { className: "badge", text: view.badge }),
    h("p", { text: view.priceLabel }),
    view.betaNote ? h("p", { text: view.betaNote }) : "",
    table,
    h("p", { className: "fine", text: "On-device explanations are unlimited on every plan. Only cloud fallback calls are counted." }),
    h("p", { className: "fine", text: "Educational information, not investment advice." }),
    h("div", { className: "actions" }, ...buttons),
    note,
  );
}

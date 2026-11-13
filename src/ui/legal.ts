import { h } from "./dom";
import { brand, disclaimer } from "./setup";

export function mountLegal(root: HTMLElement, page: "terms" | "privacy"): void {
  root.replaceChildren();
  const back = h("a", { attrs: { href: "#" }, text: "Back to ATLAS Explain" });
  const other = page === "terms"
    ? h("a", { attrs: { href: "#/privacy" }, text: "Privacy" })
    : h("a", { attrs: { href: "#/terms" }, text: "Terms" });
  const body = page === "terms" ? terms() : privacy();
  root.append(
    h("header", { className: "top" }, brand(), disclaimer()),
    h("main", { className: "wrap legal", attrs: { id: "main" } },
      h("p", { className: "top-actions" }, back, other),
      h("p", { className: "fine", text: "Plain-language summary. This is not legal advice." }),
      ...body,
    ),
  );
}

function terms(): HTMLElement[] {
  return [
    h("h2", { text: "Terms" }),
    h("p", { text: "ATLAS Explain gives educational information about a market move you describe. It is not investment advice, not a recommendation, and not an offer to buy or sell any security." }),
    h("p", { text: "The app is free during beta. Paid plans are switched off and no checkout is available. If a paid plan is offered later, the price and what it includes will be shown before you pay." }),
    h("p", { text: "You can use the app without a Google account. The browser gets an anonymous id so saved explanations stay on that browser. You can link a Google account later. Linking keeps the same id, so saved explanations and the daily cloud count stay with you." }),
    h("p", { text: "Do not paste confidential trading records. Notes and watchlists are left out of cloud requests and are not stored. Sample cards are illustrations from public news reports, not a live data feed." }),
    h("p", { text: "Explanations can be wrong or incomplete. You are responsible for what you do with them." }),
  ];
}

function privacy(): HTMLElement[] {
  return [
    h("h2", { text: "Privacy" }),
    h("p", { text: "ATLAS Explain stores an anonymous user id, the public move card you submit, the explanation, which path ran (on-device or cloud), and a daily count of cloud explanations. Notes and watchlists are not written to the database." }),
    h("p", { text: "When Gemini Nano runs in Chrome, that prompt is processed on your computer. When the cloud model runs, the public card and your question are sent to Gemini through Firebase AI Logic. App Check is on." }),
    h("p", { text: "Firebase, a Google service, hosts the site, the database, and sign-in. If you link Google, Google receives the sign-in. We do not sell personal information." }),
    h("p", { text: "Payments are off. No card number is collected. If payments are turned on later, Stripe would process the payment and this app would not store the card number. A future paid plan sold from Ontario may be subject to GST/HST. That is not tax advice." }),
    h("p", { text: "Questions about this summary can be raised on the public repository for this project." }),
  ];
}

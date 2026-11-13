import { el } from "./dom";

/** Plain-language Terms and Privacy, shown in the wallet sheet. Not legal advice. */
export function termsNodes(): HTMLElement[] {
  return [
    el("p", "fine", "Plain-language summary. This is not legal advice."),
    el("p", undefined, "ATLAS Explain gives educational information about a market move you describe. It is not investment advice, not a recommendation, and not an offer to trade any security."),
    el("p", undefined, "The app is free during beta. Paid plans are switched off and no checkout is available. If a paid plan is offered later, the price and what it includes will be shown before you pay."),
    el("p", undefined, "You can use the app without a Google account. The browser gets an anonymous id so saved explanations stay on that browser. You can link a Google account later. Linking keeps the same id, so saved explanations and the daily cloud count stay with you."),
    el("p", undefined, "Do not paste confidential trading records. Notes and watchlists are left out of cloud requests and are not stored. Sample cards are illustrations from public news reports, not a live data feed."),
    el("p", undefined, "Explanations can be wrong or incomplete. You are responsible for what you do with them."),
  ];
}

export function privacyNodes(): HTMLElement[] {
  return [
    el("p", "fine", "Plain-language summary. This is not legal advice."),
    el("p", undefined, "ATLAS Explain stores an anonymous user id, the public move card you submit, the explanation, which path ran (on-device or cloud), and a daily count of cloud explanations. Notes and watchlists are not written to the database."),
    el("p", undefined, "When Gemini Nano runs in Chrome, that prompt is processed on your computer. When the cloud model runs, the public card and your question are sent to Gemini through Firebase AI Logic. App Check is on."),
    el("p", undefined, "The Chrome extension sends only the text you highlight, the page title, and the site name. It never reads form fields, balances, or account numbers."),
    el("p", undefined, "The extension asks for one site permission, http://localhost:3000, so its Assets tab can read public prices and paper model stats from ATLAS running on your own computer. Nothing from that read leaves your computer. This web app never calls your computer."),
    el("p", undefined, "Firebase, a Google service, hosts the site, the database, and sign-in. If you link Google, Google receives the sign-in. Personal information is never sold or shared for advertising."),
    el("p", undefined, "Payments are off. No card number is collected. If payments are turned on later, Stripe would process the payment and this app would not store the card number. A future paid plan sold from Ontario may be subject to GST/HST. That is not tax advice."),
  ];
}

export function extensionNodes(): HTMLElement[] {
  const steps = el("ol");
  for (const text of [
    "Download or clone the public repository, then run npm ci and npm run build:extension.",
    "Open chrome://extensions and turn on Developer mode.",
    "Choose Load unpacked and select the extension/dist folder.",
    "Pin ATLAS Explain, then open the ATLAS Markets desk and click the icon to read the signal light.",
  ]) steps.append(el("li", undefined, text));
  const repo = el("a", undefined, "github.com/MISHHF93/atlas-explain");
  repo.href = "https://github.com/MISHHF93/atlas-explain";
  repo.target = "_blank";
  repo.rel = "noreferrer";
  const line = el("p", "fine");
  line.append("Source, Apache-2.0: ", repo);
  return [
    el("p", undefined, "The extension is the same wallet you see here, opened from the Chrome toolbar. It adds highlight-to-explain on any page and reads the ATLAS desk's public paper signal."),
    steps,
    line,
  ];
}

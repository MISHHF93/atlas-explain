import { INSTALL_URL } from "../core/popup-copy";
import { el } from "./dom";

/** Short, plain summaries shown in the app sheet. The full text lives at /terms and /privacy. */
export function termsNodes(): HTMLElement[] {
  return [
    el("p", undefined, "ATLAS Explain gives general educational information about financial terms and market news. It is not investment, financial, tax or legal advice, and it never recommends a trade."),
    el("p", undefined, "Answers are written by AI and can be wrong, incomplete or out of date. Prices can be delayed. You are responsible for your own decisions."),
    el("p", undefined, "You can use ATLAS Explain without an account. Cloud answers have a daily limit so the service stays available for everyone. Answers on your device are not limited."),
    el("p", undefined, "Please don't paste account numbers, balances or anything confidential."),
    fullText("Read the full terms", "/terms"),
  ];
}

export function privacyNodes(): HTMLElement[] {
  return [
    el("p", undefined, "ATLAS Explain uses only the text you highlight or type, plus the page title and site name. It never reads balances, account numbers or form fields."),
    el("p", undefined, "When your browser supports it, the answer is written on your device and nothing is sent. Otherwise your text is sent to Google's Gemini in the cloud to write the answer. Every answer says which one ran."),
    el("p", undefined, "If you sign in, we store your account id, email address and name, your settings and the explanations you save. You can ask for your account and data to be deleted. Your information is never sold or used for advertising."),
    el("p", undefined, "Live prices are requested directly from the market-data provider named next to them."),
    fullText("Read the full privacy policy", "/privacy"),
  ];
}

export function extensionNodes(): HTMLElement[] {
  const add = el("a", "primary", "Add ATLAS Explain to Chrome") as HTMLAnchorElement;
  add.href = INSTALL_URL;
  add.target = "_blank";
  add.rel = "noopener";
  const steps = el("ol");
  for (const text of [
    "Add ATLAS Explain to Chrome and pin it from the puzzle-piece menu.",
    "Highlight a word or sentence on any page.",
    "Click the ATLAS Explain icon, or right-click and choose Explain with ATLAS.",
  ]) steps.append(el("li", undefined, text));
  return [
    el("p", undefined, "The extension explains anything you highlight, on any page, without leaving it. It works on desktop Chrome."),
    steps,
    add,
  ];
}

function fullText(label: string, href: string): HTMLElement {
  const p = el("p");
  const a = el("a", undefined, label) as HTMLAnchorElement;
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  p.append(a);
  return p;
}

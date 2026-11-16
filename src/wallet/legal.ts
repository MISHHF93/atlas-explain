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
    el("p", undefined, "ATLAS Explain uses only the text you type. It never reads other websites, balances or account numbers."),
    el("p", undefined, "When your browser supports it, the answer is written on your device and nothing is sent. Otherwise your text is sent to Google's Gemini in the cloud to write the answer. Every answer says which one ran."),
    el("p", undefined, "If you sign in, we store your account id, email address and name, your settings and the explanations you save. You can download your data or delete your account at any time from Account. Your information is never sold or used for advertising."),
    el("p", undefined, "Live prices are requested directly from the market-data provider named next to them."),
    fullText("Read the full privacy policy", "/privacy"),
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

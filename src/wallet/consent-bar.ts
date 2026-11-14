/**
 * The one-time analytics question in the web app: a small bar, not a pop-up, with equal
 * "Allow" and "No thanks" buttons. Shown only when the owner has turned analytics on.
 */
import { CONSENT_KEY, readConsent, type Consent } from "../core/analytics";
import { el } from "./dom";

export function storedConsent(): Consent {
  try {
    return readConsent(localStorage.getItem(CONSENT_KEY));
  } catch {
    return "unset";
  }
}

export function storeConsent(value: "granted" | "denied"): void {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Private mode: we ask again next visit.
  }
}

export function consentBar(onChoice: (value: "granted" | "denied") => void): HTMLElement {
  const bar = el("section", "consent-bar");
  bar.setAttribute("role", "region");
  bar.setAttribute("aria-label", "Usage statistics");
  const text = el("p", undefined, "Help improve ATLAS Explain with anonymous usage statistics? We never collect what you highlight, type or save. ");
  const more = el("a", undefined, "Privacy") as HTMLAnchorElement;
  more.href = "/privacy#analytics";
  more.target = "_blank";
  more.rel = "noopener";
  text.append(more);
  const allow = el("button", "secondary small", "Allow");
  const deny = el("button", "secondary small", "No thanks");
  allow.type = "button";
  deny.type = "button";
  const choose = (value: "granted" | "denied") => {
    storeConsent(value);
    bar.remove();
    onChoice(value);
  };
  allow.addEventListener("click", () => choose("granted"));
  deny.addEventListener("click", () => choose("denied"));
  const actions = el("div", "consent-actions");
  actions.append(deny, allow);
  bar.append(text, actions);
  return bar;
}

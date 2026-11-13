import type { AccountView } from "../core/account";
import { validEmail } from "../core/account";
import { el, labelledButton } from "./dom";

export interface AccountHandlers {
  onGoogle: () => Promise<string>;
  onEmail: (email: string) => Promise<string>;
  onSignOut: () => Promise<string>;
}

/**
 * Account sheet for the web app and the extension: sign in with Google or an email
 * link, or sign out. Signed out still works; it only keeps history on this browser.
 */
export function accountPanel(view: AccountView | null, handlers: AccountHandlers, options: { emailLink?: boolean } = {}): HTMLElement {
  const wrap = el("div", "stack account");
  const note = el("p", "fine");
  note.setAttribute("role", "status");
  note.setAttribute("aria-live", "polite");

  const busy = (button: HTMLButtonElement, work: () => Promise<string>, pending: string) => {
    button.disabled = true;
    note.textContent = pending;
    void work().then(
      (message) => {
        note.textContent = message;
      },
      (error: unknown) => {
        note.textContent = error instanceof Error ? error.message : "That did not finish. Try again.";
      },
    ).finally(() => {
      button.disabled = false;
    });
  };

  if (view?.signedIn) {
    const head = el("div", "account-head");
    const who = el("div");
    who.append(el("p", "card-title", view.label), el("p", "fine", view.email && view.email !== view.label ? view.email : view.provider === "google" ? "Google account" : "Email sign-in"));
    head.append(el("span", "account-avatar", view.initials), who);
    const out = labelledButton("logout", "Sign out", "secondary");
    out.addEventListener("click", () => busy(out, handlers.onSignOut, "Signing out…"));
    wrap.append(
      head,
      el("p", "fine", "Saved explanations and your theme follow this account on every device where you sign in. ATLAS Explain never reads balances or account details from any site."),
      out,
      note,
    );
    return wrap;
  }

  const google = labelledButton("user", "Continue with Google", "primary");
  google.addEventListener("click", () => busy(google, handlers.onGoogle, "Opening Google…"));
  wrap.append(
    el("p", "card-title", "Sign in to keep your explanations"),
    el("p", "fine", "Signing in keeps saved explanations and settings across devices. You can keep using ATLAS Explain signed out; history then stays on this browser."),
    google,
  );

  if (options.emailLink !== false) {
    const form = el("form", "account-form");
    const input = document.createElement("input");
    input.type = "email";
    input.autocomplete = "email";
    input.placeholder = "you@example.com";
    input.setAttribute("aria-label", "Email address for a sign-in link");
    const send = labelledButton("mail", "Email me a link", "secondary");
    send.type = "submit";
    form.append(input, send);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const email = input.value.trim();
      if (!validEmail(email)) {
        note.textContent = "That email address does not look right.";
        input.focus();
        return;
      }
      busy(send, () => handlers.onEmail(email), "Sending your link…");
    });
    wrap.append(el("p", "fine", "Or get a one-time sign-in link by email. No password."), form);
  }
  wrap.append(note, el("p", "fine", "We store your account id, email and display name, and the explanations you save. Never balances, account numbers or form fields."));
  return wrap;
}

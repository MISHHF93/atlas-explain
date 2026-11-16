import type { AccountView } from "../core/account";
import { validEmail } from "../core/account";
import { el, labelledButton } from "./dom";

export interface AccountHandlers {
  onGoogle: () => Promise<string>;
  onEmail: (email: string) => Promise<string>;
  onSignOut: () => Promise<string>;
}

/**
 * Account sheet for the web app: sign in with Google or an email
 * link, or sign out. The web app needs an account; signing out leads back to the Sign in page.
 */
export function accountPanel(view: AccountView | null, handlers: AccountHandlers, options: { emailLink?: boolean; compact?: boolean } = {}): HTMLElement {
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

  const google = googleButton();
  google.addEventListener("click", () => busy(google, handlers.onGoogle, "Opening Google…"));
  if (!options.compact) {
    wrap.append(
      el("p", "card-title", "Sign in to keep your explanations"),
      el("p", "fine", "The web app needs a free account. Signing in keeps your saved explanations and settings on every device."),
    );
  }
  wrap.append(google);

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
    wrap.append(orDivider(), el("p", "fine", "Get a one-time sign-in link by email. No password."), form);
  }
  wrap.append(note, el("p", "fine", "We store your account id, email and display name, and the explanations you save. Never balances, account numbers or form fields."));
  return wrap;
}

/** A thin rule with "or" in the middle, between two ways to do the same thing. */
export function orDivider(): HTMLElement {
  const div = el("div", "or-divider");
  div.setAttribute("role", "separator");
  div.append(el("span", undefined, "or"));
  return div;
}

/**
 * "Continue with Google", drawn the way Google's sign-in branding asks: a neutral button with
 * the four-colour G. Built with DOM calls, no markup strings.
 */
function googleButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "google-btn";
  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "0 0 48 48");
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "18");
  svg.setAttribute("aria-hidden", "true");
  for (const [fill, d] of [
    ["#EA4335", "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"],
    ["#4285F4", "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"],
    ["#FBBC05", "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"],
    ["#34A853", "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"],
  ] as const) {
    const path = document.createElementNS(NS, "path");
    path.setAttribute("fill", fill);
    path.setAttribute("d", d);
    svg.append(path);
  }
  button.append(svg, el("span", undefined, "Continue with Google"));
  return button;
}

/**
 * Shown when an email sign-in link is opened on a device that didn't ask for it: the
 * visitor types the address the link was sent to. `onConfirm` resolves with the message
 * to show, or rejects with the reason, and the field stays for another try.
 */
export function emailConfirmPanel(onConfirm: (email: string) => Promise<string>): HTMLElement {
  const wrap = el("div", "stack account");
  const note = el("p", "fine");
  note.setAttribute("role", "status");
  note.setAttribute("aria-live", "polite");

  const form = el("form", "account-form");
  const input = document.createElement("input");
  input.type = "email";
  input.autocomplete = "email";
  input.placeholder = "you@example.com";
  input.required = true;
  input.setAttribute("aria-label", "The email address your sign-in link was sent to");
  const confirm = labelledButton("mail", "Finish signing in", "primary");
  confirm.type = "submit";
  form.append(input, confirm);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = input.value.trim();
    if (!validEmail(email)) {
      note.textContent = "That email address does not look right.";
      input.focus();
      return;
    }
    confirm.disabled = true;
    note.textContent = "Finishing sign-in…";
    void onConfirm(email).then(
      (message) => {
        note.textContent = message;
      },
      (error: unknown) => {
        note.textContent = error instanceof Error ? error.message : "That did not finish. Try again.";
        confirm.disabled = false;
        input.focus();
      },
    );
  });

  wrap.append(
    el("p", "card-title", "Confirm your email to finish signing in"),
    el("p", "fine", "You opened the sign-in link on a different device or browser from the one where you asked for it. Enter the email address the link was sent to."),
    form,
    note,
    el("p", "fine", "The address is only used to check the link. If it doesn't match, nothing changes."),
  );
  return wrap;
}

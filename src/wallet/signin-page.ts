import { el, labelledButton } from "./dom";

/**
 * The full Sign in page (/signin): the website's "Sign in" leads here, and signing in leads into
 * the app. It sits over the app frame as its own page, not as a sheet inside the app. Signing in
 * stays optional: "Continue without an account" goes straight into the app.
 *
 * The caller supplies the sign-in body (the shared account panel, or the "finish signing in"
 * form for an email link opened on another device), so the sign-in logic lives in one place.
 */
export interface SignInPage {
  node: HTMLElement;
  /** Shows the page with this body, and an optional note above it (for example "You're signed out."). */
  show(body: HTMLElement, note?: string): void;
  hide(): void;
  readonly open: boolean;
}

export function createSignInPage(options: { onContinue: () => void }): SignInPage {
  const node = el("div", "signin-page");
  node.hidden = true;
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-modal", "true");
  node.setAttribute("aria-labelledby", "signin-title");

  const card = el("div", "signin-card");
  const brand = document.createElement("a");
  brand.className = "signin-brand";
  brand.href = "/";
  brand.setAttribute("aria-label", "ATLAS Explain website");
  const logo = document.createElement("img");
  logo.src = "/logo.svg";
  logo.alt = "";
  logo.width = 40;
  logo.height = 40;
  const word = el("span", "signin-word");
  word.append(el("b", undefined, "ATLAS"), document.createTextNode(" Explain"));
  brand.append(logo, word);

  const title = el("h1", "signin-title", "Sign in to ATLAS Explain");
  title.id = "signin-title";
  const lede = el("p", "signin-lede", "Sign in to keep your saved explanations and settings on every device, or continue without an account. ATLAS Explain works the same either way.");
  const note = el("p", "signin-note");
  note.setAttribute("role", "status");
  const slot = el("div", "signin-body");

  const skip = labelledButton("chevron", "Continue without an account", "secondary");
  skip.classList.add("signin-skip");
  skip.addEventListener("click", () => options.onContinue());

  const links = el("p", "signin-links");
  for (const [href, label] of [["/privacy", "Privacy"], ["/terms", "Terms"], ["/", "Back to the website"]] as const) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    links.append(a);
  }
  const or = el("div", "or-divider");
  or.setAttribute("role", "separator");
  or.append(el("span", undefined, "or"));
  card.append(brand, title, lede, note, slot, or, skip, links);
  node.append(card);

  let open = false;
  return {
    node,
    show(body, message) {
      slot.replaceChildren(body);
      note.textContent = message ?? "";
      note.hidden = !message;
      node.hidden = false;
      open = true;
      requestAnimationFrame(() => node.querySelector<HTMLElement>("button, input, a[href]:not(.signin-brand)")?.focus());
    },
    hide() {
      node.hidden = true;
      open = false;
    },
    get open() {
      return open;
    },
  };
}

import { el } from "./dom";
import { fullPage, type FullPage } from "./full-page";

/**
 * The Sign in page (/signin). Signing in is required for the web app (owner decision, 16 Nov
 * 2026): every app address leads here until the visitor signs in with Google or a one-time email
 * link, and then on to where they were heading, or to Get started. The AI-assistant connector needs
 * no account, so the page points there for anyone who only wants that.
 *
 * The caller supplies the sign-in content (the shared account panel, or the "finish signing in"
 * form for an email link opened on another device), so the sign-in logic lives in one place.
 */
export type SignInPage = FullPage;

export function createSignInPage(): SignInPage {
  const page = fullPage({
    id: "signin-title",
    title: "Sign in to ATLAS Explain",
    lede: "Sign in with Google or a one-time email link to use the web app. Your saved explanations and settings then follow you to every device.",
    links: [["/privacy", "Privacy"], ["/terms", "Terms"], ["/", "Back to the website"]],
  });
  return {
    node: page.node,
    show(body, note) {
      // Only want the connector? It needs no account.
      const connector = el("p", "fine signin-connector");
      const link = document.createElement("a");
      link.href = "/connect";
      link.textContent = "The AI-assistant connector";
      connector.append(link, document.createTextNode(" needs no account."));
      const wrap = el("div", "stack");
      wrap.append(body, connector);
      page.show(wrap, note);
    },
    hide: () => page.hide(),
    get open() {
      return page.open;
    },
  };
}

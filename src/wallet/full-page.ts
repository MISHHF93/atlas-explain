import { el } from "./dom";

/**
 * The one frame for the app's own full pages, Sign in (/signin) and Get started (/start): the logo
 * back to the website, a title, a one-line intro, a status note, the page's content and a row of
 * footer links. They sit over the app frame as pages, not sheets, so the journey reads as one.
 */
export interface FullPage {
  node: HTMLElement;
  /** Shows the page with this content, and an optional note above it (for example "You're signed out."). */
  show(content: Node, note?: string): void;
  hide(): void;
  readonly open: boolean;
}

export function fullPage(options: { id: string; title: string; lede: string; links: readonly (readonly [string, string])[]; wide?: boolean }): FullPage {
  const node = el("div", options.wide ? "signin-page start-page" : "signin-page");
  node.hidden = true;
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-modal", "true");
  node.setAttribute("aria-labelledby", options.id);

  const card = el("div", options.wide ? "signin-card start-card" : "signin-card");
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

  const title = el("h1", "signin-title", options.title);
  title.id = options.id;
  // Focus lands on the title when the page opens, so a screen reader starts there.
  title.tabIndex = -1;
  const lede = el("p", "signin-lede", options.lede);
  const note = el("p", "signin-note");
  note.setAttribute("role", "status");
  note.hidden = true;
  const slot = el("div", "signin-body");

  const links = el("p", "signin-links");
  for (const [href, label] of options.links) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    links.append(a);
  }
  card.append(brand, title, lede, note, slot, links);
  node.append(card);

  let open = false;
  return {
    node,
    show(content, message) {
      slot.replaceChildren(content);
      note.textContent = message ?? "";
      note.hidden = !message;
      node.hidden = false;
      open = true;
      requestAnimationFrame(() => (node.querySelector<HTMLElement>("button, input") ?? title).focus());
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

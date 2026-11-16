import { el, labelledButton } from "./dom";

/**
 * Get started (/start): the step after Sign in. The website's "Get started" leads here (through the
 * Sign in page once), and so does signing in without a destination. It asks one question, how to
 * use ATLAS Explain, and offers the two ways in side by side:
 *   - in an AI assistant: the connector address, ready to copy, and the setup steps (/connect);
 *   - in the browser: the web app.
 * It sits over the app frame as its own page, like the Sign in page, so the two read as one journey.
 */
export interface StartPage {
  node: HTMLElement;
  show(): void;
  hide(): void;
  readonly open: boolean;
}

export function createStartPage(options: { connectorUrl: string | null; onOpenApp: () => void }): StartPage {
  const node = el("div", "signin-page start-page");
  node.hidden = true;
  node.setAttribute("role", "dialog");
  node.setAttribute("aria-modal", "true");
  node.setAttribute("aria-labelledby", "start-title");

  const card = el("div", "signin-card start-card");
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

  const title = el("h1", "signin-title", "How do you want to use ATLAS Explain?");
  title.id = "start-title";
  // Focus lands on the question when the page opens, so a screen reader starts there.
  title.tabIndex = -1;
  const lede = el("p", "signin-lede", "Both are free, read-only and use the same sourced data. You can use either, or both, at any time.");

  /* In an AI assistant: the connector. */
  const assistant = el("section", "start-option");
  assistant.setAttribute("aria-labelledby", "start-assistant");
  const aTitle = el("h2", "start-option-title", "In your AI assistant");
  aTitle.id = "start-assistant";
  assistant.append(aTitle, el("p", "fine", "Add one address to Claude, ChatGPT, Cursor or VS Code, then ask as you normally would. No account or key."));
  if (options.connectorUrl) {
    const row = el("div", "start-copy");
    const code = el("code", undefined, options.connectorUrl);
    const copy = labelledButton("copy", "Copy", "secondary small");
    copy.addEventListener("click", () => {
      void navigator.clipboard?.writeText(options.connectorUrl ?? "").then(
        () => {
          copy.lastElementChild!.textContent = "Copied";
          window.setTimeout(() => (copy.lastElementChild!.textContent = "Copy"), 2000);
        },
        () => {
          // Clipboard refused: select the address so it can be copied by hand.
          const range = document.createRange();
          range.selectNodeContents(code);
          window.getSelection()?.removeAllRanges();
          window.getSelection()?.addRange(range);
        },
      );
    });
    row.append(code, copy);
    assistant.append(row);
  }
  const steps = document.createElement("a");
  steps.className = "start-link";
  steps.href = "/connect";
  steps.textContent = "Setup steps for each assistant";
  assistant.append(steps);

  /* In the browser: the web app. */
  const browser = el("section", "start-option");
  browser.setAttribute("aria-labelledby", "start-browser");
  const bTitle = el("h2", "start-option-title", "In your browser");
  bTitle.id = "start-browser";
  const open = labelledButton("chevron", "Open the web app", "primary");
  open.addEventListener("click", () => options.onOpenApp());
  browser.append(bTitle, el("p", "fine", "Type or paste any term, sentence or headline. In desktop Chrome, Gemini Nano answers on your device first."), open);

  const choices = el("div", "start-options");
  choices.append(assistant, browser);

  const links = el("p", "signin-links");
  for (const [href, label] of [["/support", "Help"], ["/privacy", "Privacy"], ["/", "Back to the website"]] as const) {
    const a = document.createElement("a");
    a.href = href;
    a.textContent = label;
    links.append(a);
  }
  card.append(brand, title, lede, choices, links);
  node.append(card);

  let isOpen = false;
  return {
    node,
    show() {
      node.hidden = false;
      isOpen = true;
      requestAnimationFrame(() => title.focus?.());
    },
    hide() {
      node.hidden = true;
      isOpen = false;
    },
    get open() {
      return isOpen;
    },
  };
}

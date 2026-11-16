import { el, labelledButton } from "./dom";
import { fullPage } from "./full-page";

/**
 * Get started (/start): the step after Sign in. The website's one button leads here (through the
 * Sign in page), and so does signing in without a destination. It asks one question, how to use
 * ATLAS Explain, and offers the two ways in side by side:
 *   - in an AI assistant: the connector address, ready to copy, and the setup steps (/connect);
 *   - in the browser: the web app.
 */
export interface StartPage {
  node: HTMLElement;
  show(): void;
  hide(): void;
  readonly open: boolean;
}

export function createStartPage(options: { connectorUrl: string | null; onOpenApp: () => void }): StartPage {
  const page = fullPage({
    id: "start-title",
    title: "How do you want to use ATLAS Explain?",
    lede: "Both are free, read-only and use the same sourced data. You can use either, or both, at any time.",
    links: [["/support", "Help"], ["/privacy", "Privacy"], ["/", "Back to the website"]],
    wide: true,
  });

  /* In an AI assistant: the connector. */
  const assistant = el("section", "start-option");
  assistant.setAttribute("aria-labelledby", "start-assistant");
  const aTitle = el("h2", "start-option-title", "In your AI assistant");
  aTitle.id = "start-assistant";
  assistant.append(aTitle, el("p", "fine", "Add one address to Claude, ChatGPT, Cursor or VS Code, then ask as you normally would."));
  if (options.connectorUrl) {
    const row = el("div", "start-copy");
    const code = el("code", undefined, options.connectorUrl);
    const copy = labelledButton("copy", "Copy", "secondary small");
    const label = copy.lastElementChild as HTMLElement;
    copy.addEventListener("click", () => {
      void navigator.clipboard?.writeText(options.connectorUrl ?? "").then(
        () => {
          label.textContent = "Copied";
          window.setTimeout(() => (label.textContent = "Copy"), 2000);
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

  return {
    node: page.node,
    show: () => page.show(choices),
    hide: () => page.hide(),
    get open() {
      return page.open;
    },
  };
}

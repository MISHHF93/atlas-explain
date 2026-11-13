/**
 * Last-resort error boundary for the wallet (web app and extension popup).
 *
 * - If mounting throws, or an uncaught error leaves the wallet empty, the
 *   root is replaced with a plain "Something went wrong" card and a reload
 *   button, instead of a blank popup.
 * - Errors after a successful mount are logged only; the wallet's own cards
 *   already show per-action error and offline states.
 *
 * Built with textContent only, never HTML strings, so it works under a strict CSP.
 */
export const FALLBACK_TITLE = "Something went wrong";
export const FALLBACK_TEXT =
  "ATLAS Explain hit an unexpected error. Nothing was sent or saved. Reload to try again. Educational information, not investment advice.";

export interface BoundaryTarget {
  readonly childElementCount: number;
}

/** The boundary only takes over when the wallet never rendered anything. */
export function shouldTakeOver(root: BoundaryTarget, alreadyShown: boolean): boolean {
  return !alreadyShown && root.childElementCount === 0;
}

export function renderFallback(root: HTMLElement, reload: () => void): void {
  const doc = root.ownerDocument;
  const card = doc.createElement("div");
  card.className = "card state state-error";
  card.setAttribute("role", "alert");
  const title = doc.createElement("p");
  title.className = "card-title";
  title.textContent = FALLBACK_TITLE;
  const text = doc.createElement("p");
  text.className = "fine strong";
  text.textContent = FALLBACK_TEXT;
  const button = doc.createElement("button");
  button.type = "button";
  button.className = "secondary small";
  button.textContent = "Reload";
  button.addEventListener("click", reload);
  card.append(title, text, button);
  root.replaceChildren(card);
}

export function installErrorBoundary(root: HTMLElement, reload: () => void = () => location.reload()): {
  mount(run: () => void | Promise<void>): Promise<void>;
} {
  let shown = false;
  const takeOver = (reason: unknown) => {
    console.error("[atlas-explain]", reason);
    if (!shouldTakeOver(root, shown)) return;
    shown = true;
    renderFallback(root, reload);
  };
  window.addEventListener("error", (event) => takeOver(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => takeOver(event.reason));
  return {
    async mount(run) {
      try {
        await run();
      } catch (error) {
        console.error("[atlas-explain]", error);
        if (!shown) {
          shown = true;
          renderFallback(root, reload);
        }
      }
    },
  };
}

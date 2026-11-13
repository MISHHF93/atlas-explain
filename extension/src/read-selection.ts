/** Injected only after a click. Reads the highlight and title, never form fields. */
export function readSelectionInPage(): { selection: string; title: string } {
  const selection = window.getSelection()?.toString() ?? "";
  return {
    selection: selection.slice(0, 4_000),
    title: document.title.slice(0, 180),
  };
}

/** Injected only after "Show button on this page". The button explains on a later click. */
export function pinExplainButton(): void {
  const existing = document.getElementById("atlas-explain-button");
  if (existing) return;
  const button = document.createElement("button");
  button.id = "atlas-explain-button";
  button.type = "button";
  button.textContent = "Explain";
  button.title = "Explain the highlighted text. Not balances or account numbers.";
  button.style.cssText = [
    "all: initial",
    "position: fixed",
    "right: 16px",
    "bottom: 16px",
    "z-index: 2147483646",
    "background: #0c6b5e",
    "color: #ffffff",
    "font: 13px/1.2 Segoe UI, sans-serif",
    "padding: 8px 12px",
    "border-radius: 999px",
    "border: 0",
    "cursor: pointer",
  ].join(";");
  button.addEventListener("click", () => {
    const selection = window.getSelection()?.toString() ?? "";
    void chrome.runtime.sendMessage({
      type: "atlas-explain-selection",
      selection: selection.slice(0, 4_000),
      title: document.title.slice(0, 180),
    });
  });
  document.documentElement.append(button);
}

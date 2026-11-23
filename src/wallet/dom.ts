import { icon, type IconName } from "./icons";

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function iconButton(name: IconName, label: string, className = "icon-btn"): HTMLButtonElement {
  const button = el("button", className);
  button.type = "button";
  button.setAttribute("aria-label", label);
  button.title = label;
  button.append(icon(name));
  return button;
}

export function labelledButton(name: IconName, label: string, className: string): HTMLButtonElement {
  const button = el("button", className);
  button.type = "button";
  button.append(icon(name, 16), el("span", undefined, label));
  return button;
}

let showMoreIds = 0;
/**
 * Shows the first `first` children of `list` and returns a "Show all N …" button for the rest (null when
 * nothing is hidden). The button says how many there are, and whether the list is open (aria-expanded).
 */
export function showFirst(list: HTMLElement, first: number, noun: string): HTMLButtonElement | null {
  const rows = [...list.children] as HTMLElement[];
  if (rows.length <= first) return null;
  if (!list.id) list.id = `show-more-${++showMoreIds}`;
  const button = el("button", "secondary small show-more");
  button.type = "button";
  button.setAttribute("aria-controls", list.id);
  let open = false;
  const apply = () => {
    rows.forEach((r, i) => (r.hidden = !open && i >= first));
    button.setAttribute("aria-expanded", String(open));
    button.textContent = open ? "Show fewer" : `Show all ${rows.length} ${noun}`;
  };
  button.addEventListener("click", () => {
    open = !open;
    apply();
  });
  apply();
  return button;
}

export function externalLink(label: string, href: string, className = "link-btn"): HTMLAnchorElement {
  const link = el("a", className, label);
  link.href = href;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.prepend(icon("external", 14));
  return link;
}

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Restart a one-shot CSS animation class. */
export function replay(node: HTMLElement, className: string): void {
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
}

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

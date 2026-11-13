import { EXTENSION_DISCLAIMER } from "../core/extension-prompt";
import { connectionCopy, signalCopy, type ConnectionState } from "../core/popup-copy";
import type { SignalView } from "../core/signal";
import { el, iconButton, prefersReducedMotion, replay } from "./dom";
import { icon, type IconName } from "./icons";

export type TabId = "explain" | "signal" | "glossary" | "settings";
export type ThemeChoice = "system" | "light" | "dark";

export const TABS: readonly { id: TabId; label: string; icon: IconName }[] = [
  { id: "explain", label: "Explain", icon: "sparkle" },
  { id: "signal", label: "Signal", icon: "signal" },
  { id: "glossary", label: "Glossary", icon: "book" },
  { id: "settings", label: "Settings", icon: "gear" },
];

export interface MenuItem {
  label: string;
  icon: IconName;
  run: () => void;
}

export interface WalletShell {
  frame: HTMLElement;
  panels: Record<TabId, HTMLElement>;
  current(): TabId;
  select(tab: TabId, options?: { focus?: boolean }): void;
  setSignal(view: SignalView): void;
  setConnection(state: ConnectionState): void;
  openSheet(title: string, nodes: Node[]): void;
  closeSheet(): void;
  announce(text: string): void;
  overlay(node: HTMLElement | null): void;
}

/**
 * The wallet frame shared by the Chrome extension popup and the hosted web app:
 * header (logo, status light, menu), tab panels, bottom navigation, a slide-in
 * sheet, and an overlay slot for onboarding.
 */
export function createWalletShell(options: {
  host: HTMLElement;
  surface: "extension" | "web";
  menu: MenuItem[];
  onSelect?: (tab: TabId) => void;
}): WalletShell {
  const frame = el("div", "wallet");
  frame.dataset.surface = options.surface;
  frame.dataset.tab = "explain";

  /* header */
  const header = el("header", "bar");
  const lockup = el("div", "lockup");
  const logo = document.createElement("img");
  logo.src = options.surface === "extension" ? "./logo.svg" : "/logo.svg";
  logo.alt = "";
  logo.width = 30;
  logo.height = 30;
  logo.className = "logo";
  const wordmark = el("div", "wordmark");
  wordmark.append(el("span", "mark", "ATLAS"), el("span", "name", "Explain"));
  lockup.append(logo, wordmark);

  const status = el("button", "conn");
  status.type = "button";
  status.dataset.state = "none";
  status.dataset.light = "grey";
  const statusLight = el("span", "conn-light");
  const statusLabel = el("span", "conn-label", "Not connected");
  status.append(statusLight, statusLabel);
  status.addEventListener("click", () => select("signal", { focus: true }));

  const menuButton = iconButton("more", "Menu");
  menuButton.setAttribute("aria-haspopup", "menu");
  menuButton.setAttribute("aria-expanded", "false");
  const menu = el("div", "menu");
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  for (const item of options.menu) {
    const entry = el("button", "menu-item");
    entry.type = "button";
    entry.setAttribute("role", "menuitem");
    entry.append(icon(item.icon, 16), el("span", undefined, item.label));
    entry.addEventListener("click", () => {
      toggleMenu(false);
      item.run();
    });
    menu.append(entry);
  }
  menuButton.addEventListener("click", () => toggleMenu(menu.hidden === true));
  menu.addEventListener("keydown", (event) => {
    const items = [...menu.querySelectorAll<HTMLButtonElement>(".menu-item")];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      toggleMenu(false);
      menuButton.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = (index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!menu.hidden && !menu.contains(event.target as Node) && !menuButton.contains(event.target as Node)) toggleMenu(false);
  });

  const tools = el("div", "bar-tools");
  tools.append(status, menuButton);
  header.append(lockup, tools, menu);

  /* panels */
  const body = el("main", "wallet-body");
  body.id = "main";
  const panels = {} as Record<TabId, HTMLElement>;
  for (const tab of TABS) {
    const panel = el("section", "panel");
    panel.id = `panel-${tab.id}`;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", `tab-${tab.id}`);
    panel.tabIndex = -1;
    panel.hidden = tab.id !== "explain";
    panels[tab.id] = panel;
    body.append(panel);
  }

  /* bottom navigation */
  const nav = el("nav", "tabbar");
  nav.setAttribute("aria-label", "ATLAS Explain");
  const list = el("div", "tabbar-list");
  list.setAttribute("role", "tablist");
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  for (const tab of TABS) {
    const button = el("button", "tab");
    button.type = "button";
    button.id = `tab-${tab.id}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `panel-${tab.id}`);
    button.dataset.tab = tab.id;
    button.append(icon(tab.icon, 20), el("span", undefined, tab.label));
    button.addEventListener("click", () => select(tab.id));
    button.addEventListener("keydown", (event) => {
      const order = TABS.map((t) => t.id);
      const at = order.indexOf(tab.id);
      let next: TabId | undefined;
      if (event.key === "ArrowRight") next = order[(at + 1) % order.length];
      if (event.key === "ArrowLeft") next = order[(at - 1 + order.length) % order.length];
      if (event.key === "Home") next = order[0];
      if (event.key === "End") next = order[order.length - 1];
      if (next) {
        event.preventDefault();
        select(next);
        tabButtons.get(next)?.focus();
      }
    });
    tabButtons.set(tab.id, button);
    list.append(button);
  }
  const indicator = el("span", "tab-indicator");
  indicator.setAttribute("aria-hidden", "true");
  list.append(indicator);
  nav.append(list);

  /* footer line */
  const foot = el("p", "edu-line");
  foot.append(icon("shield", 12), el("span", undefined, EXTENSION_DISCLAIMER));

  /* sheet */
  const sheet = el("section", "sheet");
  sheet.setAttribute("role", "dialog");
  sheet.setAttribute("aria-modal", "true");
  sheet.setAttribute("aria-labelledby", "sheet-title");
  sheet.hidden = true;
  const sheetHead = el("div", "sheet-head");
  const sheetBack = iconButton("back", "Back");
  const sheetTitle = el("h2", undefined, "");
  sheetTitle.id = "sheet-title";
  sheetHead.append(sheetBack, sheetTitle);
  const sheetBody = el("div", "sheet-body");
  sheet.append(sheetHead, sheetBody);
  sheetBack.addEventListener("click", () => closeSheet());
  sheet.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeSheet();
    }
  });

  const overlaySlot = el("div", "overlay-slot");

  const live = el("p", "sr-only");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");

  frame.append(header, body, foot, nav, sheet, overlaySlot, live);
  options.host.append(frame);

  let current: TabId = "explain";
  let sheetReturn: HTMLElement | null = null;
  markTabs();

  function select(tab: TabId, opts: { focus?: boolean } = {}): void {
    if (tab === current) {
      if (opts.focus) panels[tab].focus();
      return;
    }
    const order = TABS.map((t) => t.id);
    const forward = order.indexOf(tab) > order.indexOf(current);
    panels[current].hidden = true;
    current = tab;
    frame.dataset.tab = tab;
    const panel = panels[tab];
    panel.hidden = false;
    panel.dataset.from = forward ? "right" : "left";
    replay(panel, "enter");
    body.scrollTop = 0;
    markTabs();
    if (opts.focus) panel.focus();
    options.onSelect?.(tab);
  }

  function markTabs(): void {
    TABS.forEach((tab, index) => {
      const button = tabButtons.get(tab.id);
      const on = tab.id === current;
      button?.setAttribute("aria-selected", on ? "true" : "false");
      if (button) button.tabIndex = on ? 0 : -1;
      if (on) indicator.style.setProperty("--tab-index", String(index));
    });
  }

  function toggleMenu(open: boolean): void {
    menu.hidden = !open;
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      replay(menu, "enter");
      menu.querySelector<HTMLButtonElement>(".menu-item")?.focus();
    }
  }

  function setSignal(view: SignalView): void {
    const copy = signalCopy(view);
    status.dataset.light = view.colour;
    status.setAttribute("aria-label", `Signal light: ${copy.headline}. ${statusLabel.textContent}. Open the Signal tab.`);
    status.title = `${copy.headline}. Open the Signal tab.`;
  }

  function setConnection(state: ConnectionState): void {
    const copy = connectionCopy(state);
    status.dataset.state = state;
    statusLabel.textContent = copy.label;
  }

  function openSheet(title: string, nodes: Node[]): void {
    sheetReturn = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetTitle.textContent = title;
    sheetBody.replaceChildren(...nodes);
    sheet.hidden = false;
    sheet.scrollTop = 0;
    for (const part of [header, body, nav, foot]) part.inert = true;
    requestAnimationFrame(() => {
      frame.dataset.sheet = "open";
      sheetBack.focus();
    });
  }

  function closeSheet(): void {
    delete frame.dataset.sheet;
    for (const part of [header, body, nav, foot]) part.inert = false;
    window.setTimeout(() => {
      if (frame.dataset.sheet !== "open") sheet.hidden = true;
    }, prefersReducedMotion() ? 0 : 220);
    sheetReturn?.focus();
  }

  function overlay(node: HTMLElement | null): void {
    overlaySlot.replaceChildren(...(node ? [node] : []));
    const on = Boolean(node);
    frame.dataset.overlay = on ? "open" : "";
    for (const part of [header, body, nav, foot]) part.inert = on;
  }

  return {
    frame,
    panels,
    current: () => current,
    select,
    setSignal,
    setConnection,
    openSheet,
    closeSheet,
    announce: (text) => {
      live.textContent = text;
    },
    overlay,
  };
}

export function applyTheme(choice: ThemeChoice): void {
  if (choice === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}

export function isTheme(value: unknown): value is ThemeChoice {
  return value === "system" || value === "light" || value === "dark";
}

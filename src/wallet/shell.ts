import { EXTENSION_DISCLAIMER } from "../core/extension-prompt";
import type { AccountView } from "../core/account";
import { connectionCopy, showsConnectionChip, signalCopy, type ConnectionState } from "../core/popup-copy";
import type { SignalView } from "../core/signal";
import { el, iconButton, prefersReducedMotion, replay } from "./dom";
import { icon, type IconName } from "./icons";

export type TabId = "today" | "explain" | "assets" | "signal" | "glossary" | "settings";

/** Every panel the shell can host. Only the tabs passed in (or TABS) appear in the navigation. */
export const ALL_TAB_IDS: readonly TabId[] = ["today", "explain", "assets", "signal", "glossary", "settings"];
export type ThemeChoice = "system" | "light" | "dark";

export interface TabDef { id: TabId; label: string; icon: IconName }

export const TABS: readonly TabDef[] = [
  { id: "explain", label: "Explain", icon: "sparkle" },
  { id: "assets", label: "Assets", icon: "coins" },
  { id: "signal", label: "Signal", icon: "signal" },
  { id: "glossary", label: "Learn", icon: "book" },
  { id: "settings", label: "Settings", icon: "gear" },
];

export interface MenuItem {
  /** Lets setMenuItemHidden() find the item later. */
  id?: string;
  /** Starts hidden (for example, ATLAS-only items). */
  hidden?: boolean;
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
  /** Header account chip. Hidden until an account handler is passed to the shell. */
  setAccount(view: AccountView | null): void;
  /** Shows or hides a tab in the navigation. A hidden current tab falls back to the first visible one. */
  setTabHidden(tab: TabId, hidden: boolean): void;
  setMenuItemHidden(id: string, hidden: boolean): void;
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
  surface: "extension" | "web" | "app";
  menu: MenuItem[];
  onSelect?: (tab: TabId) => void;
  onAccount?: () => void;
  /** Tabs shown in the navigation, in order. Defaults to the extension's five. */
  tabs?: readonly TabDef[];
  /** First tab shown. Defaults to the first tab. */
  initialTab?: TabId;
  /** Header status pill. Defaults to opening the Signal tab. */
  onStatus?: () => void;
  /** Called after the slide-in sheet closes (Back, Escape or closeSheet()). */
  onSheetClose?: () => void;
}): WalletShell {
  const tabs = options.tabs ?? TABS;
  const firstTab: TabId = options.initialTab ?? tabs[0]?.id ?? "explain";
  const frame = el("div", "wallet");
  frame.dataset.surface = options.surface;
  frame.dataset.tab = firstTab;

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
  const statusLabel = el("span", "conn-label", "");
  status.hidden = true;
  const statusCaret = icon("chevron", 12);
  statusCaret.classList.add("conn-caret");
  status.append(statusLight, statusLabel, statusCaret);
  status.addEventListener("click", () => (options.onStatus ? options.onStatus() : select(hiddenTabs.has("signal") ? "assets" : "signal", { focus: true })));

  const menuButton = iconButton("more", "Menu");
  menuButton.setAttribute("aria-haspopup", "menu");
  menuButton.setAttribute("aria-expanded", "false");
  const menu = el("div", "menu");
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  const menuEntries = new Map<string, HTMLButtonElement>();
  for (const item of options.menu) {
    const entry = el("button", "menu-item");
    entry.hidden = item.hidden === true;
    if (item.id) menuEntries.set(item.id, entry);
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
    const items = [...menu.querySelectorAll<HTMLButtonElement>(".menu-item:not([hidden])")];
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

  const accountButton = el("button", "acct");
  accountButton.type = "button";
  accountButton.dataset.signedIn = "false";
  accountButton.hidden = !options.onAccount;
  accountButton.setAttribute("aria-label", "Account: signed out. Open account.");
  accountButton.title = "Sign in or manage your account";
  accountButton.append(icon("user", 16));
  accountButton.addEventListener("click", () => options.onAccount?.());

  const tools = el("div", "bar-tools");
  tools.append(status, accountButton, menuButton);
  header.append(lockup, tools, menu);

  /* panels */
  const body = el("main", "wallet-body");
  body.id = "main";
  body.addEventListener("scroll", () => {
    const scrolled = body.scrollTop > 4 ? "true" : "false";
    if (frame.dataset.scrolled !== scrolled) frame.dataset.scrolled = scrolled;
  }, { passive: true });
  const panels = {} as Record<TabId, HTMLElement>;
  for (const id of ALL_TAB_IDS) {
    const panel = el("section", "panel");
    panel.id = `panel-${id}`;
    panel.setAttribute("role", "tabpanel");
    if (tabs.some((t) => t.id === id)) panel.setAttribute("aria-labelledby", `tab-${id}`);
    panel.tabIndex = -1;
    panel.hidden = id !== firstTab;
    panels[id] = panel;
    body.append(panel);
  }

  /* bottom navigation */
  const nav = el("nav", "tabbar");
  nav.setAttribute("aria-label", "ATLAS Explain");
  const list = el("div", "tabbar-list");
  list.style.setProperty("--tab-count", String(tabs.length));
  list.setAttribute("role", "tablist");
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const hiddenTabs = new Set<TabId>();
  for (const tab of tabs) {
    const button = el("button", "tab");
    button.type = "button";
    button.id = `tab-${tab.id}`;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `panel-${tab.id}`);
    button.dataset.tab = tab.id;
    button.append(icon(tab.icon, 20), el("span", undefined, tab.label));
    button.addEventListener("click", () => select(tab.id));
    button.addEventListener("keydown", (event) => {
      const order = tabs.map((t) => t.id).filter((id) => !hiddenTabs.has(id));
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

  let current: TabId = firstTab;
  let sheetReturn: HTMLElement | null = null;
  markTabs();

  function select(tab: TabId, opts: { focus?: boolean } = {}): void {
    if (tab === current) {
      if (opts.focus) panels[tab].focus();
      return;
    }
    const order = ALL_TAB_IDS;
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
    const shown = tabs.filter((tab) => !hiddenTabs.has(tab.id));
    list.style.setProperty("--tab-count", String(shown.length));
    shown.forEach((tab, index) => {
      const button = tabButtons.get(tab.id);
      const on = tab.id === current;
      button?.setAttribute("aria-selected", on ? "true" : "false");
      if (button) button.tabIndex = on ? 0 : -1;
      if (on) indicator.style.setProperty("--tab-index", String(index));
    });
  }

  function setTabHidden(tab: TabId, hidden: boolean): void {
    const button = tabButtons.get(tab);
    if (!button || button.hidden === hidden) return;
    button.hidden = hidden;
    if (hidden) hiddenTabs.add(tab);
    else hiddenTabs.delete(tab);
    const fallback = tabs.find((t) => !hiddenTabs.has(t.id))?.id;
    if (hidden && current === tab && fallback) select(fallback);
    else markTabs();
  }

  function toggleMenu(open: boolean): void {
    menu.hidden = !open;
    menuButton.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      replay(menu, "enter");
      menu.querySelector<HTMLButtonElement>(".menu-item:not([hidden])")?.focus();
    }
  }

  function setSignal(view: SignalView): void {
    const copy = signalCopy(view);
    status.dataset.light = view.colour;
    if (hiddenTabs.has("signal")) {
      status.setAttribute("aria-label", `${statusLabel.textContent}. Open Assets.`);
      status.title = connectionCopy((status.dataset.state ?? "none") as ConnectionState).title;
    } else {
      status.setAttribute("aria-label", `Signal light: ${copy.headline}. ${statusLabel.textContent}. Open the Signal tab.`);
      status.title = `${copy.headline}. Open the Signal tab.`;
    }
  }

  function setConnection(state: ConnectionState): void {
    const copy = connectionCopy(state);
    status.dataset.state = state;
    statusLabel.textContent = copy.label;
    status.hidden = !showsConnectionChip(state);
  }

  function setAccount(view: AccountView | null): void {
    accountButton.dataset.signedIn = view?.signedIn ? "true" : "false";
    if (view?.signedIn) {
      accountButton.replaceChildren(el("span", "acct-initials", view.initials));
      accountButton.setAttribute("aria-label", `Account: signed in as ${view.label}. Open account.`);
      accountButton.title = `Signed in as ${view.label}`;
    } else {
      accountButton.replaceChildren(icon("user", 16));
      accountButton.setAttribute("aria-label", "Account: signed out. Open account.");
      accountButton.title = "Sign in or manage your account";
    }
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
    const wasOpen = frame.dataset.sheet === "open";
    delete frame.dataset.sheet;
    for (const part of [header, body, nav, foot]) part.inert = false;
    window.setTimeout(() => {
      if (frame.dataset.sheet !== "open") sheet.hidden = true;
    }, prefersReducedMotion() ? 0 : 220);
    sheetReturn?.focus();
    if (wasOpen) options.onSheetClose?.();
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
    setAccount,
    setTabHidden,
    setMenuItemHidden: (id, hidden) => {
      const entry = menuEntries.get(id);
      if (entry) entry.hidden = hidden;
    },
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

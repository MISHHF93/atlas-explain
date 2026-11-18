import { ANSWER_DISCLAIMER } from "../core/explain-prompt";
import type { AccountView } from "../core/account";
import { connectionCopy, showsConnectionChip, signalCopy, type ConnectionState } from "../core/app-copy";
import type { SignalView } from "../core/signal";
import { el, iconButton, prefersReducedMotion, replay } from "./dom";
import { icon, type IconName } from "./icons";

export type TabId = "today" | "explain" | "assets" | "signal" | "glossary" | "settings";

/** Every panel the shell can host. Only the tabs passed in (or TABS) appear in the navigation. */
export const ALL_TAB_IDS: readonly TabId[] = ["today", "explain", "assets", "signal", "glossary", "settings"];
export type ThemeChoice = "system" | "light" | "dark";

export interface TabDef { id: TabId; label: string; icon: IconName }

/**
 * The default tabs: Explain, Learn, Assets. Signal is a fourth, shown only while ATLAS
 * research software is running. Settings is not a tab; it opens from the menu as a sheet.
 */
export const TABS: readonly TabDef[] = [
  { id: "explain", label: "Explain", icon: "sparkle" },
  { id: "glossary", label: "Learn", icon: "book" },
  { id: "assets", label: "Assets", icon: "coins" },
  { id: "signal", label: "Signal", icon: "signal" },
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
  /** Shows or hides a tab in the navigation. A hidden current tab falls back to the first visible one. Tabbed layout only. */
  setTabHidden(tab: TabId, hidden: boolean): void;
  setMenuItemHidden(id: string, hidden: boolean): void;
  openSheet(title: string, nodes: Node[]): void;
  closeSheet(): void;
  announce(text: string): void;
  overlay(node: HTMLElement | null): void;
}

/**
 * The wallet frame of the hosted web app:
 * header (logo, status light, menu), tab panels, bottom navigation, a slide-in
 * sheet, and an overlay slot for onboarding.
 */
export function createWalletShell(options: {
  host: HTMLElement;
  surface: "web" | "app";
  menu: MenuItem[];
  onSelect?: (tab: TabId) => void;
  onAccount?: () => void;
  /**
   * Signed-in account menu (the web app). When given, the header shows a "Sign in" button while
   * signed out, and the initials open this menu (name, email, these actions) while signed in.
   * Without it the account button keeps its compact icon and opens onAccount.
   */
  accountMenu?: MenuItem[];
  /** Tabs shown in the navigation, in order. Defaults to TABS. */
  tabs?: readonly TabDef[];
  /** First tab shown. Defaults to the first tab. */
  initialTab?: TabId;
  /** Header status pill. Defaults to opening the Signal tab. */
  onStatus?: () => void;
  /** Called after the slide-in sheet closes (Back, Escape or closeSheet()). */
  onSheetClose?: () => void;
  /**
   * "tabs" (default) shows one panel at a time. "page" stacks every panel in `tabs` on one
   * scrolling page; the navigation then jumps between sections and follows the scroll position.
   */
  layout?: "tabs" | "page";
  /** Page layout only: the section in view changed because the visitor scrolled. */
  onSection?: (tab: TabId) => void;
}): WalletShell {
  const paged = options.layout === "page";
  const tabs = options.tabs ?? TABS;
  const firstTab: TabId = options.initialTab ?? tabs[0]?.id ?? "explain";
  const frame = el("div", "wallet");
  frame.dataset.surface = options.surface;
  frame.dataset.tab = firstTab;
  if (paged) frame.dataset.layout = "page";

  /* header */
  const header = el("header", "bar");
  // Page layout: the logo is the way back to the top (the first section).
  const lockup = paged ? el("button", "lockup lockup-home") : el("div", "lockup");
  if (lockup instanceof HTMLButtonElement) {
    lockup.type = "button";
    lockup.setAttribute("aria-label", "ATLAS Explain: back to the top");
    lockup.addEventListener("click", () => select(tabs[0]?.id ?? firstTab, { focus: true }));
  }
  const logo = document.createElement("img");
  logo.src = "/logo.svg";
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
  const wideAccount = Boolean(options.accountMenu);
  if (wideAccount) accountButton.classList.add("acct-wide");

  /* the signed-in account menu (web app only) */
  const accountMenu = el("div", "menu acct-menu");
  accountMenu.setAttribute("role", "menu");
  accountMenu.hidden = true;
  const accountWho = el("div", "acct-menu-who");
  const accountName = el("strong", "acct-menu-name");
  const accountEmail = el("span", "acct-menu-email");
  accountWho.append(accountName, accountEmail);
  accountMenu.append(accountWho);
  for (const item of options.accountMenu ?? []) {
    const entry = el("button", "menu-item");
    entry.type = "button";
    entry.setAttribute("role", "menuitem");
    entry.append(icon(item.icon, 16), el("span", undefined, item.label));
    entry.addEventListener("click", () => {
      toggleAccountMenu(false);
      item.run();
    });
    accountMenu.append(entry);
  }
  function toggleAccountMenu(open: boolean): void {
    accountMenu.hidden = !open;
    accountButton.setAttribute("aria-expanded", String(open));
    if (open) {
      toggleMenu(false);
      replay(accountMenu, "enter");
      accountMenu.querySelector<HTMLButtonElement>(".menu-item")?.focus();
    }
  }
  accountMenu.addEventListener("keydown", (event) => {
    const items = [...accountMenu.querySelectorAll<HTMLButtonElement>(".menu-item")];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "Escape") {
      event.preventDefault();
      toggleAccountMenu(false);
      accountButton.focus();
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (!accountMenu.hidden && !accountMenu.contains(event.target as Node) && !accountButton.contains(event.target as Node)) toggleAccountMenu(false);
  });
  accountButton.addEventListener("click", () => {
    if (wideAccount && accountButton.dataset.signedIn === "true") toggleAccountMenu(accountMenu.hidden === true);
    else options.onAccount?.();
  });

  const tools = el("div", "bar-tools");
  tools.append(status, accountButton, menuButton);
  header.append(lockup, tools, menu, accountMenu);

  /* panels */
  const body = el("main", "wallet-body");
  body.id = "main";
  body.addEventListener("scroll", () => {
    const scrolled = body.scrollTop > 4 ? "true" : "false";
    if (frame.dataset.scrolled !== scrolled) frame.dataset.scrolled = scrolled;
    if (paged) followScroll();
  }, { passive: true });
  const panels = {} as Record<TabId, HTMLElement>;
  const isSection = (id: TabId): boolean => tabs.some((t) => t.id === id);
  // Page layout: sections sit in navigation order; panels that are not sections stay hidden.
  const panelOrder = paged ? [...tabs.map((t) => t.id), ...ALL_TAB_IDS.filter((id) => !isSection(id))] : ALL_TAB_IDS;
  for (const id of panelOrder) {
    const panel = el("section", "panel");
    panel.id = `panel-${id}`;
    if (!paged) {
      panel.setAttribute("role", "tabpanel");
      if (isSection(id)) panel.setAttribute("aria-labelledby", `tab-${id}`);
    }
    panel.tabIndex = -1;
    panel.hidden = paged ? !isSection(id) : id !== firstTab;
    // The last section is given room so a jump to it can bring its title to the top.
    if (paged && id === tabs[tabs.length - 1]?.id) panel.classList.add("panel-last");
    panels[id] = panel;
    body.append(panel);
  }

  /* navigation: bottom tabs, or (page layout) slim section links in the header */
  const nav = el("nav", paged ? "section-nav" : "tabbar");
  nav.setAttribute("aria-label", paged ? "Sections" : "ATLAS Explain");
  const list = el("div", paged ? "section-links" : "tabbar-list");
  list.style.setProperty("--tab-count", String(tabs.length));
  if (!paged) list.setAttribute("role", "tablist");
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const hiddenTabs = new Set<TabId>();
  // Page layout: the first section is the top of the page, reached by the logo, so it gets no link.
  for (const tab of paged ? tabs.slice(1) : tabs) {
    const button = el("button", paged ? "section-link" : "tab");
    button.type = "button";
    button.id = `tab-${tab.id}`;
    if (!paged) button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `panel-${tab.id}`);
    button.dataset.tab = tab.id;
    if (paged) button.append(el("span", undefined, tab.label));
    else button.append(icon(tab.icon, 20), el("span", undefined, tab.label));
    button.addEventListener("click", () => select(tab.id));
    button.addEventListener("keydown", (event) => {
      if (paged) return;
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
  if (!paged) list.append(indicator);
  nav.append(list);
  // Page layout: the links sit in the header, between the logo and the tools.
  if (paged) header.insertBefore(nav, tools);

  /* footer line */
  const foot = el("p", "edu-line");
  foot.append(icon("shield", 12), el("span", undefined, ANSWER_DISCLAIMER));

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

  if (paged) frame.append(header, body, foot, sheet, overlaySlot, live);
  else frame.append(header, body, foot, nav, sheet, overlaySlot, live);
  options.host.append(frame);

  let current: TabId = paged && !isSection(firstTab) ? tabs[0]?.id ?? firstTab : firstTab;
  let sheetReturn: HTMLElement | null = null;
  /** While a jump is scrolling, the scroll position must not move the highlight back. */
  let jumpUntil = 0;
  markTabs();

  /** Page layout: the section whose top has passed the top of the scroll area (the last one at the very bottom). */
  function sectionInView(): TabId {
    const shown = tabs.map((t) => t.id);
    if (body.scrollTop + body.clientHeight >= body.scrollHeight - 4 && body.scrollTop > 0) return shown[shown.length - 1] ?? current;
    const line = body.getBoundingClientRect().top + 96;
    let found = shown[0] ?? current;
    for (const id of shown) if (panels[id].getBoundingClientRect().top <= line) found = id;
    return found;
  }

  function followScroll(): void {
    if (Date.now() < jumpUntil) return;
    const tab = sectionInView();
    if (tab === current) return;
    current = tab;
    frame.dataset.tab = tab;
    markTabs();
    options.onSection?.(tab);
  }

  function select(tab: TabId, opts: { focus?: boolean } = {}): void {
    if (paged) {
      // Not a section (for example Account, which opens as a sheet): nothing to scroll to.
      if (!isSection(tab)) return;
      const changed = tab !== current;
      current = tab;
      frame.dataset.tab = tab;
      markTabs();
      jumpUntil = Date.now() + 900;
      // Instant, not smooth: a smooth scroll is cancelled when late content changes the page height.
      if (tab === tabs[0]?.id) body.scrollTo({ top: 0, behavior: "instant" });
      else panels[tab].scrollIntoView({ block: "start", behavior: "instant" });
      if (opts.focus) panels[tab].focus({ preventScroll: true });
      if (changed) options.onSelect?.(tab);
      return;
    }
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
      if (paged) {
        // Section links, not tabs: every one stays reachable with Tab.
        if (on) button?.setAttribute("aria-current", "true");
        else button?.removeAttribute("aria-current");
      } else {
        button?.setAttribute("aria-selected", on ? "true" : "false");
        if (button) button.tabIndex = on ? 0 : -1;
      }
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
      if (!accountMenu.hidden) toggleAccountMenu(false);
      replay(menu, "enter");
      menu.querySelector<HTMLButtonElement>(".menu-item:not([hidden])")?.focus();
    }
  }

  function setSignal(view: SignalView): void {
    const copy = signalCopy(view);
    status.dataset.light = view.colour;
    // Public visitors have no ATLAS desk: describe the live-prices status only, without desk jargon.
    if (hiddenTabs.has("signal") || !view.connected) {
      // The chip's visible text ("Live prices") names it; no separate label to fall out of step with it.
      status.removeAttribute("aria-label");
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
      // Initials and the word "Account", so it reads as a button and not a decoration.
      accountButton.replaceChildren(el("span", "acct-initials", view.initials), ...(wideAccount ? [el("span", "acct-label", "Account")] : []));
      accountButton.setAttribute("aria-label", wideAccount ? `Account menu: signed in as ${view.label}` : `Account: signed in as ${view.label}. Open account.`);
      accountButton.title = `Signed in as ${view.label}`;
      if (wideAccount) accountButton.setAttribute("aria-haspopup", "menu");
      accountName.textContent = view.label;
      accountEmail.textContent = view.email ?? (view.provider === "google" ? "Google account" : "");
      accountEmail.hidden = !accountEmail.textContent;
    } else {
      toggleAccountMenu(false);
      accountButton.removeAttribute("aria-haspopup");
      if (wideAccount) {
        accountButton.replaceChildren(icon("user", 16), el("span", "acct-label", "Sign in"));
        accountButton.setAttribute("aria-label", "Sign in");
        accountButton.title = "Sign in to keep your saved explanations across devices";
      } else {
        accountButton.replaceChildren(icon("user", 16));
        accountButton.setAttribute("aria-label", "Account: signed out. Open account.");
        accountButton.title = "Sign in or manage your account";
      }
    }
  }
  setAccount(null);

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

/**
 * Settings, built once for both surfaces. The web app shows it in the account sheet; the
 * extension popup shows it from its menu. The groups, their order, their titles and the
 * shared wording live here. A surface only says what it can do: the popup can pin a button
 * to the page and open the side panel; the web app can export or delete an account.
 */
import { group, row, themePicker } from "./cards";
import { el } from "./dom";
import type { IconName } from "./icons";
import { applyTheme, type ThemeChoice } from "./shell";

/** The one explanation of the hybrid, shown on every surface. */
export const HOW_ANSWERS_ARE_MADE =
  "When your browser supports it, Gemini Nano answers on your device and nothing is sent. Otherwise Gemini answers in the cloud. Every answer is labelled.";
export const ABOUT_LINE = "ATLAS Explain is open source under the Apache-2.0 licence. Education only, never investment advice.";
const ATLAS_NOTE = "If you run ATLAS research software on this computer, ATLAS Explain can read its prices and research figures. Most people don't need this.";

/** The group titles, in the order they appear. Tests and both surfaces rely on this one list. */
export const SETTINGS_GROUPS = ["Appearance", "How answers are made", "Your data", "Usage statistics", "Privacy and terms", "For ATLAS users", "About"] as const;

export interface SettingsAction {
  icon: IconName;
  label: string;
  run: () => void;
}

export interface SettingsOptions {
  /** The plan card. The web app swaps its contents as the plan loads. */
  plan: Node;
  theme: ThemeChoice;
  /** Remember the choice. Applying it to the page is done here. */
  onTheme: (choice: ThemeChoice) => void;
  /** The full "Your data" group. */
  yourData: HTMLElement;
  /** Web app only, and only when the owner has switched analytics on. */
  stats?: HTMLElement;
  legal: { note?: string; onTerms?: () => void; onPrivacy: () => void };
  /** Optional: read ATLAS research software on this computer. */
  atlas?: SettingsAction;
  about: { version?: string; hint?: string; action: SettingsAction };
}

export interface SettingsHandle {
  nodes: Node[];
  /** Show a theme that was loaded after the sheet was built. */
  setTheme: (choice: ThemeChoice) => void;
  /** Relabel the ATLAS row. */
  setAtlasLabel: (label: string) => void;
}

export function buildSettings(options: SettingsOptions): SettingsHandle {
  const themeSlot = el("div");
  const paintTheme = (current: ThemeChoice): void => {
    themeSlot.replaceChildren(themePicker(current, (choice) => {
      applyTheme(choice);
      options.onTheme(choice);
    }));
  };
  paintTheme(options.theme);

  const act = (a: SettingsAction): HTMLButtonElement => row(a.icon, a.label, a.run);
  const nodes: Node[] = [options.plan, group("Appearance", [themeSlot])];

  nodes.push(group("How answers are made", [el("p", "fine", HOW_ANSWERS_ARE_MADE)]));

  nodes.push(options.yourData);

  if (options.stats) nodes.push(options.stats);

  nodes.push(group("Privacy and terms", [
    ...(options.legal.note ? [el("p", "fine", options.legal.note)] : []),
    ...(options.legal.onTerms ? [row("doc", "Terms", options.legal.onTerms)] : []),
    row("shield", "Privacy", options.legal.onPrivacy),
  ]));

  const atlasRow = options.atlas ? act(options.atlas) : null;
  if (atlasRow) nodes.push(group("For ATLAS users", [el("p", "fine", ATLAS_NOTE), atlasRow]));

  const version = options.about.version ? `Version ${options.about.version}. ` : "";
  nodes.push(group("About", [
    el("p", "fine", `${version}${ABOUT_LINE}${options.about.hint ? ` ${options.about.hint}` : ""}`),
    act(options.about.action),
  ]));

  return {
    nodes,
    setTheme: paintTheme,
    setAtlasLabel: (label) => {
      const text = atlasRow?.querySelector("span");
      if (text) text.textContent = label;
    },
  };
}

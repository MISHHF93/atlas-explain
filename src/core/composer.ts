/**
 * The minimal Explain composer has one primary button. With an empty box it reads the
 * highlight on the page; once the reader types, the same button explains the typed text.
 */
export type ComposerMode = "highlight" | "typed";

export interface ComposerAction {
  mode: ComposerMode;
  label: string;
  icon: "highlight" | "sparkle";
}

export function composerAction(typed: string): ComposerAction {
  return typed.trim()
    ? { mode: "typed", label: "Explain", icon: "sparkle" }
    : { mode: "highlight", label: "Explain highlight", icon: "highlight" };
}

export const COMPOSER_PLACEHOLDER = "Highlight text on the page, or type a term: stop-limit, margin, IV…";

/** One quiet line instead of an empty-state card. */
export function composerHint(shortcutHint: string): string {
  return `Right-click any text and choose Explain with ATLAS. ${shortcutHint}`;
}

/** Explain tab budget: the blocks a reader sees before asking anything. */
export const EXPLAIN_TAB_BLOCKS = ["composer", "engine", "today", "result", "recent"] as const;

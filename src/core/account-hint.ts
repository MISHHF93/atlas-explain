/**
 * A small "signed in on this browser" hint, so the public website can show your initials and
 * a link to your account without loading Firebase. The app writes it when the account changes;
 * the site pages only read it. It holds nothing private: initials and the display label (never
 * the email or the account id), and it is only a display hint: the app always checks the real
 * sign-in itself.
 */
export const ACCOUNT_HINT_KEY = "atlas-explain:account-hint";

export interface AccountHint {
  initials: string;
  label: string;
}

/** Saves or clears the hint. Never throws (storage can be blocked). */
export function saveAccountHint(view: { signedIn: boolean; initials: string; label: string } | null, storage: Pick<Storage, "setItem" | "removeItem"> | null = safeStorage()): void {
  try {
    if (view?.signedIn) storage?.setItem(ACCOUNT_HINT_KEY, JSON.stringify({ initials: view.initials.slice(0, 3), label: view.label.slice(0, 60) }));
    else storage?.removeItem(ACCOUNT_HINT_KEY);
  } catch {
    // Storage blocked or full: the website simply shows "Sign in".
  }
}

/** Reads the hint; null when signed out, missing or malformed. */
export function readAccountHint(storage: Pick<Storage, "getItem"> | null = safeStorage()): AccountHint | null {
  try {
    const raw = storage?.getItem(ACCOUNT_HINT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<AccountHint>;
    return typeof v.initials === "string" && v.initials && typeof v.label === "string" ? { initials: v.initials.slice(0, 3), label: v.label.slice(0, 60) } : null;
  } catch {
    return null;
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

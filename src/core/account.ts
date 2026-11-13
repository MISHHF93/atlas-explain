/**
 * Account state shared by the web app and the extension. Pure, so it is tested
 * without Firebase. ATLAS Explain stays usable signed out: a signed-out visitor
 * gets an anonymous id so saved explanations stay on that browser.
 */
export interface AccountView {
  uid: string;
  signedIn: boolean;
  label: string;
  email: string | null;
  initials: string;
  provider: "google" | "email" | "anonymous";
}

export interface AuthUserLike {
  uid: string;
  isAnonymous: boolean;
  displayName: string | null;
  email: string | null;
  providerData: readonly { providerId: string }[];
}

export function accountView(user: AuthUserLike | null): AccountView | null {
  if (!user) return null;
  if (user.isAnonymous) {
    return { uid: user.uid, signedIn: false, label: "Signed out", email: null, initials: "", provider: "anonymous" };
  }
  const google = user.providerData.some((p) => p.providerId === "google.com");
  const name = (user.displayName ?? "").trim();
  const email = (user.email ?? "").trim() || null;
  const label = name || email || "Signed in";
  return { uid: user.uid, signedIn: true, label, email, initials: initialsFor(label), provider: google ? "google" : "email" };
}

export function initialsFor(label: string): string {
  const base = label.includes("@") ? label.split("@")[0] ?? "" : label;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "?").slice(0, 2);
  return letters.toUpperCase();
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_PATTERN.test(value.trim());
}

/** Firebase Auth error codes in plain language. Never echoes tokens or raw payloads. */
export function authErrorCopy(code: string): string {
  switch (code) {
    case "auth/operation-not-allowed":
    case "auth/configuration-not-found":
      return "This sign-in method is not switched on for ATLAS Explain yet. You can keep using the app signed out.";
    case "auth/unauthorized-domain":
      return "Sign-in is not allowed from this address. Open atlas-explain.web.app and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return "Sign-in was cancelled. Nothing changed.";
    case "auth/network-request-failed":
      return "Sign-in could not reach Google. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/invalid-email":
      return "That email address does not look right.";
    case "auth/invalid-action-code":
    case "auth/expired-action-code":
      return "This sign-in link has expired or was already used. Ask for a new one.";
    case "auth/account-exists-with-different-credential":
      return "That email already signs in another way. Use the method you used before.";
    case "auth/firebase-app-check-token-is-invalid":
      return "The safety check could not confirm this browser. Reload the page and try again.";
    default:
      return "Sign-in did not finish. Try again in a moment.";
  }
}

export function errorCode(error: unknown): string {
  return error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "string"
    ? (error as { code: string }).code
    : "";
}

/** Popup failures where a full-page redirect is the documented fallback. */
export function shouldFallBackToRedirect(code: string): boolean {
  return code === "auth/popup-blocked" || code === "auth/operation-not-supported-in-this-environment" || code === "auth/web-storage-unsupported";
}

export const EMAIL_FOR_LINK_KEY = "atlas-explain-email-for-link";

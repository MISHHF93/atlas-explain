import {
  EmailAuthProvider,
  GoogleAuthProvider,
  getRedirectResult,
  isSignInWithEmailLink,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onIdTokenChanged,
  reauthenticateWithPopup,
  deleteUser,
  sendSignInLinkToEmail,
  signInAnonymously,
  signInWithCredential,
  signInWithEmailLink,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type Auth,
} from "firebase/auth";
import {
  EMAIL_FOR_LINK_KEY,
  accountView,
  authErrorCopy,
  errorCode,
  shouldFallBackToRedirect,
  validEmail,
  type AccountView,
  type SignInOutcome,
} from "../../core/account";
import { report } from "../../core/monitor";

export class AuthFlowError extends Error {
  constructor(readonly code: string) {
    super(authErrorCopy(code));
    this.name = "AuthFlowError";
    report("auth_error", "web", code || "unknown");
  }
}

/**
 * No forced account picker (owner decision, 22 Nov 2026): with one Google account in the browser, Google
 * signs straight in; with several, Google shows its own picker.
 */
function googleProvider(): GoogleAuthProvider {
  return new GoogleAuthProvider();
}

/**
 * Google sign-in. A signed-out visitor is anonymous, so the Google account is linked
 * to that uid and saved explanations stay with it. If the Google account already
 * exists, we switch to it instead. Popup first; full-page redirect when popups are blocked.
 */
export async function signInWithGoogle(auth: Auth): Promise<"signed-in" | "redirecting"> {
  const user = auth.currentUser;
  try {
    if (user && user.isAnonymous) await linkWithPopup(user, googleProvider());
    else await signInWithPopup(auth, googleProvider());
    return "signed-in";
  } catch (error) {
    const code = errorCode(error);
    if (code === "auth/credential-already-in-use" || code === "auth/email-already-in-use") {
      const credential = GoogleAuthProvider.credentialFromError(error as never);
      if (credential) {
        await signInWithCredential(auth, credential);
        return "signed-in";
      }
    }
    if (shouldFallBackToRedirect(code)) {
      if (user && user.isAnonymous) await linkWithRedirect(user, googleProvider());
      else await signInWithRedirect(auth, googleProvider());
      return "redirecting";
    }
    throw new AuthFlowError(code);
  }
}

/** Passwordless email link. The address is kept on this device only to finish the link. */
export async function sendEmailLink(auth: Auth, email: string, returnUrl: string): Promise<void> {
  if (!validEmail(email)) throw new AuthFlowError("auth/invalid-email");
  try {
    await sendSignInLinkToEmail(auth, email.trim(), { url: returnUrl, handleCodeInApp: true });
    localStorage.setItem(EMAIL_FOR_LINK_KEY, email.trim());
  } catch (error) {
    throw new AuthFlowError(errorCode(error));
  }
}

/**
 * Finish whatever sign-in came back to this page: a Google redirect or an email link.
 * An email link opened on a different device has no remembered address, so the result
 * is "need-email"; call again with the address the visitor types.
 */
export async function completePendingSignIn(auth: Auth, href: string, typedEmail?: string): Promise<SignInOutcome> {
  try {
    const redirected = await getRedirectResult(auth);
    if (redirected) return { state: "signed-in", method: "google", message: "You are signed in." };
  } catch (error) {
    const code = errorCode(error);
    if (code === "auth/credential-already-in-use") {
      const credential = GoogleAuthProvider.credentialFromError(error as never);
      if (credential) {
        await signInWithCredential(auth, credential);
        return { state: "signed-in", method: "google", message: "You are signed in." };
      }
    }
    return { state: "error", message: authErrorCopy(code) };
  }
  if (!isSignInWithEmailLink(auth, href)) return { state: "none" };
  const email = (typedEmail ?? localStorage.getItem(EMAIL_FOR_LINK_KEY) ?? "").trim();
  if (!email) return { state: "need-email" };
  if (!validEmail(email)) return { state: "error", message: authErrorCopy("auth/invalid-email") };
  try {
    const user = auth.currentUser;
    if (user && user.isAnonymous) {
      try {
        await linkWithCredential(user, EmailAuthProvider.credentialWithLink(email, href));
      } catch (error) {
        if (errorCode(error) !== "auth/email-already-in-use" && errorCode(error) !== "auth/credential-already-in-use") throw error;
        await signInWithEmailLink(auth, email, href);
      }
    } else {
      await signInWithEmailLink(auth, email, href);
    }
    localStorage.removeItem(EMAIL_FOR_LINK_KEY);
    return { state: "signed-in", method: "email_link", message: "You are signed in with your email." };
  } catch (error) {
    return { state: "error", message: authErrorCopy(errorCode(error)) };
  }
}

/**
 * Deletes the signed-in user from Firebase Authentication. Firebase asks for a recent sign-in
 * first: Google accounts confirm in a popup; email-link accounts are asked to sign in again.
 */
export async function deleteSignedInUser(auth: Auth): Promise<"deleted" | "reauth-needed"> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return "deleted";
  try {
    await deleteUser(user);
    return "deleted";
  } catch (error) {
    if (errorCode(error) !== "auth/requires-recent-login") throw new AuthFlowError(errorCode(error));
    if (!user.providerData.some((p) => p.providerId === "google.com")) return "reauth-needed";
    try {
      await reauthenticateWithPopup(user, googleProvider());
      await deleteUser(user);
      return "deleted";
    } catch (again) {
      throw new AuthFlowError(errorCode(again));
    }
  }
}

/** Sign out, then continue signed out with a fresh anonymous id so the app keeps working. */
export async function signOutToAnonymous(auth: Auth): Promise<void> {
  await signOut(auth);
  await signInAnonymously(auth).catch(() => undefined);
}

/**
 * Calls back on every sign-in change. onIdTokenChanged, not onAuthStateChanged: a first Google sign-in links
 * Google to the visitor's anonymous id, which keeps the same uid, and onAuthStateChanged doesn't report that.
 */
export function watchAccount(auth: Auth, onChange: (view: AccountView | null) => void): () => void {
  return onIdTokenChanged(auth, (user) => onChange(accountView(user)));
}

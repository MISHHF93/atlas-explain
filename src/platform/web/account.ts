import {
  EmailAuthProvider,
  GoogleAuthProvider,
  getRedirectResult,
  isSignInWithEmailLink,
  linkWithCredential,
  linkWithPopup,
  linkWithRedirect,
  onAuthStateChanged,
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
} from "../../core/account";
import { report } from "../../core/monitor";

export class AuthFlowError extends Error {
  constructor(readonly code: string) {
    super(authErrorCopy(code));
    this.name = "AuthFlowError";
    report("auth_error", "web", code || "unknown");
  }
}

function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
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
 * Returns a message to show, or null when there was nothing to finish.
 */
export async function completePendingSignIn(auth: Auth, href: string, askEmail: () => string | null): Promise<string | null> {
  try {
    const redirected = await getRedirectResult(auth);
    if (redirected) return "You are signed in.";
  } catch (error) {
    const code = errorCode(error);
    if (code === "auth/credential-already-in-use") {
      const credential = GoogleAuthProvider.credentialFromError(error as never);
      if (credential) {
        await signInWithCredential(auth, credential);
        return "You are signed in.";
      }
    }
    return authErrorCopy(code);
  }
  if (!isSignInWithEmailLink(auth, href)) return null;
  const email = localStorage.getItem(EMAIL_FOR_LINK_KEY) ?? askEmail();
  if (!email || !validEmail(email)) return "Open the sign-in link on the device where you asked for it, or enter the same email.";
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
    return "You are signed in with your email.";
  } catch (error) {
    return authErrorCopy(errorCode(error));
  }
}

/** Sign out, then continue signed out with a fresh anonymous id so the app keeps working. */
export async function signOutToAnonymous(auth: Auth): Promise<void> {
  await signOut(auth);
  await signInAnonymously(auth).catch(() => undefined);
}

export function watchAccount(auth: Auth, onChange: (view: AccountView | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => onChange(accountView(user)));
}

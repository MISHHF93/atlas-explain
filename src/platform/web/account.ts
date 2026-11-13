import { GoogleAuthProvider, linkWithPopup, type Auth } from "firebase/auth";

/**
 * Links the anonymous user to Google without changing the uid, so usage and
 * saved explanations stay on the same account. Sign-in is optional while the app is free.
 */
export async function linkAnonymousWithGoogle(auth: Auth): Promise<"linked" | "already"> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("Anonymous sign-in has not finished yet. Try again in a moment.");
  }
  if (user.providerData.some((provider) => provider.providerId === "google.com")) {
    return "already";
  }
  await linkWithPopup(user, new GoogleAuthProvider());
  return "linked";
}

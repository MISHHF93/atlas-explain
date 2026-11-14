import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_FOR_LINK_KEY } from "../src/core/account";

const fb = vi.hoisted(() => ({
  getRedirectResult: vi.fn(),
  isSignInWithEmailLink: vi.fn(),
  signInWithEmailLink: vi.fn(),
  linkWithCredential: vi.fn(),
  credentialWithLink: vi.fn(),
}));

vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credentialWithLink: fb.credentialWithLink },
  GoogleAuthProvider: class {
    static credentialFromError(): null { return null; }
    setCustomParameters(): void {}
  },
  getRedirectResult: fb.getRedirectResult,
  isSignInWithEmailLink: fb.isSignInWithEmailLink,
  signInWithEmailLink: fb.signInWithEmailLink,
  linkWithCredential: fb.linkWithCredential,
  linkWithPopup: vi.fn(),
  linkWithRedirect: vi.fn(),
  onAuthStateChanged: vi.fn(),
  reauthenticateWithPopup: vi.fn(),
  deleteUser: vi.fn(),
  sendSignInLinkToEmail: vi.fn(),
  signInAnonymously: vi.fn(),
  signInWithCredential: vi.fn(),
  signInWithPopup: vi.fn(),
  signInWithRedirect: vi.fn(),
  signOut: vi.fn(),
}));

import { completePendingSignIn } from "../src/platform/web/account";

const LINK = "https://atlas-explain.web.app/signin?signin=email&oobCode=abc";
const auth = (currentUser: unknown = null) => ({ currentUser }) as never;

describe("finishing an email sign-in link", () => {
  let stored: Map<string, string>;

  beforeEach(() => {
    stored = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => void stored.set(key, value),
      removeItem: (key: string) => void stored.delete(key),
    });
    for (const mock of Object.values(fb)) mock.mockReset();
    fb.getRedirectResult.mockResolvedValue(null);
    fb.isSignInWithEmailLink.mockReturnValue(true);
    fb.signInWithEmailLink.mockResolvedValue({});
  });

  afterEach(() => vi.unstubAllGlobals());

  it("does nothing when the page was not opened from a sign-in link", async () => {
    fb.isSignInWithEmailLink.mockReturnValue(false);
    expect(await completePendingSignIn(auth(), "https://atlas-explain.web.app/app", undefined)).toEqual({ state: "none" });
  });

  it("uses the address remembered on the device that asked for the link", async () => {
    stored.set(EMAIL_FOR_LINK_KEY, "ada@example.com");
    const outcome = await completePendingSignIn(auth(), LINK);
    expect(outcome).toMatchObject({ state: "signed-in", method: "email_link" });
    expect(fb.signInWithEmailLink).toHaveBeenCalledWith(expect.anything(), "ada@example.com", LINK);
    expect(stored.has(EMAIL_FOR_LINK_KEY)).toBe(false);
  });

  it("asks for the address on a different device instead of guessing", async () => {
    expect(await completePendingSignIn(auth(), LINK)).toEqual({ state: "need-email" });
    expect(fb.signInWithEmailLink).not.toHaveBeenCalled();
  });

  it("signs in with the typed address", async () => {
    const outcome = await completePendingSignIn(auth(), LINK, "  ada@example.com ");
    expect(outcome).toMatchObject({ state: "signed-in", method: "email_link" });
    expect(fb.signInWithEmailLink).toHaveBeenCalledWith(expect.anything(), "ada@example.com", LINK);
  });

  it("links the typed address to the anonymous id so saved explanations stay", async () => {
    const user = { isAnonymous: true };
    fb.credentialWithLink.mockReturnValue("cred");
    fb.linkWithCredential.mockResolvedValue({});
    expect(await completePendingSignIn(auth(user), LINK, "ada@example.com")).toMatchObject({ state: "signed-in" });
    expect(fb.linkWithCredential).toHaveBeenCalledWith(user, "cred");
    expect(fb.signInWithEmailLink).not.toHaveBeenCalled();
  });

  it("explains a wrong address or a used link in plain language, without signing in", async () => {
    expect(await completePendingSignIn(auth(), LINK, "nope")).toMatchObject({ state: "error", message: expect.stringMatching(/does not look right/) });
    expect(fb.signInWithEmailLink).not.toHaveBeenCalled();

    fb.signInWithEmailLink.mockRejectedValue({ code: "auth/invalid-action-code" });
    expect(await completePendingSignIn(auth(), LINK, "ada@example.com")).toMatchObject({ state: "error", message: expect.stringMatching(/expired or was already used/) });
  });

  it("reports a finished Google redirect as a Google sign-in", async () => {
    fb.getRedirectResult.mockResolvedValue({ user: {} });
    expect(await completePendingSignIn(auth(), LINK)).toMatchObject({ state: "signed-in", method: "google" });
  });
});

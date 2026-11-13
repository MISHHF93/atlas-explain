import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accountView, authErrorCopy, initialsFor, shouldFallBackToRedirect, validEmail } from "../src/core/account";

const user = (over: Record<string, unknown> = {}) => ({
  uid: "u1", isAnonymous: false, displayName: "Ada Lovelace", email: "ada@example.com", providerData: [{ providerId: "google.com" }], ...over,
});

describe("account state", () => {
  it("treats anonymous users as signed out, but keeps their uid for history", () => {
    expect(accountView(user({ isAnonymous: true, displayName: null, email: null, providerData: [] }))).toMatchObject({ uid: "u1", signedIn: false, provider: "anonymous" });
    expect(accountView(null)).toBeNull();
  });

  it("labels Google and email accounts", () => {
    expect(accountView(user())).toMatchObject({ signedIn: true, label: "Ada Lovelace", initials: "AL", provider: "google" });
    expect(accountView(user({ displayName: null, providerData: [{ providerId: "password" }] }))).toMatchObject({ label: "ada@example.com", initials: "AD", provider: "email" });
    expect(initialsFor("grace.hopper@example.com")).toBe("GH");
  });

  it("validates emails and maps auth errors to plain language", () => {
    expect(validEmail("a@b.co")).toBe(true);
    expect(validEmail("nope")).toBe(false);
    expect(authErrorCopy("auth/operation-not-allowed")).toMatch(/not switched on/);
    expect(authErrorCopy("auth/popup-closed-by-user")).toMatch(/cancelled/);
    expect(authErrorCopy("weird")).toMatch(/did not finish/);
    expect(shouldFallBackToRedirect("auth/popup-blocked")).toBe(true);
    expect(shouldFallBackToRedirect("auth/popup-closed-by-user")).toBe(false);
  });
});

describe("auth wiring", () => {
  const backend = readFileSync("src/platform/web/backend.ts", "utf8");
  const flows = readFileSync("src/platform/web/account.ts", "utf8");
  const rules = readFileSync("firestore.rules", "utf8");

  it("never replaces a signed-in account with a new anonymous one", () => {
    expect(backend).toContain("await auth.authStateReady();");
    expect(backend).toMatch(/if \(auth\.currentUser\) return auth\.currentUser\.uid;/);
  });

  it("uses popup first, redirect as fallback, and links the anonymous uid", () => {
    expect(flows).toContain("linkWithPopup(user, googleProvider())");
    expect(flows).toContain("signInWithRedirect");
    expect(flows).toContain("sendSignInLinkToEmail");
    expect(flows).toContain("signInAnonymously(auth)");
  });

  it("restricts per-user prefs to the owner and to a fixed shape", () => {
    expect(rules).toMatch(/match \/users\/\{userId\}\/prefs\/\{prefId\}/);
    expect(rules).toContain('request.resource.data.keys().hasOnly(["theme", "updatedAt"])');
    expect(rules).toMatch(/match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
  });
});

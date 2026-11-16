import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { needsSignInStep, parseRoute } from "../src/app/routes";
import { GUEST_CHOICE_KEY, readGuestChoice, saveGuestChoice } from "../src/core/account-hint";

const fresh = { signedIn: false, guest: false };
const loc = (search = "", hash = "") => ({ search, hash });

describe("every way into the app passes the Sign in page once", () => {
  it("shows Sign in first to a new visitor, whichever app address they open", () => {
    for (const path of ["/app", "/app/learn", "/app/assets", "/app/assets/BTC"]) {
      expect(needsSignInStep(parseRoute(path), loc(), fresh), path).toBe(true);
    }
  });

  it("lets signed-in visitors, and those who chose to continue without an account, straight in", () => {
    expect(needsSignInStep(parseRoute("/app"), loc(), { signedIn: true, guest: false })).toBe(false);
    expect(needsSignInStep(parseRoute("/app"), loc(), { signedIn: false, guest: true })).toBe(false);
  });

  it("never loops on the Sign in page or a missing page", () => {
    expect(needsSignInStep(parseRoute("/signin"), loc(), fresh)).toBe(false);
    expect(needsSignInStep(parseRoute("/app/nope"), loc(), fresh)).toBe(false);
  });

  it("lets links with their own job through: desk cards, email sign-in links and previews", () => {
    expect(needsSignInStep(parseRoute("/app"), loc("", "#c=abc"), fresh)).toBe(false);
    expect(needsSignInStep(parseRoute("/app"), loc("?oobCode=x&mode=signIn"), fresh)).toBe(false);
    expect(needsSignInStep(parseRoute("/app"), loc("?tab=explain"), fresh)).toBe(false);
  });

  it("remembers \"Continue without an account\" on this browser, and survives blocked storage", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    expect(readGuestChoice(storage)).toBe(false);
    saveGuestChoice(storage);
    expect(store.get(GUEST_CHOICE_KEY)).toBe("1");
    expect(readGuestChoice(storage)).toBe(true);
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(() => saveGuestChoice(blocked)).not.toThrow();
    expect(readGuestChoice(blocked)).toBe(false);
  });

  it("is wired into the app: the gate runs at start-up and the choice is saved on Continue", () => {
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app).toContain("needsSignInStep(route, location, { signedIn: readAccountHint() != null, guest: readGuestChoice() })");
    expect(app).toMatch(/onContinue: \(\) => \{\s*\/\/[^\n]*\n\s*saveGuestChoice\(\);\s*afterSignIn\(\);/);
  });

  it("draws Google's button with the four-colour G, and says both choices work", () => {
    const account = readFileSync("src/wallet/account.ts", "utf8");
    for (const colour of ["#EA4335", "#4285F4", "#FBBC05", "#34A853"]) expect(account).toContain(colour);
    expect(readFileSync("src/wallet/signin-page.ts", "utf8")).toContain("or continue without an account");
  });
});

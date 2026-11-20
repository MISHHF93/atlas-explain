import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { needsSignInStep, parseRoute } from "../src/app/routes";

const out = { signedIn: false };
const loc = (search = "", hash = "") => ({ search, hash });

describe("signing in is required for the web app", () => {
  it("shows Sign in first to anyone not signed in, whichever app address they open", () => {
    for (const path of ["/app", "/app/learn", "/app/assets", "/app/assets/BTC", "/app/account", "/start"]) {
      expect(needsSignInStep(parseRoute(path), loc(), out), path).toBe(true);
    }
  });

  it("lets signed-in visitors straight in", () => {
    expect(needsSignInStep(parseRoute("/app"), loc(), { signedIn: true })).toBe(false);
  });

  it("never loops on the Sign in page or a missing page", () => {
    expect(needsSignInStep(parseRoute("/signin"), loc(), out)).toBe(false);
    expect(needsSignInStep(parseRoute("/app/nope"), loc(), out)).toBe(false);
  });

  it("has no way round it: desk links and old preview flags sign in too; only an email sign-in link passes", () => {
    expect(needsSignInStep(parseRoute("/app"), loc("", "#c=abc"), out)).toBe(true);
    expect(needsSignInStep(parseRoute("/app"), loc("?tab=explain"), out)).toBe(true);
    // The email link is the sign-in itself, so it must reach the app.
    expect(needsSignInStep(parseRoute("/app"), loc("?oobCode=x&mode=signIn"), out)).toBe(false);
    // Preview flags pass only in development.
    expect(needsSignInStep(parseRoute("/app"), loc("?tab=explain"), { signedIn: false, dev: true })).toBe(false);
  });

  it("checks the real sign-in too, not only the browser's hint, and keeps a desk card through sign-in", () => {
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app).toContain("needsSignInStep(route, location, { signedIn: readAccountHint() != null, dev: import.meta.env.DEV })");
    expect(app).toContain("if (!view?.signedIn && !import.meta.env.DEV) requireSignIn();");
    expect(app).toContain("keepPendingHash();");
    expect(app).toContain("const pending = takePendingHash();");
  });

  it("no longer offers \"Continue without an account\" anywhere", () => {
    for (const f of ["src/wallet/signin-page.ts", "src/web/app.ts", "src/core/account-hint.ts", "index.html", "support.html", "privacy.html", "terms.html"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/Continue without an account|continue-without-account|saveGuestChoice/);
    }
  });

  it("uses one page frame for Sign in, one set of sign-in handlers, and no Get started page in between", () => {
    expect(existsSync("src/wallet/full-page.ts")).toBe(true);
    expect(readFileSync("src/wallet/signin-page.ts", "utf8")).toContain('from "./full-page"');
    expect(existsSync("src/wallet/start-page.ts")).toBe(false);
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app.match(/signInWithGoogle\(\)/g)).toHaveLength(1);
    expect(app).toContain("accountPanel(null, accountHandlers(backend), { compact: true })");
    expect(app).toContain("accountPanel(account, accountHandlers(backend))");
  });

  it("draws Google's button with the four-colour G", () => {
    const account = readFileSync("src/wallet/account.ts", "utf8");
    for (const colour of ["#EA4335", "#4285F4", "#FBBC05", "#34A853"]) expect(account).toContain(colour);
  });
});

describe("the account is easy to find", () => {
  it("/app/profile and /app/account both open the account, and the menu offers it and Sign out once signed in", () => {
    expect(parseRoute("/app/profile")).toEqual({ kind: "tab", tab: "settings" });
    expect(parseRoute("/app/account")).toEqual({ kind: "tab", tab: "settings" });
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app).toContain('{ id: "account", hidden: true, label: "Your account"');
    expect(app).toContain('{ id: "signout", hidden: true, label: "Sign out"');
    expect(app).toContain('shell.setMenuItemHidden("signout", !view?.signedIn);');
    expect(app).toContain('shell.openSheet("Your account"');
    // Signed in, the header button reads "Account" next to the initials.
    expect(readFileSync("src/wallet/shell.ts", "utf8")).toContain('el("span", "acct-label", "Account")');
  });
});

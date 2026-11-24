import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCOUNT_HINT_KEY, readAccountHint, saveAccountHint } from "../src/core/account-hint";
import { sitePage, SITE_PAGES } from "./site-page";

const memory = () => {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k), data };
};

describe("signed-in hint for the website", () => {
  it("keeps only initials and the display label, and clears on sign-out", () => {
    const s = memory();
    saveAccountHint({ signedIn: true, initials: "MA", label: "Mishel A.", email: "private@example.com", uid: "secret-uid" } as never, s);
    const stored = s.data.get(ACCOUNT_HINT_KEY)!;
    expect(stored).not.toMatch(/private@example\.com|secret-uid/);
    expect(readAccountHint(s)).toEqual({ initials: "MA", label: "Mishel A." });
    saveAccountHint({ signedIn: false, initials: "", label: "" }, s);
    expect(readAccountHint(s)).toBeNull();
    saveAccountHint(null, s);
    expect(readAccountHint(s)).toBeNull();
  });

  it("never throws when storage is blocked or the hint is malformed", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(() => saveAccountHint({ signedIn: true, initials: "A", label: "A" }, blocked)).not.toThrow();
    expect(readAccountHint(blocked)).toBeNull();
    const bad = memory();
    bad.setItem(ACCOUNT_HINT_KEY, "{not json");
    expect(readAccountHint(bad)).toBeNull();
  });
});

describe("sign in and account entry points", () => {
  it("gives every site page one way in, and shows your initials only when signed in", () => {
    for (const f of SITE_PAGES) {
      const head = /<header class="site-head">[\s\S]*?<\/header>/.exec(sitePage(f))?.[0] ?? "";
      expect(head, f).toContain('<a class="site-signin" href="/app/account" data-account-link hidden></a>');
      expect(head, f).toContain('<a class="btn btn-primary btn-sm" href="/#setup">Add to your AI assistant</a>');
      // No separate "Sign in" or "The app": they led to the same place.
      expect(head, f).not.toMatch(/>Sign in<|>The app</);
    }
    const site = readFileSync("src/site/site.ts", "utf8");
    expect(site).toContain('cta.textContent = "Open ATLAS Explain"');
    expect(site).toContain("accountLink.hidden = false;");
  });

  it("gives the web app a labelled Sign in button and a signed-in account menu with Sign out", () => {
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app).toMatch(/accountMenu: \[[\s\S]*"Your account and settings"[\s\S]*"Your data"[\s\S]*"Sign out"/);
    expect(app).toContain("saveAccountHint(view)");
    const shell = readFileSync("src/wallet/shell.ts", "utf8");
    expect(shell).toContain('el("span", "acct-label", "Sign in")');
  });
});

describe("website first, then Sign in, then the app", () => {
  const app = readFileSync("src/web/app.ts", "utf8");

  it("opens /signin as its own page over the app, and sends signed-in visitors straight in", () => {
    expect(app).toContain("if (r.kind === \"signin\") showSignIn();");
    expect(app).toMatch(/function showSignIn\(\): void \{\s*\/\/[^\n]*\n\s*if \(account\?\.signedIn\) \{\s*afterSignIn\(\);/);
    expect(app).toContain("shell.frame.inert = true;");
    const page = readFileSync("src/wallet/signin-page.ts", "utf8");
    for (const part of ['"Sign in to ATLAS Explain"', '["/", "Back to the website"]', '["/privacy", "Privacy"]', "needs no account"]) expect(page).toContain(part);
    expect(page).not.toContain("Continue without an account");
  });

  it("leads into the app after signing in, including back from an email link, and back to Sign in after signing out", () => {
    // One way out of the Sign in page: the sign-in state (Google, an email link, or already signed in), once.
    expect(app).toMatch(/function afterSignIn\(\): void \{\s*if \(route\.kind !== "signin"\) return;\s*hideSignIn\(\);/);
    expect(app).toContain('if (view?.signedIn && route.kind === "signin" && signInPage.open) window.setTimeout(() => afterSignIn(), 0);');
    // Callers: the account watcher and Sign in when already signed in (plus the definition itself).
    expect(app.match(/afterSignIn\(\)/g)).toHaveLength(3);
    expect(app).not.toContain("window.setTimeout(() => afterSignIn(), 400)");
    expect(app).toMatch(/async function signOutNow\(\)[\s\S]*?navigate\(\{ kind: "signin" \}\);/);
    // The header's "Sign in" goes to the page; the account sheet stays for signed-in settings.
    expect(app).toContain('onAccount: () => navigate(account?.signedIn ? { kind: "tab", tab: "settings" } : { kind: "signin" })');
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { needsSignInStep, parseRoute } from "../src/app/routes";
import { sitePage } from "./site-page";
import { rewriteFor as match } from "../src/site/hosting-routes";

const hosting = JSON.parse(readFileSync("firebase.json", "utf8")).hosting as { rewrites: { source: string; destination: string }[] };
const app = readFileSync("src/web/app.ts", "utf8");
const rewriteFor = (path: string) => match(path, hosting.rewrites);

describe("one journey: website, Sign in, then straight into the app (no page in between)", () => {
  it("sends Get started straight to the app: the header, the hero and the footer", () => {
    const home = sitePage("index.html");
    expect(/<header class="site-head">[\s\S]*?<\/header>/.exec(home)?.[0]).toContain('<a class="btn btn-primary btn-sm" href="/app" data-start-cta>Get started</a>');
    expect(home).toContain('<a class="btn btn-primary btn-lg" href="/app" data-start-cta>Get started</a>');
    expect(home).not.toContain('href="/start"');
    // The connector's setup steps stay public, for the directory and for people who already know.
    expect(home).toContain('href="/connect"');
  });

  it("asks a signed-out visitor to sign in first, and remembers where they were heading", () => {
    expect(needsSignInStep({ kind: "tab", tab: "explain" }, { search: "", hash: "" }, { signedIn: false })).toBe(true);
    expect(app).toContain("history.replaceState(null, \"\", `/signin?next=${encodeURIComponent(heading)}`);");
  });

  it("opens the app after signing in when there was no destination: no chooser page", () => {
    expect(app).toMatch(/!isAccountRoute\(target\) \? target : \{ kind: "tab", tab: "explain" \}/);
    expect(app).not.toContain("createStartPage");
  });

  it("keeps the old /start address working: it opens the app", () => {
    expect(parseRoute("/start")).toEqual({ kind: "tab", tab: "explain" });
    expect(hosting.rewrites).toContainEqual({ source: "/start", destination: "/app.html" });
  });

  it("serves the same routes locally as on the live site", () => {
    expect(rewriteFor("/signin")).toBe("/app.html");
    expect(rewriteFor("/start")).toBe("/app.html");
    expect(rewriteFor("/app/learn")).toBe("/app.html");
    expect(rewriteFor("/connect")).toBe("/connect.html");
    expect(rewriteFor("/nothing-here")).toBeNull();
  });
});

describe("Google sign-in", () => {
  it("doesn't force Google's account picker: one account signs straight in (owner decision, 22 Nov 2026)", () => {
    const account = readFileSync("src/platform/web/account.ts", "utf8");
    expect(account).not.toContain("select_account");
    expect(account).toContain("return new GoogleAuthProvider();");
  });
});

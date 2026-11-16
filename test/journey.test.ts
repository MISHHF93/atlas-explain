import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { needsSignInStep, parseRoute, pathFor, titleFor } from "../src/app/routes";
import { sitePage } from "./site-page";
import { rewriteFor as match } from "../src/site/hosting-routes";

const hosting = JSON.parse(readFileSync("firebase.json", "utf8")).hosting as { rewrites: { source: string; destination: string }[] };
const app = readFileSync("src/web/app.ts", "utf8");
const rewriteFor = (path: string) => match(path, hosting.rewrites);

describe("one journey: website, Sign in, Get started, then the connector or the web app", () => {
  it("has a Get started page at /start, served by the app", () => {
    expect(parseRoute("/start")).toEqual({ kind: "start" });
    expect(pathFor({ kind: "start" })).toBe("/start");
    expect(titleFor({ kind: "start" })).toBe("Get started · ATLAS Explain");
    expect(hosting.rewrites).toContainEqual({ source: "/start", destination: "/app.html" });
  });

  it("puts Get started behind the Sign in page, and remembers where the visitor was heading", () => {
    expect(needsSignInStep({ kind: "start" }, { search: "", hash: "" }, { signedIn: false })).toBe(true);
    expect(app).toContain("history.replaceState(null, \"\", `/signin?next=${encodeURIComponent(heading)}`);");
  });

  it("goes to Get started after signing in when there was no destination", () => {
    expect(app).toMatch(/!isAccountRoute\(target\) \? target : \{ kind: "start" \}/);
  });

  it("offers both ways in on Get started: the connector address with its setup steps, and the web app", () => {
    const page = readFileSync("src/wallet/start-page.ts", "utf8");
    for (const part of ["How do you want to use ATLAS Explain?", "In your AI assistant", "In your browser", "Open the web app", 'steps.href = "/connect"', "Copy"]) expect(page, part).toContain(part);
    expect(app).toContain("connectorUrl: MCP_URL");
  });

  it("starts every website visitor there: Get started in the header, the hero and the footer", () => {
    const home = sitePage("index.html");
    expect(/<header class="site-head">[\s\S]*?<\/header>/.exec(home)?.[0]).toContain('<a class="btn btn-primary btn-sm" href="/start" data-start-cta>Get started</a>');
    expect(home).toContain('<a class="btn btn-primary btn-lg" href="/start" data-start-cta>Get started</a>');
    // The connector's setup steps stay public, for the directory and for people who already know.
    expect(home).toContain('href="/connect"');
  });

  it("serves the same routes locally as on the live site", () => {
    expect(rewriteFor("/signin")).toBe("/app.html");
    expect(rewriteFor("/start")).toBe("/app.html");
    expect(rewriteFor("/app/learn")).toBe("/app.html");
    expect(rewriteFor("/connect")).toBe("/connect.html");
    expect(rewriteFor("/nothing-here")).toBeNull();
  });
});

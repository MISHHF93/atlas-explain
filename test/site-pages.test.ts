import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INSTALL_URL } from "../src/core/popup-copy";

const PAGES = ["index.html", "support.html", "privacy.html", "terms.html", "welcome.html", "how-its-built.html", "404.html", "app.html"];
const home = readFileSync("index.html", "utf8");
const hosting = JSON.parse(readFileSync("firebase.json", "utf8")).hosting as {
  rewrites: { source: string }[];
  redirects: { source: string; destination: string; type: number }[];
};

describe("the public site is four pages", () => {
  it("has Home, Support, Privacy and Terms in the navigation, and no separate How it works page", () => {
    expect(existsSync("how-it-works.html")).toBe(false);
    const nav = /<nav class="site-nav"[^>]*>(.*?)<\/nav>/.exec(home)?.[1] ?? "";
    expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/#how-it-works", "/app", "/support"]);
    expect(readFileSync("public/sitemap.xml", "utf8")).not.toContain("how-it-works");
  });

  it("keeps how it works and the install steps on Home", () => {
    expect(home).toContain('id="how-it-works"');
    expect(home).toContain('id="install"');
    expect(home).toContain('href="/download/atlas-explain-chrome.zip"');
    expect(home).toContain("Load unpacked");
    expect(home).toContain("No predictions.");
  });

  it("sends the old address to Home, so /how-it-works#install still reaches the install steps", () => {
    // A redirect with no fragment of its own keeps the visitor's #install.
    expect(hosting.redirects).toContainEqual({ source: "/how-it-works", destination: "/", type: 301 });
    expect(hosting.rewrites.map((r) => r.source)).not.toContain("/how-it-works");
    expect(INSTALL_URL).toMatch(/\/#install$|^https:\/\/chromewebstore\.google\.com\//);
  });

  it("has no link to the removed page anywhere", () => {
    for (const page of PAGES) expect(readFileSync(page, "utf8"), page).not.toContain('"/how-it-works');
  });
});

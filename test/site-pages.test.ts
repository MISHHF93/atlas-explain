import { existsSync, readFileSync } from "node:fs";
import { SITE_PAGES, sitePage } from "./site-page";
import { describe, expect, it } from "vitest";
import { CHROME_STORE_URL } from "../src/core/links";

const PAGES = ["index.html", "connect.html", "support.html", "privacy.html", "terms.html", "welcome.html", "how-its-built.html", "404.html", "app.html"];
const home = sitePage("index.html");
const hosting = JSON.parse(readFileSync("firebase.json", "utf8")).hosting as {
  rewrites: { source: string }[];
  redirects: { source: string; destination: string; type: number }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

describe("the public site is four pages", () => {
  it("has Home, Support, Privacy and Terms in the navigation, and no separate How it works page", () => {
    expect(existsSync("how-it-works.html")).toBe(false);
    const nav = /<nav class="site-nav"[^>]*>(.*?)<\/nav>/.exec(home)?.[1] ?? "";
    expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/#how-it-works", "/app", "/connect", "/support"]);
    expect(readFileSync("public/sitemap.xml", "utf8")).not.toContain("how-it-works");
  });

  it("keeps how it works and the install steps on Home", () => {
    expect(home).toContain('id="how-it-works"');
    expect(home).toContain('id="install"');
    // Installed online only: no zip, no Developer mode, no build steps for visitors.
    expect(home).not.toMatch(/\.zip|Load unpacked|Developer mode|npm /);
    expect(home).toContain("not in the Chrome Web Store yet");
    expect(home).toMatch(/<div data-when-store hidden>[\s\S]*data-store-link/);
    expect(readFileSync("how-its-built.html", "utf8")).not.toMatch(/npm |unpacked/);
    expect(hosting.redirects).toContainEqual({ source: "/download/**", destination: "/#install", type: 301 });
    expect(home).toContain("No predictions.");
  });

  it("sends the old address to Home, so /how-it-works#install still reaches the install steps", () => {
    // A redirect with no fragment of its own keeps the visitor's #install.
    expect(hosting.redirects).toContainEqual({ source: "/how-it-works", destination: "/", type: 301 });
    expect(hosting.rewrites.map((r) => r.source)).not.toContain("/how-it-works");
    expect(CHROME_STORE_URL === null || CHROME_STORE_URL.startsWith("https://chromewebstore.google.com/")).toBe(true);
  });

  it("has no link to the removed page anywhere", () => {
    for (const page of PAGES) expect(readFileSync(page, "utf8"), page).not.toContain('"/how-it-works');
  });
});

describe("one header and one footer for every site page", () => {
  it("keeps each page to markers, so no page carries its own copy", () => {
    for (const f of SITE_PAGES) {
      const raw = readFileSync(f, "utf8");
      expect(raw, f).toMatch(/<!-- site:header [\w-]+ -->/);
      expect(raw, f).toContain("<!-- site:footer -->");
      expect(raw, f).not.toMatch(/<header class="site-head"|<footer class="site-foot"/);
    }
  });

  it("links every destination once in the footer, with nothing that leads nowhere", () => {
    const footer = /<nav aria-label="Footer">(.*?)<\/nav>/.exec(sitePage("index.html"))?.[1] ?? "";
    const hrefs = [...footer.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(expect.arrayContaining(["/app", "/welcome#step-try", "/connect", "/support", "/privacy", "/terms"]));
    expect(hrefs).not.toContain("/support#faq");
  });

  it("only says Add to Chrome when there is a store listing to add from", () => {
    for (const f of SITE_PAGES) {
      const page = sitePage(f);
      if (CHROME_STORE_URL) expect(page, f).toContain(CHROME_STORE_URL);
      else expect(page.replace(/<!--[\s\S]*?-->/g, ""), f).not.toMatch(/>Add to Chrome</);
    }
  });

  it("does not repeat the Support FAQ on Home", () => {
    expect(home).not.toContain('class="faq"');
    expect(home).toContain('href="/connect"');
  });
});

describe("the website and the app read as separate places", () => {
  it("leads into the app with one wording, and marks app pages as the app", () => {
    for (const f of SITE_PAGES) {
      const page = sitePage(f);
      expect(page, f).not.toMatch(/>Open the web app</);
      expect(page, f).toMatch(/<nav class="site-nav"[^>]*>[\s\S]*<a href="\/app">The app<\/a>/);
    }
    expect(readFileSync("src/wallet/shell.ts", "utf8")).toContain('el("span", "app-badge", "App")');
    expect(readFileSync("src/web/app.ts", "utf8")).toMatch(/menu: \[\r?\n\s*\{ label: "ATLAS Explain website", icon: "back"/);
  });

  it("re-checks every HTML page on each visit, /connect included", () => {
    const rule = hosting.headers.find((h) => h.source.includes("support"));
    expect(rule?.source).toContain("connect");
  });
});

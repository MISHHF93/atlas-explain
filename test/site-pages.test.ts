import { existsSync, readFileSync } from "node:fs";
import { SITE_PAGES, sitePage } from "./site-page";
import { describe, expect, it } from "vitest";

const PAGES = [...SITE_PAGES, "app.html"];
const home = sitePage("index.html");
const partners = sitePage("partners.html");
const hosting = JSON.parse(readFileSync("firebase.json", "utf8")).hosting as {
  rewrites: { source: string }[];
  redirects: { source: string; destination: string; type: number }[];
  headers: { source: string; headers: { key: string; value: string }[] }[];
};

describe("the public site is four pages (owner decision, 23 Nov 2026)", () => {
  it("is Home, Partners, Privacy and Terms: the old Connect, Support and How it's built pages are gone", () => {
    for (const gone of ["connect.html", "support.html", "how-its-built.html", "how-it-works.html", "welcome.html"]) expect(existsSync(gone), gone).toBe(false);
    const nav = /<nav class="site-nav"[^>]*>(.*?)<\/nav>/.exec(home)?.[1] ?? "";
    expect([...nav.matchAll(/href="([^"]+)"/g)].map((m) => m[1])).toEqual(["/#setup", "/#questions", "/partners"]);
    const sitemap = readFileSync("public/sitemap.xml", "utf8");
    for (const gone of ["/connect", "/support", "/how-its-built", "how-it-works"]) expect(sitemap, gone).not.toContain(gone);
  });

  it("holds the whole connector story on Home: how it works, setup, what to ask, trust, the web app, questions", () => {
    const order = ["how-it-works", "setup", "what-to-ask", "trust", "browser", "questions"].map((id) => home.indexOf(`id="${id}"`));
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    // Setup: the copyable address and every assistant's steps.
    expect(home).toContain('data-copy="mcp-url"');
    for (const a of ["Claude (web and desktop)", "Claude Code", "ChatGPT", "Cursor", "VS Code", "Any other MCP client"]) expect(home, a).toContain(`<summary>${a}</summary>`);
    // Questions: the old Support FAQ and troubleshooting, once.
    expect(home.match(/<summary>Is it free\?<\/summary>/g)).toHaveLength(1);
    expect(home).toContain('id="troubleshooting"');
    // The full tool list is one click away, not a wall of cards.
    expect(home).toMatch(/<details class="qa all-tools">\s*<summary>All \d+ tools, and the ready-made prompts<\/summary>/);
    expect(home).toContain("No predictions.");
  });

  it("holds How it's built on Partners, for developers and partners", () => {
    expect(partners).toContain('<h2 id="how-its-built">How it\'s built</h2>');
    for (const id of ["built-connector", "built-hybrid", "built-protection", "built-data", "built-stack", "built-source"]) expect(partners, id).toContain(`id="${id}"`);
    expect(partners).toContain("ATLAS Explain for businesses and developers");
  });

  it("sends every old address to its new section, so links in directories and search keep working", () => {
    for (const r of [
      { source: "/connect", destination: "/#setup", type: 301 },
      { source: "/support", destination: "/#questions", type: 301 },
      { source: "/how-its-built", destination: "/partners#how-its-built", type: 301 },
      { source: "/download/**", destination: "/#setup", type: 301 },
      { source: "/welcome", destination: "/#setup", type: 301 },
      { source: "/how-it-works", destination: "/", type: 301 },
    ]) expect(hosting.redirects).toContainEqual(r);
    for (const gone of ["/connect", "/support", "/how-its-built", "/how-it-works"]) expect(hosting.rewrites.map((r) => r.source)).not.toContain(gone);
  });

  it("links nowhere that's gone, and offers no Chrome extension anywhere", () => {
    for (const page of PAGES) {
      const html = readFileSync(page, "utf8");
      expect(html, page).not.toMatch(/href="\/(connect|support|how-its-built|how-it-works)["#]/);
      expect(html, page).not.toMatch(/Chrome extension|Chrome Web Store|data-store-link|Add to Chrome/);
    }
    expect(home).not.toMatch(/\.zip|Load unpacked|Developer mode|npm /);
    expect(existsSync("extension")).toBe(false);
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
    const footer = /<nav aria-label="Footer">(.*?)<\/nav>/.exec(home)?.[1] ?? "";
    const hrefs = [...footer.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual(expect.arrayContaining(["/app", "/#setup", "/#questions", "/partners", "/privacy", "/terms"]));
    // One way into the product: Get started is the app (sign-in first when needed), listed once, then the setup steps.
    expect(hrefs.filter((h) => h === "/app")).toHaveLength(1);
    expect(hrefs.slice(0, 2)).toEqual(["/app", "/#setup"]);
  });
});

describe("the website and the app read as separate places", () => {
  it("leads into the product one way, Get started, and names the app plainly ATLAS Explain, with no extra badge", () => {
    for (const f of SITE_PAGES) {
      const page = sitePage(f);
      expect(page, f).not.toMatch(/>Open the web app<|>Open the app<|>The app</);
      expect(page, f).toContain('href="/app" data-start-cta>Get started</a>');
    }
    expect(readFileSync("src/wallet/shell.ts", "utf8")).not.toContain("app-badge");
    expect(readFileSync("src/app/routes.ts", "utf8")).not.toContain("ATLAS Explain app");
    expect(readFileSync("src/web/app.ts", "utf8")).toMatch(/menu: \[\r?\n\s*\{ label: "ATLAS Explain website", icon: "back"/);
  });

  it("re-checks every HTML page on each visit", () => {
    const rule = hosting.headers.find((h) => h.source.startsWith("/@("));
    expect(rule?.source).toContain("partners");
    expect(rule?.headers.find((x) => x.key === "Cache-Control")?.value).toMatch(/no-cache|max-age=0/);
  });
});

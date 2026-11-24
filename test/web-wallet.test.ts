import { existsSync, readFileSync } from "node:fs";
import { SITE_PAGES, sitePage } from "./site-page";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/web/app.ts", "utf8");
const legal = readFileSync("src/wallet/legal.ts", "utf8");
const main = readFileSync("src/main.ts", "utf8");
const style = readFileSync("src/app/app.css", "utf8") + readFileSync("src/site/site.css", "utf8");
const html = readFileSync("app.html", "utf8");

describe("web wallet", () => {
  it("uses the shared wallet shell instead of a full-page layout", () => {
    expect(app).toContain("createWalletShell");
    expect(main).toContain("mountWebWallet");
    for (const old of ["desk", "legal", "pricing", "setup", "dom"]) {
      expect(existsSync(`src/ui/${old}.ts`)).toBe(false);
    }
    expect(html).toContain('<div id="app"></div>');
    expect(main).toContain('import "./app/app.css"');
  });

  it("uses the same section ids as the extension's tabs", () => {
    for (const tab of ["explain", "glossary", "assets"]) {
      expect(app).toContain(`"${tab}"`);
    }
  });

  it("has no trade instructions in user-facing copy", () => {
    expect(legal).not.toMatch(/\b(buy|sell)\b/i);
    const strings = app.match(/"[^"]*"/g) ?? [];
    for (const s of strings) expect(s).not.toMatch(/\b(buy|sell)\b/i);
  });

  it("styles the stage with tokens only and no font under 11px", () => {
    expect(style).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    for (const m of style.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
      expect(Number(m[1])).toBeGreaterThanOrEqual(11);
    }
  });

  it("never reads account balances", () => {
    expect(app).not.toMatch(/balance|account_id|positions/i);
  });
});

describe("public site", () => {
  const page = sitePage("index.html");
  const css = readFileSync("src/site/site.css", "utf8");
  const pages = SITE_PAGES.map((f) => [f, sitePage(f)] as const);
  it("is a landing page led by the AI-assistant connector, with the browser option and its hybrid story in static HTML", () => {
    expect(page).toContain('class="hero"');
    const hero = /<section class="hero"[\s\S]*?<\/section>/.exec(page)?.[0] ?? "";
    // Connector first (24 Nov 2026): the main button goes to the setup steps; the web app is the second way in.
    expect(hero).toContain('<a class="btn btn-primary btn-lg" href="#setup">Add to your AI assistant</a>');
    expect(hero).toContain('<a class="btn" href="/app" data-start-cta>Try it in your browser</a>');
    expect(hero).toContain("Your money and the economy, <span>explained with sources.</span>");
    expect(hero).toContain('src="/shots/connector-inflation.png"');
    expect(/<header class="site-head">[\s\S]*?<\/header>/.exec(page)?.[0]).toContain('<a class="btn btn-primary btn-sm" href="/#setup">Add to your AI assistant</a>');
    expect(page).toContain('id="browser"');
    expect(page).toMatch(/Gemini Nano, on this device/);
    expect(page).toMatch(/Gemini in the cloud, if needed/);
  });
  it("keeps build and hackathon detail in How it's built (on Partners, for developers), out of the customer pages", () => {
    const built = readFileSync("partners.html", "utf8");
    for (const part of ["Firebase AI Logic", "App Check", "Remote Config", "#BuildHybridAI", "Gemini Nano"]) expect(built).toContain(part);
    for (const [file, text] of pages) {
      // Privacy and terms name their processors on purpose; their production text lands with the legal review.
      if (file === "partners.html" || file === "privacy.html" || file === "terms.html") continue;
      const visible = text.replace(/<[^>]+>/g, " ");
      expect(visible, file).not.toMatch(/Firebase AI Logic|App Check|Remote Config|#BuildHybridAI|coming soon|during the beta/i);
      expect(text, file).toContain('href="/partners#how-its-built"');
    }
    expect(page).toContain('href="/app"');
    expect(page).toContain("https://github.com/MISHHF93/atlas-explain");
    expect(page).toMatch(/Educational information, not investment advice/);
    expect(page).not.toContain('id="app"');
  });
  it("every page loads only the tiny site script, links home and carries the disclaimer", () => {
    for (const [, text] of pages) {
      expect(text).toContain('src="/src/site/site.ts"');
      expect(text).not.toContain("/src/main.ts");
      expect(text).toMatch(/Educational information, not investment advice/);
      expect(text).toContain('href="/privacy"');
    }
  });
  it("publishes production legal pages: dated, no draft markers or placeholders, with the key commitments", () => {
    for (const f of ["privacy.html", "terms.html"]) {
      const text = sitePage(f);
      expect(text, f).toMatch(/Last updated \d{1,2} [A-Z][a-z]+ 20\d\d/);
      expect(text, f).not.toMatch(/draft|\[TODO|TODO\]|not final/i);
    }
    const privacy = readFileSync("privacy.html", "utf8");
    for (const part of ['id="analytics"', "off unless you allow them", "Download your data", "delete your account", "never collect", "outside Canada"]) expect(privacy).toContain(part);
    const terms = readFileSync("terms.html", "utf8");
    for (const part of ["not investment, financial, tax or legal advice", "refundable on request within 14 days", "Apache License 2.0"]) expect(terms).toContain(part);
  });
  it("has no trade instructions in site copy", () => {
    for (const [, text] of pages) expect(text.replace(/<[^>]+>/g, " ")).not.toMatch(/\b(buy|sell)\b/i);
  });
  it("uses tokens only, no font under 11px, and respects reduced motion", () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    for (const m of css.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(11);
    expect(css).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.hero-dot \{ animation: none; \}/);
  });
  it("adds the hybrid step to onboarding", () => {
    expect(readFileSync("src/wallet/cards.ts", "utf8")).toContain('title: "On your device first"');
  });
});

describe("hosting routes", () => {
  const hosting = JSON.parse(readFileSync("firebase.json", "utf8")).hosting;
  it("serves the app at /app/** and /signin, the site pages by clean URL, and no catch-all", () => {
    const map = Object.fromEntries(hosting.rewrites.map((r: { source: string; destination: string }) => [r.source, r.destination]));
    expect(map["/app"]).toBe("/app.html");
    expect(map["/app/**"]).toBe("/app.html");
    expect(map["/signin"]).toBe("/app.html");
    expect(map["/privacy"]).toBe("/privacy.html");
    expect(map["/partners"]).toBe("/partners.html");
    // The old pages are redirects to their new sections, not rewrites.
    for (const gone of ["/connect", "/support", "/how-its-built"]) expect(map[gone]).toBeUndefined();
    expect(map["**"]).toBeUndefined();
  });
  it("never caches HTML for an hour", () => {
    const sources = hosting.headers.filter((h: { headers: { key: string; value: string }[] }) => h.headers.some((x) => x.key === "Cache-Control" && x.value === "no-cache")).map((h: { source: string }) => h.source);
    expect(sources).toContain("**/*.html");
    expect(sources).toContain("/");
  });
});

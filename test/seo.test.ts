import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const BASE = "https://atlas-explain.web.app";
const PAGES: Record<string, string> = {
  "index.html": "/",
  "how-it-works.html": "/how-it-works",
  "how-its-built.html": "/how-its-built",
  "welcome.html": "/welcome",
  "support.html": "/support",
  "privacy.html": "/privacy",
  "terms.html": "/terms",
  "app.html": "/app",
};
const meta = (html: string, attr: "name" | "property", key: string) =>
  new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1];

describe("search and link previews", () => {
  for (const [file, path] of Object.entries(PAGES)) {
    it(`${file} has a canonical URL, a description and a full link preview`, () => {
      const html = readFileSync(file, "utf8");
      expect(html).toContain(`<link rel="canonical" href="${BASE}${path}" />`);
      const desc = meta(html, "name", "description") ?? "";
      expect(desc.length).toBeGreaterThan(40);
      expect(desc.length).toBeLessThanOrEqual(170);
      expect(meta(html, "property", "og:description")).toBe(desc);
      expect(meta(html, "property", "og:url")).toBe(`${BASE}${path}`);
      expect(meta(html, "property", "og:image")).toBe(`${BASE}/og/atlas-explain.png`);
      expect(meta(html, "property", "og:title")).toBeTruthy();
      expect(meta(html, "name", "twitter:card")).toBe("summary_large_image");
      expect(html).not.toMatch(/name="robots" content="noindex"/);
    });
  }

  it("keeps the 404 page out of search results", () => {
    expect(readFileSync("404.html", "utf8")).toContain('<meta name="robots" content="noindex" />');
  });

  it("ships a 1200×630 preview image", () => {
    const b = readFileSync("public/og/atlas-explain.png");
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1200, 630]);
  });

  it("lists every public page in the sitemap, and robots.txt points to it", () => {
    const sitemap = readFileSync("public/sitemap.xml", "utf8");
    for (const path of Object.values(PAGES)) expect(sitemap).toContain(`<loc>${BASE}${path}</loc>`);
    expect(sitemap.match(/<loc>/g)?.length).toBe(Object.keys(PAGES).length);
    const robots = readFileSync("public/robots.txt", "utf8");
    expect(robots).toContain(`Sitemap: ${BASE}/sitemap.xml`);
    expect(robots).toMatch(/Disallow: \/signin/);
    expect(existsSync("public/og/atlas-explain.png")).toBe(true);
  });
});

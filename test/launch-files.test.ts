import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(p, "utf8");
const PAGES = ["index.html", "app.html", "connect.html", "partners.html", "support.html", "privacy.html", "terms.html", "how-its-built.html", "404.html"];

describe("files a public launch needs", () => {
  it("makes the web app installable: a manifest with real PNG icons, linked from every page", () => {
    const m = JSON.parse(read("public/manifest.webmanifest")) as { start_url: string; display: string; icons: { src: string; purpose: string }[] };
    expect(m.start_url).toBe("/app");
    expect(m.display).toBe("standalone");
    for (const icon of m.icons) {
      const file = "public" + icon.src;
      expect(existsSync(file), file).toBe(true);
      expect(readFileSync(file).subarray(1, 4).toString()).toBe("PNG");
    }
    expect(m.icons.map((i) => i.purpose)).toContain("maskable");
    for (const page of PAGES) {
      expect(read(page), page).toContain('<link rel="manifest" href="/manifest.webmanifest" />');
      expect(read(page), page).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />');
    }
  });

  it("serves a real /favicon.ico (an ICO holding a PNG), so browsers asking for it don't get a 404", () => {
    const ico = readFileSync("public/favicon.ico");
    expect([...ico.subarray(0, 4)]).toEqual([0, 0, 1, 0]);
    expect(ico.subarray(23, 26).toString()).toBe("PNG");
  });

  it("publishes a security.txt that hasn't expired, and deploys the .well-known folder", () => {
    const txt = read("public/.well-known/security.txt");
    expect(txt).toMatch(/^Contact: https:\/\//m);
    const expires = Date.parse(/^Expires: (.+)$/m.exec(txt)![1]!);
    expect(expires).toBeGreaterThan(Date.now());
    expect(expires - Date.now()).toBeLessThan(366 * 24 * 3600 * 1000);
    const ignore = (JSON.parse(read("firebase.json")) as { hosting: { ignore: string[] } }).hosting.ignore;
    expect(ignore).not.toContain("**/.*");
  });

  it("describes the connector for AI tools in llms.txt, with the live address and education-only wording", () => {
    const txt = read("public/llms.txt");
    expect(txt).toMatch(/^# ATLAS Explain\r?\n/);
    expect(txt).toContain("https://atlas-explain-mcp.atlas-explain.workers.dev/mcp");
    expect(txt).toMatch(/Education only/);
    expect(txt).not.toMatch(/\b(buy|sell)\b/i);
  });
});

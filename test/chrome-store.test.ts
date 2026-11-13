import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Width and height from a PNG header, plus whether the colour type has alpha. */
function png(path: string): { w: number; h: number; alpha: boolean } {
  const b = readFileSync(path);
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), alpha: b[25] === 4 || b[25] === 6 };
}

const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const doc = readFileSync("docs/CHROME_STORE.md", "utf8");

describe("Chrome Web Store readiness", () => {
  it("ships icons at 16, 32, 48 and 128", () => {
    for (const size of [16, 32, 48, 128]) {
      expect(manifest.icons[String(size)]).toBe(`icons/icon-${size}.png`);
      expect(manifest.action.default_icon[String(size)]).toBe(`icons/icon-${size}.png`);
      const { w, h } = png(`extension/public/icons/icon-${size}.png`);
      expect([w, h]).toEqual([size, size]);
    }
  });

  it("has every listing image at the exact store size, without alpha", () => {
    const files: [string, number, number][] = [
      ["store/promo-small-440x280.png", 440, 280],
      ["store/promo-marquee-1400x560.png", 1400, 560],
    ];
    for (const n of ["1-explain", "2-highlight", "3-sidepanel", "4-learn", "5-privacy"]) {
      files.push([`store/screenshot-${n}-1280x800.png`, 1280, 800], [`store/screenshot-${n}-640x400.png`, 640, 400]);
    }
    for (const [file, w, h] of files) {
      expect(existsSync(file), file).toBe(true);
      expect(png(file)).toEqual({ w, h, alpha: false });
    }
  });

  it("keeps an MV3 CSP with no remote, inline or eval script", () => {
    expect(manifest.manifest_version).toBe(3);
    const csp: string = manifest.content_security_policy.extension_pages;
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).not.toMatch(/unsafe-eval|unsafe-inline|https?:|\*/);
    expect(manifest.description.length).toBeLessThanOrEqual(132);
  });

  it("documents a justification for every permission and host, and the privacy URL", () => {
    for (const p of [...manifest.permissions, ...manifest.optional_permissions, ...manifest.host_permissions]) {
      expect(doc, p).toContain(`\`${p}\``);
    }
    expect(doc).toContain("https://atlas-explain.web.app/privacy");
    expect(doc).toMatch(/Single purpose/);
    const summary = /\| Summary \(≤132 chars\) \| ([^|]+) \|/.exec(doc)?.[1]?.trim() ?? "";
    expect(summary.length).toBeGreaterThan(20);
    expect(summary.length).toBeLessThanOrEqual(132);
  });

  it("opens the side panel in its own full-height layout", () => {
    expect(readFileSync("extension/src/popup.ts", "utf8")).toContain('path: "popup.html?view=panel"');
    expect(readFileSync("extension/popup.css", "utf8")).toContain('html[data-view="panel"]');
  });
});

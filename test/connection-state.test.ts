import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connectionFor } from "../src/core/app-copy";

describe("the header status pill", () => {
  it("is offline whenever the browser is, before anything else", () => {
    expect(connectionFor({ online: false, livePrices: true })).toBe("offline");
  });

  it("says live once prices arrive, and hosted until then", () => {
    expect(connectionFor({ online: true, livePrices: true })).toBe("live");
    expect(connectionFor({ online: true, livePrices: false })).toBe("hosted");
  });

  it("never looks for another app on this computer: the web app talks only to ATLAS Explain's own services", () => {
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app).not.toMatch(/localhost|127\.0\.0\.1|atlasLocal|probeAtlasLocal|ATLAS desk/);
  });

  it("is decided in one place", () => {
    const src = readFileSync("src/web/app.ts", "utf8");
    expect(src).toContain("shell.setConnection(connectionFor({");
    expect(src).not.toMatch(/setConnection\("(offline|desk|local|live|hosted|none)"\)/);
  });
});

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { connectionFor } from "../src/core/popup-copy";

const base = { online: true, deskConnected: false, atlasLocal: false, livePrices: false };

describe("the header status pill", () => {
  it("is offline whenever the browser is, before anything else", () => {
    expect(connectionFor({ ...base, online: false, deskConnected: true, atlasLocal: true, livePrices: true })).toBe("offline");
  });

  it("prefers the ATLAS desk, then ATLAS on this computer, then live public prices", () => {
    expect(connectionFor({ ...base, deskConnected: true, atlasLocal: true, livePrices: true })).toBe("desk");
    expect(connectionFor({ ...base, atlasLocal: true, livePrices: true })).toBe("local");
    expect(connectionFor({ ...base, livePrices: true })).toBe("live");
    expect(connectionFor(base)).toBe("none");
  });

  it("never looks for ATLAS on the public website, so it says hosted until prices arrive", () => {
    expect(connectionFor({ ...base, hosted: true, atlasLocal: true })).toBe("hosted");
    expect(connectionFor({ ...base, hosted: true, livePrices: true })).toBe("live");
  });

  it("keeps ATLAS present in the web app when either check found it, so one cannot overwrite the other", () => {
    const app = readFileSync("src/web/app.ts", "utf8");
    expect(app.match(/atlasLocal = /g)).toHaveLength(3); // the declaration and the two combined writes
    expect(app.match(/atlasLocal = atlasProbed \|\| atlasCatalog;/g)).toHaveLength(2);
    expect(app).toContain('atlasProbed = link.state === "local";');
    expect(app).toContain('if (state.kind !== "loading") atlasCatalog = ');
  });

  it("is decided in one place for both surfaces", () => {
    for (const file of ["src/web/app.ts", "extension/src/popup.ts"]) {
      const src = readFileSync(file, "utf8");
      expect(src, file).toContain("shell.setConnection(connectionFor({");
      expect(src, file).not.toMatch(/setConnection\("(offline|desk|local|live|hosted|none)"\)/);
    }
  });
});

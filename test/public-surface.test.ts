import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What a member of the public can see. Development switches and ATLAS-only parts
 * must stay out of the default view; these checks keep them from creeping back.
 */
const web = readFileSync("src/web/app.ts", "utf8");

describe("public surface", () => {
  it("compiles screenshot and demo switches out of production builds", () => {
    expect(web).toContain("if (import.meta.env.DEV) applyPreview();");
    expect(web).not.toMatch(/const DEMO_RUN\b/);
  });

  it("hides ATLAS-only parts until ATLAS itself is present", () => {
    expect(web).toMatch(/atlasBlock\.hidden = !atlasPresent/);
    expect(web).toMatch(/setMenuItemHidden\("desk", !atlasPresent\)/);
  });

  it("shows no prompt preview, JSON editor or config names in the web app", () => {
    for (const gone of ["Preview prompt", "Edit the move card (JSON)", "Loading Remote Config", "Inference preference:", "browser console"]) {
      expect(web).not.toContain(gone);
    }
  });

});

describe("web app entry size", () => {
  it("loads the catalog layer on demand, never from the app entry", () => {
    const staticImports = [...web.matchAll(/^import [^;]*? from "([^"]+)";/gm)].map((m) => m[1]!);
    for (const banned of ["/core/catalog", "/core/asset-schema", "/core/news", "/core/education-assets", "/wallet/catalog-view"]) {
      expect(staticImports.filter((p) => p.endsWith(banned)), banned).toEqual([]);
    }
  });
});

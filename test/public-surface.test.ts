import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * What a member of the public can see. Development switches and ATLAS-only parts
 * must stay out of the default view; these checks keep them from creeping back.
 */
const web = readFileSync("src/web/app.ts", "utf8");
const popup = readFileSync("extension/src/popup.ts", "utf8");

describe("public surface", () => {
  it("compiles screenshot and demo switches out of production builds", () => {
    expect(web).toContain("if (import.meta.env.DEV) applyPreview();");
    expect(popup).toContain("if (import.meta.env.DEV) applyPreviewState();");
    expect(web).not.toMatch(/const DEMO_RUN\b/);
  });

  it("hides ATLAS-only parts until ATLAS itself is present", () => {
    expect(web).toMatch(/atlasBlock\.hidden = !atlasPresent/);
    expect(web).toMatch(/setMenuItemHidden\("desk", !atlasPresent\)/);
    expect(popup).toContain('shell.setTabHidden("signal", true)');
    expect(popup).toMatch(/shell\.setTabHidden\("signal", !atlasPresent\)/);
    expect(popup).toMatch(/today\.node\.hidden = !atlasPresent/);
  });

  it("shows no prompt preview, JSON editor or config names in the web app", () => {
    for (const gone of ["Preview prompt", "Edit the move card (JSON)", "Loading Remote Config", "Inference preference:", "browser console"]) {
      expect(web).not.toContain(gone);
    }
  });

  it("does not gate highlight-to-explain behind a paid plan in the popup", () => {
    expect(popup).not.toContain("extensionHighlightAllowed");
    expect(popup).not.toMatch(/Pro entitlement|coming after beta/);
  });
});

describe("popup size", () => {
  it("loads the glossary on demand, never at popup start", () => {
    const staticImports = [...popup.matchAll(/^import [^;]*? from "([^"]+)";/gm)].map((m) => m[1]!);
    for (const banned of ["/core/terms", "/core/learn", "/core/related-terms", "/core/glossary", "/wallet/glossary-panel", "/wallet/learn-card"]) {
      expect(staticImports.filter((p) => p.endsWith(banned)), banned).toEqual([]);
    }
    expect(popup).toContain('import("./learn-tab")');
  });
});

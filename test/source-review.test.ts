import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRoute, pathFor } from "../src/app/routes";
import { sparkSvg } from "../src/core/assets";

describe("one sparkline for every chart", () => {
  it("draws line, area and latest-price dot from numbers only, and nothing for fewer than two prices", () => {
    const svg = sparkSvg([{ t: "2026-11-15T00:00:00Z", c: 10 }, { t: "2026-11-15T01:00:00Z", c: 12 }, { t: "2026-11-15T02:00:00Z", c: 11 }]);
    expect(svg).toContain('class="spark-line"');
    expect(svg).toContain('class="spark-area"');
    expect(svg).toContain('class="spark-end"');
    expect(svg).not.toMatch(/NaN|undefined/);
    expect(sparkSvg([{ t: "2026-11-15T00:00:00Z", c: 10 }])).toBe("");
    for (const f of ["src/wallet/catalog-view.ts"]) {
      expect(readFileSync(f, "utf8"), f).toContain("sparkSvg(");
      expect(readFileSync(f, "utf8"), f).not.toContain("<svg viewBox");
    }
  });
});

describe("one address per page", () => {
  it("maps old aliases and loose forms to one canonical path, which the app writes back", () => {
    for (const [loose, canonical] of [["/app/glossary", "/app/learn"], ["/app/settings", "/app/account"], ["/app/learn/", "/app/learn"], ["/app/assets/btc", "/app/assets/BTC"], ["/app.html", "/app"]] as const) {
      expect(pathFor(parseRoute(loose)), loose).toBe(canonical);
    }
    expect(readFileSync("src/web/app.ts", "utf8")).toContain("history.replaceState(null, \"\", pathFor(route) + location.search + location.hash)");
  });
});

describe("saved explanations are capped in the rules", () => {
  it("allows only the fields the app writes and never an edit", () => {
    const rules = readFileSync("firestore.rules", "utf8");
    const block = rules.slice(rules.indexOf("match /users/{userId}/explanations/"), rules.indexOf("match /users/{userId}/plan/"));
    expect(block).toContain("keys().hasOnly([");
    expect(block).not.toMatch(/allow create, update/);
    const saved = readFileSync("src/platform/web/backend.ts", "utf8");
    const fields = [...saved.slice(saved.indexOf("addExplanation(uid, {"), saved.indexOf("cardJson: JSON.stringify")).matchAll(/^\s{8}(\w+):/gm)].map((m) => m[1]!);
    for (const f of [...fields, "cardJson", "createdAt"]) expect(block, f).toContain(`"${f}"`);
  });
});

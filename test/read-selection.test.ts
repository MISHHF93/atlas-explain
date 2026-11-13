import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../extension/src/read-selection.ts", import.meta.url), "utf8");

function body(name: string): string {
  const start = source.indexOf(`export function ${name}`);
  const next = source.indexOf("\nexport function", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

describe("injected page functions", () => {
  it("keep their message names inside the function, because chrome.scripting serialises them alone", () => {
    const probe = body("probeAtlasDesk");
    expect(probe).toContain('"atlas-explain/v1/load"');
    expect(probe).toContain('"atlas-explain/v1/request-context"');
    expect(source.slice(0, source.indexOf("export function"))).not.toMatch(/^const /m);
  });

  it("recognise the ATLAS desk marker on any element, not only <html>", () => {
    expect(body("probeAtlasDesk")).toContain('[data-atlas-product="atlas-desk"]');
  });

  it("never read form fields, balances, or accounts", () => {
    expect(source).not.toMatch(/querySelectorAll\(["']input|\.value\b|balance\s*[:=]|account\w*\s*[:=]/i);
  });
});

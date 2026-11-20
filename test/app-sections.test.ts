import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRoute, pathFor, titleFor } from "../src/app/routes";
import { plain, readDocsFile } from "../src/data/docs";

const app = readFileSync("src/web/app.ts", "utf8");

describe("the app shows what the connector serves: Economy and Tools sections", () => {
  it("has an address and a title for each new section", () => {
    expect(parseRoute("/app/economy")).toEqual({ kind: "tab", tab: "economy" });
    expect(parseRoute("/app/tools")).toEqual({ kind: "tab", tab: "tools" });
    expect(pathFor({ kind: "tab", tab: "tools" })).toBe("/app/tools");
    expect(titleFor({ kind: "tab", tab: "economy" })).toBe("Economy · ATLAS Explain");
  });

  it("lists them in the navigation and loads them after start, outside the first-load budget", () => {
    for (const id of ["explain", "today", "economy", "assets", "tools", "glossary"]) expect(app, id).toContain(`{ id: "${id}"`);
    expect(app).toContain('import("../wallet/economy-section")');
    expect(app).toContain('import("../wallet/tools-section")');
  });

  it("covers the connector's other answers: figures, decisions, speeches, auctions, countries; rate change, money maths, scam check", () => {
    const economy = readFileSync("src/wallet/economy-section.ts", "utf8");
    for (const part of ["indicatorsCard", "banksCard", "speechesCard", "auctionsCard", "countriesCard", "sharePrices"]) expect(economy, part).toContain(part);
    const tools = readFileSync("src/wallet/tools-section.ts", "utf8");
    for (const part of ["rateChangeImpact", "moneyMaths", "matchRedFlags", "CHECKS", "REPORT"]) expect(tools, part).toContain(part);
    // Tools run in the browser: nothing typed is sent anywhere.
    expect(tools).not.toMatch(/fetch\(/);
  });
});

describe("text from the banks' feeds reads correctly", () => {
  it("decodes accented letters, also in speeches stored before the fix", () => {
    expect(plain("Bras&iacute;lia, Gen&egrave;ve, &uuml;ber, Fran&ccedil;ais, &Eacute;cole")).toBe("Brasília, Genève, über, Français, École");
    const stored = { schema: "atlas-explain-docs-v1", generatedAt: "2026-11-20T00:00:00.000Z", statements: {}, speeches: { fed: [{ bank: "fed", date: "2026-11-19", title: "Speech", speaker: "Jefferson", about: "Bras&iacute;lia, Brazil", url: "https://x.gov/a" }] } };
    expect(readDocsFile(stored)!.speeches.fed[0]!.about).toBe("Brasília, Brazil");
  });
});

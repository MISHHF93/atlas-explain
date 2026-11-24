import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FALLBACK_TEXT, shouldTakeOver } from "../src/wallet/error-boundary";

const firebase = JSON.parse(readFileSync("firebase.json", "utf8")) as {
  hosting: { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
};
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string; engines: { node: string } };

function header(key: string): string {
  const all = firebase.hosting.headers.find((h) => h.source === "**")?.headers ?? [];
  return all.find((h) => h.key === key)?.value ?? "";
}

describe("hosting security headers", () => {
  it("sends a strict CSP that lets Firebase through and nothing on this computer", () => {
    const csp = header("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    // The hosted app never calls localhost (local builds run under Vite, without these headers),
    // so production upgrades any stray http request and does not allow localhost connections.
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toMatch(/connect-src[^;]*localhost/);
    expect(csp).not.toMatch(/connect-src[^;]*127\.0\.0\.1/);
    // Only the site itself may frame the app (the separate local ATLAS app no longer embeds it).
    expect(csp).toMatch(/frame-ancestors 'self';/);
    expect(csp).not.toContain("chrome-extension:");
    expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.googleapis\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/api\.kraken\.com/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/api\.coingecko\.com/);
  });

  it("sets the standard hardening headers", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("Permissions-Policy")).toContain("camera=()");
    expect(header("Strict-Transport-Security")).toContain("max-age=");
  });
});

describe("error boundary", () => {
  it("only takes over an empty wallet, once", () => {
    expect(shouldTakeOver({ childElementCount: 0 }, false)).toBe(true);
    expect(shouldTakeOver({ childElementCount: 3 }, false)).toBe(false);
    expect(shouldTakeOver({ childElementCount: 0 }, true)).toBe(false);
  });

  it("is installed in the web app, with education-only copy", () => {
    expect(readFileSync("src/main.ts", "utf8")).toContain("installErrorBoundary");
    expect(FALLBACK_TEXT).not.toMatch(/\b(buy|sell)\b/i);
    expect(readFileSync("src/wallet/error-boundary.ts", "utf8")).not.toContain("innerHTML");
  });
});

describe("runtime", () => {
  it("pins Node 22/24 LTS", () => {
    expect(pkg.engines.node).toBe("^22.12.0 || ^24.0.0");
    expect(readFileSync(".nvmrc", "utf8").trim()).toBe("24");
  });
});

describe("trade-word scan", () => {
  it("flags instructions but not neutral explanations", async () => {
    const { scanText } = await import("../scripts/trade-word-scan.mjs");
    expect(scanText("Strong buy on NVDA")).not.toEqual([]);
    expect(scanText("You should sell before the close")).not.toEqual([]);
    expect(scanText("Time to buy the dip")).not.toEqual([]);
    expect(scanText("Why might some traders buy this dip while others sell?")).toEqual([]);
    expect(scanText("Model leans up · not enough evidence")).toEqual([]);
  });
});

describe("trade-word scan guard patterns", () => {
  it("ignores the guard regexes that block trade questions", async () => {
    const { scanText } = await import("../scripts/trade-word-scan.mjs");
    expect(scanText("const g = /\\b(buy now|sell now|you should buy)\\b/i;")).toEqual([]);
  });
});

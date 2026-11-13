import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkManifest, extensionSource } from "../scripts/check-manifest.mjs";
import { FALLBACK_TEXT, shouldTakeOver } from "../src/wallet/error-boundary";

const firebase = JSON.parse(readFileSync("firebase.json", "utf8")) as {
  hosting: { headers: Array<{ source: string; headers: Array<{ key: string; value: string }> }> };
};
const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8")) as Record<string, unknown>;
const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { version: string; engines: { node: string } };

function header(key: string): string {
  const all = firebase.hosting.headers.find((h) => h.source === "**")?.headers ?? [];
  return all.find((h) => h.key === key)?.value ?? "";
}

describe("hosting security headers", () => {
  it("sends a strict CSP that still lets the local ATLAS desk and Firebase through", () => {
    const csp = header("Content-Security-Policy");
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).not.toMatch(/unsafe-eval/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    // The Assets tab reads the user's own ATLAS over http://localhost, so never auto-upgrade it.
    expect(csp).not.toContain("upgrade-insecure-requests");
    expect(csp).toMatch(/connect-src[^;]*http:\/\/localhost:3000/);
    expect(csp).toMatch(/connect-src[^;]*https:\/\/\*\.googleapis\.com/);
  });

  it("sets the standard hardening headers", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(header("Permissions-Policy")).toContain("camera=()");
    expect(header("Strict-Transport-Security")).toContain("max-age=");
  });
});

describe("extension manifest", () => {
  it("asks only for least-privilege permissions", () => {
    expect(checkManifest(manifest, extensionSource("."))).toEqual([]);
  });

  it("rejects broad hosts, content scripts and remote code", () => {
    const wide = { ...manifest, host_permissions: ["<all_urls>"], content_scripts: [{}], permissions: ["tabs"] };
    const problems = checkManifest(wide, extensionSource("."));
    expect(problems.join("\n")).toMatch(/<all_urls>/);
    expect(problems.join("\n")).toMatch(/content_scripts/);
    expect(problems.join("\n")).toMatch(/"tabs"/);
    const evalCsp = { ...manifest, content_security_policy: { extension_pages: "script-src 'self' 'unsafe-eval'" } };
    expect(checkManifest(evalCsp, extensionSource(".")).length).toBeGreaterThan(0);
  });

  it("keeps the manifest version in step with package.json", () => {
    expect(manifest.version).toBe(pkg.version);
  });
});

describe("error boundary", () => {
  it("only takes over an empty wallet, once", () => {
    expect(shouldTakeOver({ childElementCount: 0 }, false)).toBe(true);
    expect(shouldTakeOver({ childElementCount: 3 }, false)).toBe(false);
    expect(shouldTakeOver({ childElementCount: 0 }, true)).toBe(false);
  });

  it("is installed in the web app and the popup, with education-only copy", () => {
    expect(readFileSync("src/main.ts", "utf8")).toContain("installErrorBoundary");
    expect(readFileSync("extension/src/popup.ts", "utf8")).toContain("installErrorBoundary");
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

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SAMPLE_TERM, WELCOME_URL } from "../src/core/popup-copy";

const html = readFileSync(new URL("../welcome.html", import.meta.url), "utf8");
const background = readFileSync(new URL("../extension/src/background.ts", import.meta.url), "utf8");
// Read from the source: importing background.ts would run its Chrome API calls.
const MENU_TITLE = /export const MENU_TITLE = "([^"]+)"/.exec(background)?.[1] ?? "missing";
const firebase = JSON.parse(readFileSync(new URL("../firebase.json", import.meta.url), "utf8")) as {
  hosting: { redirects?: { source: string; destination: string; type: number }[]; rewrites: { source: string; destination: string }[] };
};

describe("welcome page (first run)", () => {
  it("is static practice text: no forms, no prices, only the tiny site script", () => {
    expect(html).not.toMatch(/<form|<input|<textarea/i);
    expect(html).not.toMatch(/\$\s?\d/);
    expect([...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map((m) => m[1])).toEqual(["/src/site/site.ts"]);
  });

  it("walks through pinning, trying it on the page, and optional sign-in", () => {
    expect(html).toMatch(/Pin it to your toolbar/);
    expect(html).toMatch(/stop-limit order/i);
    expect(html).toContain(`<b>${MENU_TITLE}</b>`);
    expect(html).toMatch(/Alt<\/kbd>\+<kbd>Shift<\/kbd>\+<kbd>X/);
    expect(html).toMatch(/Optional: sign in/);
    expect(html).toContain('href="/app"');
  });

  it("never tells the reader to trade", () => {
    expect(html).not.toMatch(/\b(you should|time to|go ahead and)\s+(buy|sell)\b|\b(buy|sell)\s+(now|signal|today)\b/i);
  });

  it("is served at /welcome, and the old practice page address redirects there", () => {
    expect(firebase.hosting.rewrites).toContainEqual({ source: "/welcome", destination: "/welcome.html" });
    expect(firebase.hosting.redirects).toContainEqual({ source: "/demo/trading-terms.html", destination: "/welcome", type: 301 });
  });
});

describe("first install", () => {
  it("opens the welcome page once, on install only, at the shared address", () => {
    expect(background).toMatch(/details\.reason === "install"/);
    expect(background).toContain(`"${WELCOME_URL}"`);
    expect(WELCOME_URL).toBe("https://atlas-explain.web.app/welcome?installed=1");
  });

  it("has a sample term for the onboarding 'Try a sample now' button", () => {
    expect(SAMPLE_TERM).toBe("Stop-limit order");
  });
});

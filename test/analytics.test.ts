import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EVENTS, createTracker, readConsent, sanitizeEvent } from "../src/core/analytics";
import { DEFAULT_SETTINGS } from "../src/core/settings";
import template from "../remoteconfig.template.json";

describe("analytics privacy rules", () => {
  it("sends only allowlisted events, with only short codes or small counts", () => {
    expect(sanitizeEvent("explanation_ready", { source: "on_device", kind: "text", text: "stop-limit order" })).toEqual({ name: "explanation_ready", params: { source: "on_device", kind: "text" } });
    expect(sanitizeEvent("explanation_ready", { source: "Ran on NVDA at $120", kind: "text" })).toEqual({ name: "explanation_ready", params: { kind: "text" } });
    expect(sanitizeEvent("login", { method: "a@example.com" })).toEqual({ name: "login", params: {} });
    expect(sanitizeEvent("page_view_with_query", { q: "x" })).toBeNull();
    expect(sanitizeEvent("app_error", { code: "cloud_failed", surface: "web", stack: "Error at ..." })).toEqual({ name: "app_error", params: { code: "cloud_failed", surface: "web" } });
  });

  it("never allows a parameter that could carry what someone typed, highlighted or saved", () => {
    const keys = new Set(Object.values(EVENTS).flat());
    for (const banned of ["text", "query", "selection", "email", "symbol", "price", "title", "url", "uid"]) expect(keys.has(banned as never), banned).toBe(false);
  });

  it("sends nothing until consent attaches a sink, and stops when it is withdrawn", () => {
    const t = createTracker();
    const sent: string[] = [];
    t.track("try_sample");
    expect(sent).toEqual([]);
    t.attach({ log: (name) => sent.push(name) });
    t.track("try_sample");
    t.attach(null);
    t.track("try_sample");
    expect(sent).toEqual(["try_sample"]);
    expect(t.sent()).toBe(1);
  });

  it("reads consent strictly", () => {
    expect(readConsent("granted")).toBe("granted");
    expect(readConsent("denied")).toBe("denied");
    expect(readConsent("yes")).toBe("unset");
    expect(readConsent(null)).toBe("unset");
  });

  it("is off by default, so nothing loads or asks until the owner turns it on", () => {
    expect(DEFAULT_SETTINGS.analyticsEnabled).toBe(false);
    expect(template.parameters.analytics_enabled.defaultValue.value).toBe("false");
  });
});

describe("the Chrome extension", () => {
  it("contains no analytics code at all", () => {
    const files = readdirSync("extension/src").filter((f) => f.endsWith(".ts")).map((f) => readFileSync(join("extension/src", f), "utf8"));
    for (const src of files) {
      expect(src).not.toMatch(/firebase\/analytics|core\/analytics|gtag/);
    }
  });

  it("logs errors to the console only in development builds", () => {
    expect(readFileSync("extension/src/popup.ts", "utf8")).toContain("if (import.meta.env.DEV) addMonitorSink(consoleSink);");
    expect(readFileSync("src/main.ts", "utf8")).toContain("if (import.meta.env.DEV) addMonitorSink(consoleSink);");
  });
});

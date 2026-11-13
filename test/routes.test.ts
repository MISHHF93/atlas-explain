import { describe, expect, it } from "vitest";
import { legacyRedirect, parseRoute, pathFor, tabFor, titleFor } from "../src/app/routes";

describe("app routes", () => {
  it("maps each screen to one address and back", () => {
    expect(parseRoute("/app")).toEqual({ kind: "tab", tab: "today" });
    expect(parseRoute("/app/")).toEqual({ kind: "tab", tab: "today" });
    expect(parseRoute("/app/explain")).toEqual({ kind: "tab", tab: "explain" });
    expect(parseRoute("/app/learn")).toEqual({ kind: "tab", tab: "glossary" });
    expect(parseRoute("/app/account")).toEqual({ kind: "tab", tab: "settings" });
    expect(parseRoute("/app/digest")).toEqual({ kind: "tab", tab: "today" });
    expect(parseRoute("/signin")).toEqual({ kind: "signin" });
    for (const tab of ["today", "explain", "assets", "glossary", "settings"] as const) {
      expect(parseRoute(pathFor({ kind: "tab", tab }))).toEqual({ kind: "tab", tab });
    }
  });
  it("gives each asset its own page and rejects odd symbols", () => {
    expect(parseRoute("/app/assets/btc")).toEqual({ kind: "asset", symbol: "BTC" });
    expect(pathFor({ kind: "asset", symbol: "BRK.B" })).toBe("/app/assets/BRK.B");
    expect(tabFor({ kind: "asset", symbol: "BTC" })).toBe("assets");
    expect(parseRoute("/app/assets/%3Cscript%3E").kind).toBe("not_found");
    expect(parseRoute("/app/assets/%E0%A4%A").kind).toBe("not_found");
    expect(parseRoute("/app/nope")).toEqual({ kind: "not_found", path: "/app/nope" });
  });
  it("titles every route", () => {
    expect(titleFor({ kind: "tab", tab: "glossary" })).toBe("Learn · ATLAS Explain");
    expect(titleFor({ kind: "asset", symbol: "ETH" })).toContain("ETH");
  });
});

describe("links made for the old single-page app", () => {
  const at = (search: string, hash = "") => legacyRedirect({ pathname: "/", search, hash });
  it("leaves the plain landing page alone", () => {
    expect(at("")).toBeNull();
    expect(legacyRedirect({ pathname: "/privacy", search: "?tab=x", hash: "" })).toBeNull();
  });
  it("forwards ATLAS desk move links to Explain with the hash intact", () => {
    expect(at("", "#c=abc")).toBe("/app/explain#c=abc");
    expect(at("", "#concept=shadow")).toBe("/app/explain#concept=shadow");
    expect(at("", "#card=%7B%7D")).toBe("/app/explain#card=%7B%7D");
  });
  it("forwards extension and email sign-in links to /signin with their codes", () => {
    expect(at("?account=open")).toBe("/signin");
    expect(at("?signin=email&oobCode=XYZ&apiKey=k&mode=signIn")).toBe("/signin?signin=email&oobCode=XYZ&apiKey=k&mode=signIn");
  });
  it("forwards preview flags and old hash pages", () => {
    expect(at("?tab=assets&assets=box")).toBe("/app/assets?tab=assets&assets=box");
    expect(at("?demo=run")).toBe("/app?demo=run");
    expect(at("", "#/privacy")).toBe("/privacy");
  });
});

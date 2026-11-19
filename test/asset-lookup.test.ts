import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assetDetails, type Fetcher } from "../src/mcp/server";

// Only the built-in index, futures and options entries; the data site is "down", so no stock or fund is loaded.
const down: Fetcher = async () => new Response("down", { status: 503 });
const symbolFor = async (q: string) => (await assetDetails(q, down)).structuredContent?.symbol;

describe("asset_details picks the asset the words mean (found testing live, 19 Nov 2026)", () => {
  it("an exact name or the start of an index's name means the index, not a fund or contract on it", async () => {
    expect(await symbolFor("S&P 500")).toBe("SPX");
    expect(await symbolFor("Dow Jones")).toBe("DJI");
    expect(await symbolFor("Nasdaq-100")).toBe("NDX");
  });

  it("a kind word picks that kind: index, futures, options", async () => {
    expect(await symbolFor("S&P 500 index")).toBe("SPX");
    expect(await symbolFor("S&P 500 futures")).toBe("ES");
    expect(await symbolFor("S&P 500 options")).toBe("SPX-OPTIONS");
    expect(await symbolFor("S&P 500 index options")).toBe("SPX-OPTIONS");
  });
});

describe("source files hold no control characters", () => {
  // A shell once turned \\b in a regular expression into a backspace character, which broke matching silently.
  it("no backspace or other control characters (other than tab, newline, carriage return) in src or test", () => {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? (n === "fixtures" ? [] : walk(p)) : /\.(ts|mjs|cjs|js|html|css)$/.test(n) ? [p] : [];
    });
    const control = (text: string) => [...text].some((ch) => { const c = ch.charCodeAt(0); return c < 32 && c !== 9 && c !== 10 && c !== 13; });
    const bad = [...walk("src"), ...walk("test")].filter((f) => control(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});

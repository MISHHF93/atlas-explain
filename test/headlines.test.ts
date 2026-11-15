import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { headlinesFrom } from "../src/core/catalog";
import type { NewsFile, NewsItem } from "../src/core/news";
import { readNewsFile } from "../src/core/news";

const item = (title: string, url: string, seenAt: string): NewsItem => ({ title, url, domain: "example.com", seenAt });
const file = (items: Record<string, NewsItem[]>): NewsFile => ({ schema: "atlas-explain-news-v1", generatedAt: "2026-11-15T10:00:00Z", items });

describe("today's headlines", () => {
  it("lists each headline once, newest first, up to the limit", () => {
    const shared = item("Chip stocks slide", "https://a.example/1", "2026-11-15T09:00:00Z");
    const view = headlinesFrom(file({
      "stock:US:NVDA": [shared, item("Nvidia earnings ahead", "https://a.example/2", "2026-11-15T07:00:00Z")],
      "stock:US:AMD": [shared],
      "crypto:BTC": [item("Bitcoin steadies", "https://a.example/3", "2026-11-15T08:00:00Z")],
    }), 2);
    expect(view).toEqual({ kind: "ready", items: [shared, item("Bitcoin steadies", "https://a.example/3", "2026-11-15T08:00:00Z")] });
  });

  it("says there is nothing recent instead of showing old news", () => {
    // The published file is older than the freshness limit: every item is dropped when it is read.
    const now = Date.parse("2026-11-20T12:00:00Z");
    const read = readNewsFile({ ...file({ "crypto:BTC": [item("Old", "https://a.example/9", "2026-11-13T18:00:00Z")] }) }, now);
    expect(read).not.toBeNull();
    expect(headlinesFrom(read!)).toEqual({ kind: "none", generatedAt: "2026-11-15T10:00:00Z" });
  });

  it("is on Today in the web app, loaded on demand, and each headline can be explained", () => {
    const app = readFileSync("src/web/app.ts", "utf8");
    const card = readFileSync("src/wallet/headlines.ts", "utf8");
    expect(app).toContain('import("../core/catalog")');
    expect(app).toMatch(/headlinesCard\(view, \(title\) => sendToExplain\(title\)\)/);
    expect(card).toContain('link.rel = "noreferrer"');
    expect(card).toContain("we don't write or check them");
  });
});

describe("the practice page is reachable", () => {
  it("is linked from Learn on both surfaces and from the home page", () => {
    expect(readFileSync("src/web/app.ts", "utf8")).toContain('onPractice: () => location.assign("/welcome#step-try")');
    expect(readFileSync("extension/src/popup.ts", "utf8")).toContain("onPractice: () => openUrl(`${EXPLAIN_WEB_URL}/welcome#step-try`)");
    expect(readFileSync("index.html", "utf8")).toContain('<a href="/welcome#step-try">Practice page</a>');
  });
});

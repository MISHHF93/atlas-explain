import { describe, expect, it } from "vitest";
import { cryptoPrices, handle, MCP_APPS, officialFigures, TOOLS, type Fetcher } from "../src/mcp/server";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const treasury = { providerId: "us_treasury", label: "US Treasury", attribution: { text: "Source: U.S. Department of the Treasury", href: "https://home.treasury.gov/x" }, licence: { status: "public_domain", displayAllowed: true, mlAllowed: false, note: "" } };
const yieldAsset = (tenor: string, value: number, change: number) => ({
  id: `rate:US:${tenor}`, symbol: `US${tenor}`, name: `US ${tenor} Treasury yield`, class: "rate", venue: "US Treasury", currency: "%", country: "US",
  session: { state: "unknown", hours: "Published each US business day", nextChange: null },
  quote: { value, change, changePct: null, changeWindow: "vs previous business day", asOf: "2026-11-13T12:00:00Z", mode: "reference", source: treasury },
  noQuoteReason: null, facts: [], status: { state: "none" }, relatedTerms: ["yield_curve"], classData: { class: "rate", tenor, curve: "US Treasury par yield" },
});
const market = { schema: "atlas-explain-market-v1", generatedAt: "2026-11-15T10:00:00Z", assets: [yieldAsset("3M", 4.32, -0.01), yieldAsset("2Y", 4.88, 0.02), yieldAsset("10Y", 5.15, 0.05)] };
const sec = (iso: string) => Date.parse(iso) / 1000;
const crypto = {
  schema: "atlas-explain-crypto-v1",
  generatedAt: "2026-11-15T11:30:00Z",
  prices: { source: "kraken", asOf: "2026-11-15T11:30:00Z", coins: [{ symbol: "BTC", name: "Bitcoin", priceUsd: 65000, changePct: -1.2, changeWindow: "since 00:00 UTC" }] },
  history: { source: "kraken", asOf: "2026-11-15T11:30:00Z", interval: "1h", series: { BTC: [[sec("2026-11-10T11:00:00Z"), 70000], [sec("2026-11-14T13:00:00Z"), 64000], [sec("2026-11-15T01:00:00Z"), 64500], [sec("2026-11-15T11:00:00Z"), 65000]] } },
};
const net: Fetcher = async (url) => new Response(JSON.stringify(url.includes("crypto") ? crypto : market), { status: 200 });

describe("interactive views in the chat (MCP Apps)", () => {
  it("links each charted tool to its view", () => {
    const linked = Object.fromEntries(TOOLS.filter((t) => t._meta).map((t) => [t.name, t._meta!.ui.resourceUri]));
    expect(linked).toEqual({
      price_history: "ui://atlas-explain/price-chart.html",
      crypto_prices: "ui://atlas-explain/crypto-board.html",
      official_figures: "ui://atlas-explain/official-figures.html",
      economy_snapshot: "ui://atlas-explain/economy.html",
      market_depth: "ui://atlas-explain/market-depth.html",
      notable_today: "ui://atlas-explain/notable-today.html",
      money_maths: "ui://atlas-explain/money-maths.html",
    });
  });

  it("lists and serves every view as a self-contained page that speaks the MCP Apps bridge", async () => {
    const list = (await handle({ jsonrpc: "2.0", id: 1, method: "resources/list" }, net))?.result as { resources: { uri: string; mimeType: string }[] };
    for (const app of MCP_APPS) {
      expect(list.resources).toEqual(expect.arrayContaining([expect.objectContaining({ uri: app.uri, mimeType: "text/html;profile=mcp-app" })]));
      const read = (await handle({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: app.uri } }, net))?.result as { contents: { text: string }[] };
      const html = read.contents[0]!.text;
      expect(html, app.uri).toContain('"ui/initialize"');
      expect(html, app.uri).toContain("ui/notifications/tool-result");
      expect(html, app.uri).toContain("function onResult(");
      expect(html, app.uri).toContain("Educational information, not investment advice.");
      expect(html, app.uri).toMatch(/never a forecast/);
      expect(html, app.uri).not.toMatch(/<script[^>]+src=|<link[^>]+href=|fetch\(|XMLHttpRequest|@import/);
      expect(html, app.uri).not.toMatch(/\b(buy|sell)\b/i);
    }
  });

  it("gives each coin its last 24 hours for the board's sparkline", async () => {
    const coin = ((await cryptoPrices(undefined, net, NOW)).structuredContent!.coins as { spark: number[] }[])[0]!;
    // Only closes from the 24 hours before the latest one, oldest first.
    expect(coin.spark).toEqual([64000, 64500, 65000]);
  });

  it("gives yields their term and their change in percentage points, which the yield curve needs", async () => {
    const figures = (await officialFigures("Treasury", net, NOW)).structuredContent!.figures as { symbol: string; tenor: string | null; change: number | null }[];
    expect(figures.map((f) => [f.symbol, f.tenor, f.change])).toEqual(expect.arrayContaining([["US3M", "3M", -0.01], ["US2Y", "2Y", 0.02], ["US10Y", "10Y", 0.05]]));
  });

  it("the board opens a coin's chart through price_history, and the figures view draws a curve from three yields", () => {
    const board = MCP_APPS.find((a) => a.name === "crypto-board")!.html;
    expect(board).toContain('callTool("price_history", { coin: symbol, range })');
    const figures = MCP_APPS.find((a) => a.name === "official-figures")!.html;
    expect(figures).toMatch(/if \(rates\.length >= 3\) \{\s+curve\(rates\);/);
    expect(figures).toContain("Inverted: the ");
  });
});

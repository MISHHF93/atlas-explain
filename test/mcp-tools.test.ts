import { describe, expect, it } from "vitest";
import { assetDetails, browseGlossary, cryptoPrices, EDUCATION_LINE, handle, officialFigures, priceHistory, TOOLS, type Fetcher } from "../src/mcp/server";

const NOW = Date.parse("2026-11-15T12:00:00Z");
const src = (text: string) => ({ providerId: "sec_edgar", label: "10-K, filed 3 Nov 2026", attribution: { text, href: "https://www.sec.gov/x" }, licence: { status: "public_domain", displayAllowed: true, mlAllowed: false, note: "" } });
const market = {
  schema: "atlas-explain-market-v1",
  generatedAt: "2026-11-15T10:00:00Z",
  assets: [{
    id: "stock:US:AAPL", symbol: "AAPL", name: "Apple", class: "stock", venue: "Nasdaq", currency: "USD", country: "US",
    session: { state: "unknown", hours: "Mon–Fri, 9:30 am–4:00 pm New York time", nextChange: null },
    quote: null, noQuoteReason: "Price not shown. Free stock prices aren't licensed for public display.",
    facts: [{ kind: "figure", label: "Revenue", value: "$478.8 billion", period: "year to 26 Sept 2026", asOf: "2026-11-03T12:00:00Z", source: src("Source: SEC EDGAR") }],
    status: { state: "none" }, relatedTerms: ["filings"], classData: { class: "stock", cik: "0000320193", exchange: "Nasdaq" },
  }],
};
const coins = [
  { id: "bitcoin", current_price: 65000, price_change_percentage_24h: -1.2, last_updated: "2026-11-15T11:59:00Z" },
  { id: "ethereum", current_price: 1800, price_change_percentage_24h: 4.5, last_updated: "2026-11-15T11:59:00Z" },
];
const chart = { prices: [[Date.parse("2026-11-08T12:00:00Z"), 60000], [Date.parse("2026-11-10T12:00:00Z"), 70000], [Date.parse("2026-11-12T12:00:00Z"), 58000], [Date.parse("2026-11-15T12:00:00Z"), 65000]] };

/** Answers like the real sources; anything else is a network failure. */
const krakenTicker = { error: [], result: { XXBTZUSD: { c: ["64000.0", "0.1"], o: "62000.0" }, XETHZUSD: { c: ["1810.5", "1"], o: "1800.0" } } };
const krakenOhlc = { error: [], result: { XXBTZUSD: [[Date.parse("2026-11-14T12:00:00Z") / 1000, "0", "0", "0", "61000.0"], [Date.now() / 1000 - 3600, "0", "0", "0", "63000.0"], [Date.now() / 1000, "0", "0", "0", "64000.0"]], last: 0 } };
const net = (opts: { coingeckoDown?: boolean; krakenDown?: boolean } = {}): Fetcher => async (url) => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (url.includes("/data/v1/market.json")) return ok(market);
  if (url.includes("coingecko.com")) {
    if (opts.coingeckoDown) return new Response("busy", { status: 429 });
    return ok(url.includes("/market_chart") ? chart : coins);
  }
  if (url.includes("api.kraken.com")) {
    if (opts.krakenDown) throw new Error("offline");
    return ok(url.includes("/OHLC") ? krakenOhlc : krakenTicker);
  }
  throw new Error(`unexpected ${url}`);
};
const body = (r: { content: { text: string }[] }) => r.content[0]!.text;

describe("the connector covers what the app shows", () => {
  it("lists seven read-only tools, each with a description and an input schema", () => {
    expect(TOOLS).toHaveLength(7);
    for (const t of TOOLS) {
      expect(t.annotations.readOnlyHint).toBe(true);
      expect(t.description.length).toBeGreaterThan(40);
      expect(t.inputSchema.type).toBe("object");
    }
  });

  it("returns SEC-filed company figures, which used to be dropped for having no price", async () => {
    const r = body(await officialFigures("AAPL", net(), NOW));
    expect(r).toContain("Apple (AAPL): Revenue $478.8 billion (year to 26 Sept 2026)");
    expect(r).toContain("Source: SEC EDGAR (https://www.sec.gov/x)");
    expect(r).not.toContain("Source: Source:");
  });

  it("describes an asset with its hours, figures, related terms and app link, and says why there is no price", async () => {
    const r = body(await assetDetails("Apple", net(), NOW));
    expect(r).toMatch(/Apple \(AAPL\)\. Stocks, Nasdaq\./);
    expect(r).toContain("Trading hours: Mon–Fri");
    expect(r).toContain("Revenue $478.8 billion");
    expect(r).toContain("/app/assets/AAPL");
    expect(body(await assetDetails("Bitcoin", net(), NOW))).toContain("Price: $65,000.00");
    expect(body(await assetDetails("Unobtainium", net(), NOW))).toContain("isn't in the ATLAS Explain catalog");
  });

  it("lists live crypto prices biggest move first, with CoinGecko credited, and fails honestly", async () => {
    const r = body(await cryptoPrices(undefined, net(), NOW));
    expect(r.indexOf("Ethereum")).toBeLessThan(r.indexOf("Bitcoin"));
    expect(r).toContain("Prices by CoinGecko");
    // CoinGecko busy: Kraken answers instead, with its own window and credit.
    const fallback = body(await cryptoPrices(undefined, net({ coingeckoDown: true }), NOW));
    expect(fallback).toContain("Bitcoin (BTC): $64,000.00, +3.23% since 00:00 UTC");
    expect(fallback).toContain("Kraken public market data");
    expect(fallback).not.toContain("CoinGecko");
    expect(body(await priceHistory("BTC", "24h", net({ coingeckoDown: true })))).toContain("Kraken public market data");
    const down = await cryptoPrices(undefined, net({ coingeckoDown: true, krakenDown: true }), NOW);
    expect(down.isError).toBe(true);
    expect(body(down)).not.toMatch(/\$\d/);
    expect(body(await cryptoPrices("Shiba", net(), NOW))).toContain("isn't one of the ten coins");
  });

  it("summarises past moves with high and low, and never forecasts", async () => {
    const r = body(await priceHistory("BTC", "7d", net()));
    expect(r).toContain("over the last 7 days");
    expect(r).toContain("High: $70,000.00");
    expect(r).toContain("low: $58,000.00");
    expect(r).toContain("This describes the past only.");
    expect(r).not.toMatch(/will (rise|fall)|expect(ed)? to|forecast:/i);
  });

  it("walks the learning path and a glossary group", () => {
    expect(body(browseGlossary(undefined))).toMatch(/^The ATLAS Explain learning path, in order:\n1\. How orders fill/);
    expect(body(browseGlossary("rates"))).toContain("Rates and currencies");
    expect(body(browseGlossary("risk"))).toMatch(/- .+: /);
  });

  it("ends every tool answer with the education line, through the JSON-RPC handler", async () => {
    const calls: [string, Record<string, unknown>][] = [
      ["explain_term", { term: "spread" }], ["browse_glossary", {}], ["asset_details", { asset: "AAPL" }],
      ["official_figures", { query: "Apple" }], ["crypto_prices", {}], ["price_history", { coin: "ETH", range: "30d" }],
    ];
    for (const [name, args] of calls) {
      const reply = await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, net());
      const text = (reply?.result as { content: { text: string }[] }).content[0]!.text;
      expect(text.endsWith(EDUCATION_LINE), name).toBe(true);
    }
  });
});

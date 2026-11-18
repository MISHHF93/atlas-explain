import { describe, expect, it } from "vitest";
import { assetDetails, browseGlossary, cryptoPrices, EDUCATION_LINE, evidenceBrief, handle, officialFigures, priceHistory, TOOLS, type Fetcher } from "../src/mcp/server";
import { DATA_SITE_URL } from "../src/core/links";

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
const sec = (iso: string) => Date.parse(iso) / 1000;
/** ATLAS Explain's own crypto.json, as the data job publishes it. */
const crypto = (asOf = "2026-11-15T11:30:00Z") => ({
  schema: "atlas-explain-crypto-v1",
  generatedAt: asOf,
  prices: {
    source: "kraken",
    asOf,
    coins: [
      { symbol: "BTC", name: "Bitcoin", priceUsd: 65000, changePct: -1.2, changeWindow: "since 00:00 UTC" },
      { symbol: "ETH", name: "Ethereum", priceUsd: 1800, changePct: 4.5, changeWindow: "since 00:00 UTC" },
    ],
  },
  history: {
    source: "kraken",
    asOf,
    interval: "1h",
    series: {
      BTC: [[sec("2026-11-08T12:00:00Z"), 60000], [sec("2026-11-10T12:00:00Z"), 70000], [sec("2026-11-12T12:00:00Z"), 58000], [sec("2026-11-14T13:00:00Z"), 64000], [sec("2026-11-15T11:00:00Z"), 65000]],
      ETH: [[sec("2026-10-20T00:00:00Z"), 2400], [sec("2026-11-15T11:00:00Z"), 1800]],
    },
  },
});

/** Only ATLAS Explain's own data site answers; any other address is a failure, as on the live server. */
const net = (opts: { cryptoAsOf?: string; cryptoDown?: boolean } = {}): Fetcher => async (url) => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  if (!url.startsWith(`${DATA_SITE_URL}/`)) throw new Error(`not our data site: ${url}`);
  if (url.endsWith("/data/v1/market.json")) return ok(market);
  if (url.endsWith("/data/v1/crypto.json")) return opts.cryptoDown ? new Response("down", { status: 503 }) : ok(crypto(opts.cryptoAsOf));
  throw new Error(`unexpected ${url}`);
};
const body = (r: { content: { text: string }[] }) => r.content[0]!.text;

describe("the connector covers what the app shows", () => {
  it("lists seventeen read-only tools, each with a description and an input schema", () => {
    expect(TOOLS).toHaveLength(17);
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

  it("lists crypto prices from ATLAS Explain's own data site, biggest move first, with when and where they came from", async () => {
    const r = body(await cryptoPrices(undefined, net(), NOW));
    expect(r.indexOf("Ethereum")).toBeLessThan(r.indexOf("Bitcoin"));
    expect(r).toContain("Bitcoin (BTC): $65,000.00, −1.20% since 00:00 UTC");
    expect(r).toContain("Collected 2026-11-15 11:30 UTC by ATLAS Explain's data job and served from its own data site. Prices: Kraken public market data");
    expect(r).not.toContain("old: the regular refresh");
    const down = await cryptoPrices(undefined, net({ cryptoDown: true }), NOW);
    expect(down.isError).toBe(true);
    expect(body(down)).not.toMatch(/\$\d/);
    expect(body(await cryptoPrices("Shiba", net(), NOW))).toContain("isn't one of the ten coins");
  });

  it("says plainly how old the prices are when the regular refresh has stopped", async () => {
    expect(body(await cryptoPrices(undefined, net({ cryptoAsOf: "2026-11-15T05:00:00Z" }), NOW))).toContain("These are 7 hours old: the regular refresh hasn't run since.");
    expect(body(await cryptoPrices(undefined, net({ cryptoAsOf: "2026-11-12T12:00:00Z" }), NOW))).toContain("These are 3 days old");
    expect(body(await priceHistory("BTC", "7d", net({ cryptoAsOf: "2026-11-12T12:00:00Z" }), NOW))).toContain("3 days old");
  });

  it("never calls a third-party API: the server's fetch refuses anything but its own data site", async () => {
    const { ownDataFetch } = await import("../src/mcp/live-data");
    for (const url of ["https://api.coingecko.com/api/v3/ping", "https://api.kraken.com/0/public/Time", "https://example.com/"]) {
      await expect(ownDataFetch()(url)).rejects.toThrow(/not ATLAS Explain's data site/);
    }
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/mcp/server.ts", "utf8");
    expect(src).not.toMatch(/api\.coingecko\.com|api\.kraken\.com|COINGECKO_API|KRAKEN_API|loadCoinGecko|readKraken/);
  });

  it("summarises past moves with high and low, and never forecasts", async () => {
    const r = body(await priceHistory("BTC", "7d", net(), NOW));
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

/** Enough of JSON Schema for our output schemas: type (incl. nullable arrays), properties, required, items, enum. */
function conforms(value: unknown, schema: Record<string, unknown>, path = "$"): string[] {
  const errs: string[] = [];
  const types = ([] as string[]).concat((schema.type as string | string[] | undefined) ?? []);
  const actual = value === null ? "null" : Array.isArray(value) ? "array" : Number.isInteger(value) ? "integer" : typeof value;
  if (types.length && !types.includes(actual) && !(actual === "integer" && types.includes("number"))) return [`${path}: ${actual} is not ${types.join("|")}`];
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) errs.push(`${path}: ${String(value)} not in enum`);
  if (actual === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of (schema.required as string[] | undefined) ?? []) if (!(key in obj)) errs.push(`${path}.${key}: missing`);
    for (const [key, sub] of Object.entries((schema.properties as Record<string, Record<string, unknown>> | undefined) ?? {})) {
      if (key in obj) errs.push(...conforms(obj[key], sub, `${path}.${key}`));
    }
  }
  if (actual === "array" && schema.items) (value as unknown[]).forEach((v, i) => errs.push(...conforms(v, schema.items as Record<string, unknown>, `${path}[${i}]`)));
  return errs;
}

describe("structured output, prompts, icons and the chart app", () => {
  const news = { schema: "atlas-explain-news-v1", generatedAt: "2026-11-15T10:00:00Z", items: { "crypto:BTC": [{ title: "Bitcoin steadies", url: "https://a.example/1", domain: "a.example", seenAt: "2026-11-15T09:00:00Z" }] } };
  const full: Fetcher = async (url, init) => (url.includes("news.json") ? new Response(JSON.stringify(news), { status: 200 }) : net()(url, init));
  const call = async (name: string, args: Record<string, unknown>) =>
    (await handle({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }, full))?.result as { structuredContent?: Record<string, unknown>; isError?: boolean };

  it("gives every data tool an output schema, and every answer matches it", async () => {
    const cases: [string, Record<string, unknown>][] = [
      ["asset_details", { asset: "AAPL" }], ["asset_details", { asset: "BTC" }], ["asset_details", { asset: "nothing-here" }],
      ["official_figures", { query: "Apple" }], ["official_figures", { query: "zzz" }], ["crypto_prices", {}],
      ["price_history", { coin: "BTC", range: "24h" }], ["todays_headlines", {}], ["todays_headlines", { about: "zzz" }],
    ];
    for (const [name, args] of cases) {
      const tool = TOOLS.find((t) => t.name === name)!;
      const result = await call(name, args);
      expect(tool.outputSchema, name).toBeTruthy();
      expect(result.structuredContent, `${name} ${JSON.stringify(args)}`).toBeTruthy();
      expect(conforms(result.structuredContent, tool.outputSchema!), `${name} ${JSON.stringify(args)}`).toEqual([]);
      expect(result.structuredContent!.notice).toBe(EDUCATION_LINE);
    }
  });

  it("annotates every tool as read-only with a title and an icon, and links price_history to the chart", () => {
    for (const t of TOOLS) {
      expect(t.annotations).toMatchObject({ title: t.title, readOnlyHint: true, destructiveHint: false });
      expect(t.icons[0]).toEqual({ src: "https://atlas-explain-mcp.atlas-explain.workers.dev/icon.png", mimeType: "image/png", sizes: ["512x512"] });
    }
    expect(TOOLS.find((t) => t.name === "price_history")!._meta).toEqual({ ui: { resourceUri: "ui://atlas-explain/price-chart.html" } });
  });

  it("serves the chart as a self-contained MCP App page", async () => {
    const list = (await handle({ jsonrpc: "2.0", id: 1, method: "resources/list" }, full))?.result as { resources: { uri: string; mimeType: string }[] };
    expect(list.resources).toEqual(expect.arrayContaining([expect.objectContaining({ uri: "ui://atlas-explain/price-chart.html", mimeType: "text/html;profile=mcp-app" })]));
    const read = (await handle({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: "ui://atlas-explain/price-chart.html" } }, full))?.result as { contents: { text: string; mimeType: string }[] };
    const html = read.contents[0]!.text;
    expect(read.contents[0]!.mimeType).toBe("text/html;profile=mcp-app");
    expect(html).toContain('"ui/initialize"');
    expect(html).toContain("ui/notifications/tool-result");
    expect(html).toContain("Past prices only, never a forecast.");
    // Nothing loads from outside: the host's default CSP blocks it anyway.
    expect(html).not.toMatch(/<script[^>]+src=|<link[^>]+href=|fetch\(|XMLHttpRequest|@import/);
    expect((await handle({ jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: "ui://nope" } }, full))?.error?.code).toBe(-32002);
  });

  it("offers ten education-only prompts that fill in their arguments", async () => {
    const list = (await handle({ jsonrpc: "2.0", id: 1, method: "prompts/list" }, full))?.result as { prompts: { name: string }[] };
    expect(list.prompts.map((p) => p.name)).toEqual(["market_brief", "explain_asset", "learn_next", "brief_on_asset", "economy_today", "whats_notable", "check_an_offer", "money_lesson", "whats_coming_up", "quiz_me"]);
    const got = (await handle({ jsonrpc: "2.0", id: 2, method: "prompts/get", params: { name: "explain_asset", arguments: { asset: "Solana" } } }, full))?.result as { messages: { content: { text: string } }[] };
    const text = got.messages[0]!.content.text;
    expect(text).toContain("explain Solana");
    expect(text).toMatch(/don't suggest any trade/);
    expect((await handle({ jsonrpc: "2.0", id: 3, method: "prompts/get", params: { name: "nope" } }, full))?.error?.code).toBe(-32602);
  });

  it("announces tools, resources and prompts, with its icon", async () => {
    const init = (await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25" } }, full))?.result as { capabilities: Record<string, unknown>; serverInfo: { icons: unknown[] } };
    expect(Object.keys(init.capabilities).sort()).toEqual(["completions", "extensions", "prompts", "resources", "tools"]);
    // An inline PNG first (Claude never fetches an app icon from a URL), then the URLs for other clients.
    const icons = init.serverInfo.icons as { src: string; mimeType: string }[];
    expect(icons).toHaveLength(3);
    expect(icons[0]!.src.startsWith("data:image/png;base64,")).toBe(true);
    // Claude's limits: under 10 KB, and the whole serverInfo within about 16,000 characters of JSON.
    expect((icons[0]!.src.length - "data:image/png;base64,".length) * 0.75).toBeLessThan(10_000);
    expect(JSON.stringify(init.serverInfo).length).toBeLessThan(16_000);
  });

  it("follows Claude's MCP Apps guidelines: transparent, themed by the host, two display modes, skeletons, side panel for dashboards", async () => {
    const { MCP_APPS } = await import("../src/mcp/server");
    for (const app of MCP_APPS) {
      expect(app.html, app.uri).toContain('<meta name="color-scheme" content="light dark" />');
      expect(app.html, app.uri).toContain("background: transparent");
      expect(app.html, app.uri).toContain('availableDisplayModes: ["inline", "fullscreen"]');
      expect(app.html, app.uri).toContain("ctx.styles && ctx.styles.variables");
      expect(app.html, app.uri).toContain('id="expand"');
      expect(app.html, app.uri).toContain('ui/request-display-mode');
      expect(app.html, app.uri).toMatch(/class="sk"|className: "sk"/);
      expect(app.html, app.uri).not.toContain("Loading…");
      const read = (await handle({ jsonrpc: "2.0", id: 2, method: "resources/read", params: { uri: app.uri } }, full))?.result as { contents: { _meta: { ui: { prefersBorder: boolean; preferredDisplayMode?: string } } }[] };
      const ui = read.contents[0]!._meta.ui;
      expect(ui.prefersBorder, app.uri).toBe(false);
      expect(ui.preferredDisplayMode, app.uri).toBe(app.name === "economy" || app.name === "market-depth" ? "fullscreen" : undefined);
    }
  });

  it("lists the economy dashboard as an app people can open from Claude's Artifacts page", () => {
    const economy = TOOLS.find((t) => t.name === "economy_snapshot")!;
    expect(economy._meta?.["openai/ui"]).toEqual({ entrypoints: [{ type: "global" }] });
    expect(economy._meta?.ui.resourceUri).toBe("ui://atlas-explain/economy.html");
    // Opened from the Artifacts page with no request: every input must be optional.
    expect(economy.inputSchema.required ?? []).toEqual([]);
    expect(economy.title.length).toBeLessThanOrEqual(60);
    expect(economy.title).not.toMatch(/claude|anthropic/i);
  });
});

describe("ready to list in the MCP Registry", () => {
  it("keeps server.json in step with the server", async () => {
    const { readFileSync } = await import("node:fs");
    const { SERVER_VERSION } = await import("../src/mcp/server");
    const manifest = JSON.parse(readFileSync("server.json", "utf8")) as { name: string; description: string; version: string; remotes: { type: string; url: string }[] };
    expect(manifest.name).toMatch(/^io\.github\.MISHHF93\//);
    expect(manifest.description.length).toBeLessThanOrEqual(100);
    expect(manifest.version).toBe(SERVER_VERSION);
    expect(manifest.remotes).toEqual([{ type: "streamable-http", url: "https://atlas-explain-mcp.atlas-explain.workers.dev/mcp" }]);
  });
});

describe("the server's own icons", () => {
  it("serves a real PNG favicon and icon, and the SVG, from its own address", async () => {
    const { handleHttp } = await import("../src/mcp/http");
    const { ICONS, MCP_ORIGIN } = await import("../src/mcp/server");
    const never: Fetcher = async () => { throw new Error("no network"); };
    const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (const [path, type] of [["/favicon.ico", "image/png"], ["/icon.png", "image/png"], ["/icon.svg", "image/svg+xml"]] as const) {
      const res = await handleHttp(new Request(`${MCP_ORIGIN}${path}`), never);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("Content-Type"), path).toBe(type);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (type === "image/png") expect([...bytes.slice(0, 8)], path).toEqual(PNG);
      else expect(new TextDecoder().decode(bytes), path).toMatch(/^<svg/);
    }
    // Every icon the server announces is one it serves itself.
    for (const icon of ICONS) expect(icon.src.startsWith(`${MCP_ORIGIN}/`)).toBe(true);
  });
});

describe("every tool answers in structured form too", () => {
  it("declares an output schema, and the glossary tools return structured terms", async () => {
    const { TOOLS: all, explainTerm: explain, browseGlossary: browse } = await import("../src/mcp/server");
    expect(all.filter((t) => !t.outputSchema).map((t) => t.name)).toEqual([]);
    const hit = explain("inflation").structuredContent as { found: boolean; terms: { id: string; group: string }[] };
    expect(hit.found).toBe(true);
    expect(hit.terms[0]).toMatchObject({ id: "inflation", group: "economy" });
    expect((explain("zzzz").structuredContent as { found: boolean }).found).toBe(false);
    const path = browse(undefined).structuredContent as { steps: { id: string; terms: unknown[] }[]; totalTerms: number; groups: { id: string; count: number }[] };
    expect(path.steps.length).toBeGreaterThan(5);
    expect(path.totalTerms).toBe(path.groups.reduce((n, g) => n + g.count, 0));
    expect((browse("economy").structuredContent as { topic: string }).topic).toBe("economy");
  });
});

describe("evidence brief periods", () => {
  it("keeps a filing's whole period, not its first ten characters (seen live as 'year to 26')", async () => {
    const onlyMarket: Fetcher = async (url) =>
      url.endsWith("/data/v1/market.json") ? new Response(JSON.stringify(market), { status: 200 }) : new Response("none", { status: 404 });
    const t = body(await evidenceBrief("AAPL", onlyMarket));
    expect(t).toContain("Revenue: $478.8 billion (year to 26 Sept 2026)");
  });
});

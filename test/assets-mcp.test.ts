import { describe, expect, it } from "vitest";
import { loadCatalog, readMcpCatalog, type Fetcher } from "../src/core/assets";
import { MCP_ASSETS_SCHEMA, MCP_PATH, callMcp, mcpLight } from "../src/core/atlas-mcp";

const NOW = Date.parse("2026-11-13T14:30:00Z");
const MCP_LIST = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    tools: [
      { name: "list_assets", annotations: { readOnlyHint: true } },
      { name: "get_signal_light", annotations: { readOnlyHint: true } },
    ],
  },
};
const MCP_ASSETS = {
  jsonrpc: "2.0",
  id: 1,
  result: {
    content: [{ type: "text", text: "{}" }],
    structuredContent: {
      schema: MCP_ASSETS_SCHEMA,
      v: 1,
      paperOnly: true,
      executionPermission: "none",
      available: true,
      asOf: "2026-11-13T14:29:00Z",
      assets: [
        {
          symbol: "BTCUSDT",
          name: "Bitcoin",
          class: "crypto",
          source: { label: "Kraken spot" },
          quote: { price: 68563.2, changePct: -1.2, asOf: "2026-11-13T14:29:00Z", status: "ok", freshnessLabel: "Live from Kraken (24/7)" },
          light: { signal: "not_enough_evidence", colour: "grey", why: "Not enough evidence. The light stays grey.", sampleSize: 12, hitRate: 0.5, horizon: "1h", horizonLabel: "Next hour" },
        },
      ],
    },
    isError: false,
  },
};

const restCatalog = {
  schema: "atlas-explain-assets-v1",
  paperOnly: true,
  asOf: "2026-11-13T14:29:00Z",
  assets: [
    {
      symbol: "ETH-USD",
      name: "Ether",
      class: "crypto",
      source: { label: "Kraken spot" },
      quote: { price: 3200, changePct: 1, asOf: "2026-11-13T14:29:00Z", status: "ok", freshnessLabel: "Live from Kraken (24/7)" },
      light: { lean: "none", colour: "grey", reason: "Not enough evidence. The light stays grey.", sampleSize: 0, hitRate: null, horizon: "1h", horizonLabel: "Next hour" },
    },
  ],
  missing: [],
  gate: { reason: "" },
  sources: { stock: { citation: null } },
};

function rpcFetcher(routes: Record<string, (init: { method?: string; body?: string }) => unknown>): Fetcher {
  return async (url, init) => {
    const path = url.replace("http://localhost:3000", "");
    const handler = routes[path];
    if (!handler) return new Response("{}", { status: 500 });
    const body = handler(init);
    if (body === "down") throw new TypeError("Failed to fetch");
    if (typeof body === "number") return new Response("{}", { status: body });
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

describe("MCP catalog mapping", () => {
  it("maps list_assets onto the same catalog view and keeps a thin light grey", () => {
    const cat = readMcpCatalog(MCP_ASSETS.result.structuredContent, NOW);
    expect(cat).not.toBeNull();
    expect(cat!.assets).toHaveLength(1);
    expect(cat!.assets[0]).toMatchObject({ symbol: "BTCUSDT", klass: "crypto", sourceLabel: "Kraken spot", badge: "Live" });
    expect(cat!.assets[0]!.light).toMatchObject({ lean: "none", colour: "grey", label: "Not enough evidence" });
    expect(mcpLight({ signal: "up", colour: "green", why: "Model leans up on the paper shadow log over the next hour. Every gate passed.", sampleSize: 240, hitRate: 0.6 })).toMatchObject({ lean: "up", colour: "green" });
  });

  it("refuses a non-MCP schema, a non-paper payload, and account-shaped keys", () => {
    expect(readMcpCatalog({ ...MCP_ASSETS.result.structuredContent, schema: "atlas-explain-assets-v1" }, NOW)).toBeNull();
    expect(readMcpCatalog({ ...MCP_ASSETS.result.structuredContent, paperOnly: false }, NOW)).toBeNull();
    expect(readMcpCatalog({ ...MCP_ASSETS.result.structuredContent, executionPermission: "paper" }, NOW)).toBeNull();
    expect(readMcpCatalog({ ...MCP_ASSETS.result.structuredContent, balance: 10 }, NOW)).toBeNull();
  });
});

describe("loadCatalog prefers MCP and falls back to REST", () => {
  it("uses the MCP catalog when the public tools answer", async () => {
    const seen: string[] = [];
    const fetcher: Fetcher = async (url, init) => {
      seen.push(`${init.method ?? "GET"} ${url}`);
      const method = JSON.parse(init.body ?? "{}").method;
      const body = method === "tools/list" ? MCP_LIST : MCP_ASSETS;
      return new Response(JSON.stringify(body), { status: 200 });
    };
    const state = await loadCatalog(fetcher, NOW);
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.catalog.assets.map((a) => a.symbol)).toEqual(["BTCUSDT"]);
    expect(seen.every((s) => s.startsWith("POST http://localhost:3000" + MCP_PATH))).toBe(true);
    expect(seen.some((s) => s.includes("/api/explain/assets"))).toBe(false);
  });

  it("falls back to REST when the MCP route is missing so a mid-cycle break cannot strand the list", async () => {
    const seen: string[] = [];
    const fetcher = rpcFetcher({
      [MCP_PATH]: () => 404,
      "/api/explain/assets": () => restCatalog,
    });
    const wrapped: Fetcher = async (url, init) => {
      seen.push(`${init.method ?? "GET"} ${url}`);
      return fetcher(url, init);
    };
    const state = await loadCatalog(wrapped, NOW);
    expect(state.kind).toBe("ready");
    if (state.kind !== "ready") return;
    expect(state.catalog.assets.map((a) => a.symbol)).toEqual(["ETH-USD"]);
    expect(seen[0]).toBe("POST http://localhost:3000/api/mcp/public");
    expect(seen).toContain("GET http://localhost:3000/api/explain/assets");
  });

  it("falls back to REST when MCP is mid-protocol and still shows the connect card when both are down", async () => {
    const broken = rpcFetcher({
      [MCP_PATH]: () => ({ jsonrpc: "1.0", result: {} }),
      "/api/explain/assets": () => restCatalog,
    });
    const state = await loadCatalog(broken, NOW);
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") expect(state.catalog.assets[0]!.symbol).toBe("ETH-USD");

    const down: Fetcher = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await loadCatalog(down)).toMatchObject({ kind: "not_connected" });
  });

  it("does not use a tools/list that advertises an order tool", async () => {
    const fetcher: Fetcher = async (url, init) => {
      if (url.endsWith(MCP_PATH)) {
        const method = JSON.parse(init.body ?? "{}").method;
        if (method === "tools/list") {
          return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "list_assets" }, { name: "place_order" }] } }), { status: 200 });
        }
      }
      return new Response(JSON.stringify(restCatalog), { status: 200 });
    };
    const state = await loadCatalog(fetcher, NOW);
    expect(state.kind).toBe("ready");
    if (state.kind === "ready") expect(state.catalog.assets[0]!.symbol).toBe("ETH-USD");
  });

  it("drops an MCP payload that carries account fields instead of passing it through", async () => {
    const fetcher: Fetcher = async (url, init) => {
      if (url.endsWith(MCP_PATH)) {
        const method = JSON.parse(init.body ?? "{}").method;
        if (method === "tools/list") return new Response(JSON.stringify(MCP_LIST), { status: 200 });
        const dirty = structuredClone(MCP_ASSETS);
        (dirty.result.structuredContent as { account?: unknown }).account = { id: "U1" };
        return new Response(JSON.stringify(dirty), { status: 200 });
      }
      return new Response(JSON.stringify(restCatalog), { status: 200 });
    };
    expect(await loadCatalog(fetcher, NOW)).toMatchObject({ kind: "error", reason: expect.stringMatching(/never reads/) });
  });
});

describe("callMcp", () => {
  it("does not send cookies and reports a missing route honestly", async () => {
    const seen: { credentials: RequestCredentials; method?: string }[] = [];
    const fetcher: Fetcher = async (_url, init) => {
      seen.push({ credentials: init.credentials, method: init.method });
      return new Response("{}", { status: 404 });
    };
    const out = await callMcp("tools/list", {}, fetcher);
    expect(out).toEqual({ ok: false, reason: "This ATLAS build has no public MCP route yet.", reachable: true });
    expect(seen[0]).toEqual({ credentials: "omit", method: "POST" });
  });
});

import { describe, expect, it } from "vitest";
import { HOSTED_REASON, listConnectors, mayCallLocalAtlas, probeAtlasLocal } from "../src/connectors";

describe("Explain connectors registry", () => {
  it("lists the local MCP connector and the REST fallback, both loopback", () => {
    const ids = listConnectors().map((c) => c.id);
    expect(ids).toEqual(["atlas-local-mcp", "atlas-local-rest"]);
    for (const c of listConnectors()) {
      expect(c.transport).toBe("loopback");
      expect(c.note.toLowerCase()).not.toMatch(/\bbalance\b|\bsecret\b/);
    }
  });

  it("lets the extension and loopback pages call ATLAS, and refuses the hosted app", () => {
    expect(mayCallLocalAtlas({ protocol: "https:", hostname: "atlas-explain.web.app" }, false)).toBe(false);
    expect(mayCallLocalAtlas({ protocol: "http:", hostname: "localhost" }, false)).toBe(true);
    expect(mayCallLocalAtlas({ protocol: "https:", hostname: "atlas-explain.web.app" }, true)).toBe(true);
  });

  it("does not fetch when the page is hosted, and reports an honest state", async () => {
    const calls: string[] = [];
    const link = await probeAtlasLocal({
      allowed: false,
      fetcher: async (url) => {
        calls.push(url);
        throw new Error("hosted pages must not fetch localhost");
      },
    });
    expect(link.state).toBe("hosted");
    expect(link.reason).toBe(HOSTED_REASON);
    expect(calls).toEqual([]);
  });

  it("reports local when the public MCP answers, without a secret in the payload", async () => {
    const link = await probeAtlasLocal({
      allowed: true,
      fetcher: async () =>
        new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2024-11-05", capabilities: {}, serverInfo: { name: "atlas-public" } } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    });
    expect(link.state).toBe("local");
    expect(link.via).toBe("mcp");
    expect(JSON.stringify(link)).not.toMatch(/api_key|access_token|password/i);
  });

  it("falls back to REST when MCP is missing and the catalog answers", async () => {
    const link = await probeAtlasLocal({
      allowed: true,
      fetcher: async (url) => {
        if (url.includes("/api/mcp/public")) {
          return new Response("not found", { status: 404 });
        }
        return new Response(JSON.stringify({ schema: "atlas-explain-assets-v1", paperOnly: true, executionPermission: "none", assets: [] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    expect(link.state).toBe("local");
    expect(link.via).toBe("rest");
  });

  it("stays not connected when localhost does not answer", async () => {
    const link = await probeAtlasLocal({
      allowed: true,
      fetcher: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(link.state).toBe("none");
    expect(link.via).toBeNull();
  });
});

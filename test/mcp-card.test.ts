import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { handleHttp, REGISTRY_NAME } from "../src/mcp/http";
import { MCP_ORIGIN, PROMPTS, SERVER_VERSION, TOOLS, type Fetcher } from "../src/mcp/server";

const never: Fetcher = async () => {
  throw new Error("no network");
};

describe("discovery without connecting", () => {
  it("serves the same server card at each path the drafts use, built from the live tools and prompts", async () => {
    const manifest = JSON.parse(readFileSync("server.json", "utf8")) as { name: string; version: string };
    for (const path of ["/.well-known/mcp/server-card.json", "/.well-known/mcp.json", "/mcp/server-card"]) {
      const res = await handleHttp(new Request(`${MCP_ORIGIN}${path}`), never);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json");
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      const card = (await res.json()) as { name: string; version: string; remotes: { url: string }[]; authentication: { required: boolean }; tools: { name: string }[]; prompts: { name: string }[] };
      expect(card.name).toBe(manifest.name);
      expect(card.name).toBe(REGISTRY_NAME);
      expect(card.version).toBe(SERVER_VERSION);
      expect(card.remotes).toEqual([{ type: "streamable-http", url: `${MCP_ORIGIN}/mcp` }]);
      expect(card.authentication.required).toBe(false);
      expect(card.tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
      expect(card.prompts.map((p) => p.name)).toEqual(PROMPTS.map((p) => p.name));
    }
  });

  it("answers a health check without touching any data source", async () => {
    const res = await handleHttp(new Request(`${MCP_ORIGIN}/health`), never);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, name: "atlas-explain", version: SERVER_VERSION });
  });

  it("lists every tool on the plain-text page at the root", async () => {
    const text = await (await handleHttp(new Request(`${MCP_ORIGIN}/`), never)).text();
    for (const t of TOOLS) expect(text).toContain(t.name);
  });
});

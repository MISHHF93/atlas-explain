import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { EDUCATION_LINE, TOOLS, explainTerm, handle, todaysHeadlines, type Fetcher } from "../src/mcp/server";

const reply = (body: unknown, ok = true): Fetcher => async () => ({ ok, json: async () => body });
const never: Fetcher = async () => {
  throw new Error("no network in this test");
};

describe("ATLAS Explain MCP server", () => {
  it("answers initialize with a supported protocol version and its three read-only tools", async () => {
    const init = await handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, never);
    expect(init?.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "atlas-explain" } });
    const old = await handle({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } }, never);
    expect((old?.result as { protocolVersion: string }).protocolVersion).toBe("2025-06-18");
    expect(TOOLS.map((t) => t.name)).toEqual(["explain_term", "official_figures", "todays_headlines"]);
    expect(TOOLS.every((t) => t.annotations.readOnlyHint)).toBe(true);
  });

  it("never answers a notification, and rejects unknown methods and tools", async () => {
    expect(await handle({ jsonrpc: "2.0", method: "notifications/initialized" }, never)).toBeNull();
    expect((await handle({ jsonrpc: "2.0", id: 3, method: "nope" }, never))?.error?.code).toBe(-32601);
    expect((await handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "trade" } }, never))?.error?.code).toBe(-32602);
  });

  it("explains a glossary term, says so when a term is missing, and always ends with the education line", () => {
    const hit = explainTerm("spread").content[0]!.text;
    expect(hit).toContain("Bid-ask spread");
    expect(hit.endsWith(EDUCATION_LINE)).toBe(true);
    expect(explainTerm("zzzz-not-a-term").content[0]!.text).toContain("is not in the ATLAS Explain glossary");
  });

  it("never returns stale headlines, and reports a failed download as an error, not as an empty result", async () => {
    const stale = { schema: "atlas-explain-news-v1", generatedAt: "2026-11-01T00:00:00Z", items: { "crypto:BTC": [{ title: "Old", url: "https://a.example/1", domain: "a.example", seenAt: "2026-11-01T00:00:00Z" }] } };
    const result = await todaysHeadlines(undefined, reply(stale), Date.parse("2026-11-20T00:00:00Z"));
    expect(result.content[0]!.text).toContain("No headline is recent enough");
    const down = await todaysHeadlines(undefined, reply(null, false));
    expect(down.isError).toBe(true);
  });

  it("is built into one dependency-free file and documented", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["build:mcp"]).toBe("vite build --config vite.mcp.config.ts");
    expect(readFileSync("vite.mcp.config.ts", "utf8")).toContain("publicDir: false");
    expect(existsSync("docs/MCP.md")).toBe(true);
    // The server only reads ATLAS Explain's own public data files.
    const src = readFileSync("src/mcp/server.ts", "utf8");
    expect(src).not.toMatch(/firebase|generateContent|apiKey/i);
  });
});

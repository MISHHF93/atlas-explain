import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHROME_STORE_URL, MCP_URL } from "../src/core/links";
import { handleHttp, MCP_PATH } from "../src/mcp/http";
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
    expect((old?.result as { protocolVersion: string }).protocolVersion).toBe("2025-11-25");
    const current = await handle({ jsonrpc: "2.0", id: 5, method: "initialize", params: { protocolVersion: "2025-11-25" } }, never);
    expect((current?.result as { protocolVersion: string }).protocolVersion).toBe("2025-11-25");
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

  it("is hosted online, never downloaded, and documented", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
    expect(pkg.scripts["build:mcp"]).toBe("vite build --config vite.mcp.config.ts");
    expect(pkg.scripts["deploy:mcp"]).toBe("npx wrangler@4 deploy");
    expect(readFileSync("wrangler.toml", "utf8")).toContain('main = "src/mcp/worker.ts"');
    expect(existsSync("mcp/atlas-explain-mcp.mjs")).toBe(false);
    expect(existsSync("docs/MCP.md")).toBe(true);
    // The server only reads ATLAS Explain's own public data files, and never touches Node or stdio.
    for (const file of ["src/mcp/server.ts", "src/mcp/http.ts", "src/mcp/worker.ts"]) {
      expect(readFileSync(file, "utf8")).not.toMatch(/firebase|generateContent|apiKey|process\.|node:/i);
    }
  });
});

describe("hosted MCP over HTTP", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) =>
    new Request(`https://mcp.example${MCP_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("answers a request with JSON and a notification with 202 and no body", async () => {
    const res = await handleHttp(post({ jsonrpc: "2.0", id: 1, method: "tools/list" }), never);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const body = (await res.json()) as { result: { tools: { name: string }[] } };
    expect(body.result.tools).toHaveLength(3);
    const note = await handleHttp(post({ jsonrpc: "2.0", method: "notifications/initialized" }), never);
    expect(note.status).toBe(202);
    expect(await note.text()).toBe("");
  });

  it("runs a tool end to end", async () => {
    const res = await handleHttp(post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "explain_term", arguments: { term: "spread" } } }), never);
    const body = (await res.json()) as { result: { content: { text: string }[] } };
    expect(body.result.content[0]!.text).toContain("Bid-ask spread");
  });

  it("rejects what it does not support, plainly", async () => {
    expect((await handleHttp(new Request(`https://mcp.example${MCP_PATH}`), never)).status).toBe(405);
    expect((await handleHttp(post("{not json"), never)).status).toBe(400);
    expect((await handleHttp(post([{ jsonrpc: "2.0", id: 1, method: "ping" }]), never)).status).toBe(400);
    expect((await handleHttp(post({ jsonrpc: "2.0", id: 1, method: "ping" }, { "MCP-Protocol-Version": "not-a-version" }), never)).status).toBe(400);
    // A newer or unknown well-formed version is still answered: a 400 sent Claude into a sign-in this server lacks.
    for (const v of ["2025-11-25", "2030-01-01"]) {
      expect((await handleHttp(post({ jsonrpc: "2.0", id: 1, method: "ping" }, { "MCP-Protocol-Version": v }), never)).status).toBe(200);
    }
    expect((await handleHttp(post("x".repeat(70_000)), never)).status).toBe(413);
    expect((await handleHttp(new Request("https://mcp.example/other"), never)).status).toBe(404);
    expect((await handleHttp(new Request(`https://mcp.example${MCP_PATH}`, { method: "OPTIONS" }), never)).status).toBe(204);
  });

  it("explains itself at the root address, with the education line", async () => {
    const text = await (await handleHttp(new Request("https://mcp.example/"), never)).text();
    expect(text).toContain(`https://mcp.example${MCP_PATH}`);
    expect(text).toContain(EDUCATION_LINE);
  });
});

describe("online-only links", () => {
  it("shows coming-soon text until the owner sets each address, and never a dead link", () => {
    expect(CHROME_STORE_URL === null || CHROME_STORE_URL.startsWith("https://chromewebstore.google.com/")).toBe(true);
    expect(MCP_URL === null || /^https:\/\/.+\/mcp$/.test(MCP_URL)).toBe(true);
    const support = readFileSync("support.html", "utf8");
    expect(support).toContain('id="ai-assistants"');
    expect(support).toMatch(/<div data-when-mcp hidden>[\s\S]*data-mcp-url/);
    expect(readFileSync("src/site/site.ts", "utf8")).toContain('switchOn("data-when-mcp", "data-before-mcp", MCP_URL, "data-mcp-url")');
  });
});

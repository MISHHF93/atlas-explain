import { describe, expect, it } from "vitest";
import { handleHttp, originAllowed } from "../src/mcp/http";
import { ALL_PROTOCOLS, EDUCATION_LINE, MCP_ORIGIN, SERVER_VERSION, type Fetcher } from "../src/mcp/server";

const never: Fetcher = async () => {
  throw new Error("no network");
};
const URL_ = `${MCP_ORIGIN}/mcp`;
const META = (v = "2026-07-28") => ({
  "io.modelcontextprotocol/protocolVersion": v,
  "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
  "io.modelcontextprotocol/clientCapabilities": {},
});
/** A modern (2026-07-28) request, with the mirrored headers a conforming client sends. */
function modern(method: string, params: Record<string, unknown> = {}, opts: { version?: string; headers?: Record<string, string>; meta?: Record<string, unknown> } = {}) {
  const v = opts.version ?? "2026-07-28";
  const name = method === "tools/call" || method === "prompts/get" ? params.name : method === "resources/read" ? params.uri : undefined;
  return new Request(URL_, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": v,
      "Mcp-Method": method,
      ...(name !== undefined ? { "Mcp-Name": String(name) } : {}),
      ...opts.headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: { ...params, _meta: opts.meta ?? META(v) } }),
  });
}
type Body = { result?: Record<string, unknown>; error?: { code: number; message: string; data?: Record<string, unknown> } };
const send = async (req: Request) => {
  const res = await handleHttp(req, never);
  return { status: res.status, body: (await res.json()) as Body };
};

describe("MCP 2026-07-28 (stateless, no handshake), alongside earlier versions", () => {
  it("answers server/discover with versions, capabilities, identity, instructions and caching hints", async () => {
    const { status, body } = await send(modern("server/discover"));
    expect(status).toBe(200);
    const r = body.result!;
    expect(r.resultType).toBe("complete");
    expect(r.supportedVersions).toEqual(ALL_PROTOCOLS);
    expect(Object.keys(r.capabilities as object)).toEqual(expect.arrayContaining(["tools", "resources", "prompts", "completions", "extensions"]));
    expect((r._meta as Record<string, { version: string }>)["io.modelcontextprotocol/serverInfo"]!.version).toBe(SERVER_VERSION);
    expect(r).toMatchObject({ ttlMs: 3_600_000, cacheScope: "public" });
    expect(String(r.instructions)).toMatch(/Education only/);
  });

  it("serves tools without any initialize, marks every result complete, and caches lists", async () => {
    const list = await send(modern("tools/list"));
    expect(list.body.result).toMatchObject({ resultType: "complete", ttlMs: 3_600_000, cacheScope: "public" });
    expect((list.body.result!.tools as unknown[]).length).toBe(7);
    const call = await send(modern("tools/call", { name: "explain_term", arguments: { term: "spread" } }));
    expect(call.body.result).toMatchObject({ resultType: "complete" });
    expect((call.body.result!.content as { text: string }[])[0]!.text.endsWith(EDUCATION_LINE)).toBe(true);
  });

  it("rejects an unsupported version with -32022 and the versions it does support", async () => {
    const { status, body } = await send(modern("tools/list", {}, { version: "2031-01-01" }));
    expect(status).toBe(400);
    expect(body.error).toMatchObject({ code: -32022, data: { supported: ALL_PROTOCOLS, requested: "2031-01-01" } });
  });

  it("rejects a request missing client capabilities with -32602", async () => {
    const meta = { "io.modelcontextprotocol/protocolVersion": "2026-07-28" };
    const { status, body } = await send(modern("tools/list", {}, { meta }));
    expect(status).toBe(400);
    expect(body.error!.code).toBe(-32602);
  });

  it("checks the mirrored headers against the body (-32020), and decodes Base64 names", async () => {
    const wrong: Record<string, string>[] = [{ "Mcp-Method": "tools/list" }, { "MCP-Protocol-Version": "2025-11-25" }, { "Mcp-Name": "official_figures" }];
    for (const headers of wrong) {
      const { status, body } = await send(modern("tools/call", { name: "explain_term", arguments: { term: "spread" } }, { headers }));
      expect(status, JSON.stringify(headers)).toBe(400);
      expect(body.error!.code).toBe(-32020);
    }
    const encoded = `=?base64?${btoa("ui://atlas-explain/price-chart.html")}?=`;
    const ok = await send(modern("resources/read", { uri: "ui://atlas-explain/price-chart.html" }, { headers: { "Mcp-Name": encoded } }));
    expect(ok.status).toBe(200);
  });

  it("answers an unknown method with HTTP 404 and -32601, and a missing resource with -32602", async () => {
    const unknown = await send(modern("nothing/here"));
    expect(unknown.status).toBe(404);
    expect(unknown.body.error!.code).toBe(-32601);
    const missing = await send(modern("resources/read", { uri: "atlas-explain://glossary/not-a-term" }));
    expect(missing.body.error!.code).toBe(-32602);
  });

  it("still serves earlier clients: initialize, ping, and -32002 for a missing resource", async () => {
    const legacy = async (method: string, params: Record<string, unknown> = {}) => {
      const res = await handleHttp(new Request(URL_, { method: "POST", headers: { "Content-Type": "application/json", "MCP-Protocol-Version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), never);
      return (await res.json()) as Body;
    };
    expect((await legacy("initialize", { protocolVersion: "2025-11-25" })).result).toMatchObject({ protocolVersion: "2025-11-25" });
    expect((await legacy("ping")).result).toBeTruthy();
    expect((await legacy("resources/read", { uri: "atlas-explain://glossary/not-a-term" })).error!.code).toBe(-32002);
  });

  it("lists the glossary as resources with a template, reads a term, and completes term names", async () => {
    const list = await send(modern("resources/list"));
    const uris = (list.body.result!.resources as { uri: string }[]).map((r) => r.uri);
    expect(uris).toEqual(expect.arrayContaining(["atlas-explain://learning-path", "atlas-explain://glossary/stop_limit"]));
    const tpl = await send(modern("resources/templates/list"));
    expect((tpl.body.result!.resourceTemplates as { uriTemplate: string }[])[0]!.uriTemplate).toBe("atlas-explain://glossary/{term}");
    const read = await send(modern("resources/read", { uri: "atlas-explain://glossary/stop_limit" }));
    const doc = (read.body.result!.contents as { text: string; mimeType: string }[])[0]!;
    expect(doc.mimeType).toBe("text/markdown");
    expect(doc.text).toMatch(/^# Stop-limit order/);
    expect(doc.text.endsWith(EDUCATION_LINE)).toBe(true);
    const done = await send(modern("completion/complete", { ref: { type: "ref/resource", uri: "atlas-explain://glossary/{term}" }, argument: { name: "term", value: "stop" } }));
    expect((done.body.result!.completion as { values: string[] }).values).toContain("stop_limit");
  });

  it("refuses plain-http pages that are not this computer (DNS rebinding), and allows https and apps", async () => {
    expect(originAllowed("http://evil.example")).toBe(false);
    for (const o of [null, "null", "https://claude.ai", "http://localhost:6274", "http://127.0.0.1:3000"]) expect(originAllowed(o), String(o)).toBe(true);
    const res = await handleHttp(new Request(URL_, { method: "POST", headers: { Origin: "http://evil.example", "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) }), never);
    expect(res.status).toBe(403);
  });
});

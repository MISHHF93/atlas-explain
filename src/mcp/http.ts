/**
 * The ATLAS Explain MCP server over HTTP (MCP "Streamable HTTP" transport), so AI assistants
 * connect with a web address instead of a download. Stateless and read-only: every POST
 * carries one JSON-RPC message and gets one JSON answer; there is no session and no stream.
 * Hosted on Cloudflare Workers' free plan (src/mcp/worker.ts); see docs/MCP.md.
 */
import { EDUCATION_LINE, handle, SUPPORTED_PROTOCOLS, type Fetcher } from "./server";

export const MCP_PATH = "/mcp";
const MAX_BODY_BYTES = 64 * 1024;

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
  "Access-Control-Max-Age": "86400",
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const rpcError = (code: number, message: string, status: number): Response =>
  json({ jsonrpc: "2.0", id: null, error: { code, message } }, status);

const ABOUT = [
  "ATLAS Explain MCP server",
  "",
  `Add this address to an AI assistant that supports MCP connectors: <this host>${MCP_PATH}`,
  "Tools: explain_term, official_figures, todays_headlines. Read-only, free, no sign-in.",
  "Setup: https://atlas-explain.web.app/support#ai-assistants",
  "",
  EDUCATION_LINE,
].join("\n");

export async function handleHttp(request: Request, fetcher: Fetcher): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

  if (url.pathname !== MCP_PATH) {
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(ABOUT.replace("<this host>", url.origin), { headers: { ...CORS, "Content-Type": "text/plain; charset=utf-8" } });
    }
    return new Response("Not found", { status: 404, headers: CORS });
  }

  // No server-to-client stream is offered, so GET (and DELETE of a session) is not allowed.
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });

  const version = request.headers.get("MCP-Protocol-Version");
  if (version && !(SUPPORTED_PROTOCOLS as readonly string[]).includes(version)) {
    return rpcError(-32600, `Unsupported MCP-Protocol-Version: ${version}`, 400);
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return rpcError(-32600, "Request too large", 413);
  let message: unknown;
  try {
    message = JSON.parse(raw);
  } catch {
    return rpcError(-32700, "Parse error", 400);
  }
  if (Array.isArray(message) || typeof message !== "object" || message === null) {
    return rpcError(-32600, "Send one JSON-RPC message per request", 400);
  }

  const reply = await handle(message as Parameters<typeof handle>[0], fetcher);
  // Notifications and responses from the client get 202 with no body.
  return reply ? json(reply) : new Response(null, { status: 202, headers: CORS });
}

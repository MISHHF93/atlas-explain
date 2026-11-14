/**
 * Local ATLAS public MCP JSON-RPC client.
 *
 * POST http://localhost:3000/api/mcp/public — same host permission as the REST catalog.
 * Education only: never sends cookies. The hosted web app must not call this.
 */
import { ATLAS_ORIGIN } from "./atlas-origin";

export const MCP_PATH = "/api/mcp/public";
export const MCP_ASSETS_SCHEMA = "atlas-mcp-assets-v1";
export const MCP_SCOPE = "atlas.public";

export type Fetcher = (
  url: string,
  init: {
    method?: string;
    signal: AbortSignal;
    cache: RequestCache;
    credentials: RequestCredentials;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<Response>;

type Rec = Record<string, unknown>;
const isRec = (v: unknown): v is Rec => !!v && typeof v === "object" && !Array.isArray(v);

export type RpcResult =
  | { ok: true; result: unknown }
  | { ok: false; reason: string; reachable: boolean };

/** One JSON-RPC call to the loopback public MCP endpoint. Never sends cookies. */
export async function callMcp(
  method: string,
  params: Rec | undefined,
  fetcher: Fetcher,
  timeoutMs = 6000,
  privateFields: (value: unknown) => boolean = () => false,
): Promise<RpcResult> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetcher(`${ATLAS_ORIGIN}${MCP_PATH}`, {
      method: "POST",
      signal: ctl.signal,
      cache: "no-store",
      credentials: "omit",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: params ?? {} }),
    });
    if (!res.ok) {
      const reason =
        res.status === 404
          ? "This ATLAS build has no public MCP route yet."
          : res.status === 403 || res.status === 401
            ? "ATLAS only answers Explain on this computer."
            : `ATLAS MCP answered ${res.status}.`;
      return { ok: false, reason, reachable: true };
    }
    const body: unknown = await res.json();
    if (privateFields(body)) {
      return { ok: false, reason: "ATLAS sent fields Explain never reads, so the answer was dropped.", reachable: true };
    }
    if (!isRec(body) || body.jsonrpc !== "2.0") {
      return { ok: false, reason: "ATLAS MCP sent a response Explain does not recognise.", reachable: true };
    }
    if (isRec(body.error)) {
      return { ok: false, reason: "ATLAS MCP could not complete that call.", reachable: true };
    }
    return { ok: true, result: body.result };
  } catch {
    return { ok: false, reason: "ATLAS isn't running on this computer.", reachable: false };
  } finally {
    clearTimeout(timer);
  }
}

export function structuredContent(result: unknown): unknown {
  return isRec(result) && "structuredContent" in result ? result.structuredContent : result;
}

export function mcpToolNames(result: unknown): string[] {
  const tools = isRec(result) && Array.isArray(result.tools) ? result.tools : [];
  return tools.map((t) => (isRec(t) ? String(t.name) : ""));
}

export function mcpLight(raw: unknown): Rec {
  const r = isRec(raw) ? raw : {};
  const signal = r.signal === "up" || r.signal === "down" ? r.signal : "none";
  const colour = signal === "up" ? "green" : signal === "down" ? "red" : "grey";
  const reason = typeof r.why === "string" ? r.why : typeof r.reason === "string" ? r.reason : undefined;
  return { ...r, lean: signal === "none" ? "none" : signal, colour: r.colour ?? colour, reason };
}

export function adaptMcpAsset(raw: unknown): unknown {
  if (!isRec(raw)) return raw;
  const light = mcpLight(raw.light);
  const leans = Array.isArray(raw.leans) ? raw.leans.map(mcpLight) : [light];
  return { ...raw, light, leans };
}

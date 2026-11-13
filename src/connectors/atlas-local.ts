/**
 * Local ATLAS connector: public MCP first, REST catalog fallback.
 * The hosted web app must never call this. Education only; no cookies, no secrets.
 */
import { callMcp } from "../core/atlas-mcp";
import { ASSETS_PATH, canReachLocalAtlas, carriesPrivateFields, readAtlas, type Fetcher } from "../core/assets";
import type { AtlasLink, ConnectorProbe } from "./types";

export const HOSTED_REASON =
  "This web app never calls localhost. Install the ATLAS Explain extension and run ATLAS on this computer to connect.";

export const LOCAL_UNREACHABLE = "ATLAS is not answering at localhost:3000.";

export function mayCallLocalAtlas(loc: { protocol: string; hostname: string }, isExtension: boolean): boolean {
  return canReachLocalAtlas(loc, isExtension);
}

async function probeMcp(fetcher: Fetcher): Promise<ConnectorProbe> {
  const result = await callMcp("initialize", { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "atlas-explain", version: "connectors" } }, fetcher, 6000, carriesPrivateFields);
  return {
    id: "atlas-local-mcp",
    name: "ATLAS local MCP",
    ok: result.ok,
    reachable: result.ok || result.reachable,
    reason: result.ok ? "Public MCP at /api/mcp/public answered." : result.reason,
  };
}

async function probeRest(fetcher: Fetcher): Promise<ConnectorProbe> {
  const result = await readAtlas(ASSETS_PATH, fetcher);
  return {
    id: "atlas-local-rest",
    name: "ATLAS local REST",
    ok: result.ok,
    reachable: result.ok || result.reachable,
    reason: result.ok ? "REST catalog at /api/explain/assets answered." : result.reason,
  };
}

/** Probe local ATLAS. Never called when the page is the hosted web app. */
export async function probeAtlasLocal(options: {
  allowed: boolean;
  fetcher?: Fetcher;
}): Promise<AtlasLink> {
  if (!options.allowed) {
    return { state: "hosted", via: null, reason: HOSTED_REASON, probes: [] };
  }
  const fetcher = options.fetcher ?? fetch;
  const mcp = await probeMcp(fetcher);
  if (mcp.ok) {
    return { state: "local", via: "mcp", reason: mcp.reason, probes: [mcp] };
  }
  const rest = await probeRest(fetcher);
  const probes = [mcp, rest];
  if (rest.ok) {
    return { state: "local", via: "rest", reason: rest.reason, probes };
  }
  const reason = rest.reachable || mcp.reachable ? rest.reason : LOCAL_UNREACHABLE;
  return { state: "none", via: null, reason, probes };
}

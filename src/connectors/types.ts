/** Read-only connector shapes for ATLAS Explain. No secrets, no account fields. */

export type ConnectorId = "atlas-local-mcp" | "atlas-local-rest";

export type ConnectorProbe = {
  id: ConnectorId;
  name: string;
  ok: boolean;
  reachable: boolean;
  reason: string;
};

export type AtlasLink =
  | { state: "local"; via: "mcp" | "rest"; reason: string; probes: ConnectorProbe[] }
  | { state: "none"; via: null; reason: string; probes: ConnectorProbe[] }
  | { state: "hosted"; via: null; reason: string; probes: ConnectorProbe[] };

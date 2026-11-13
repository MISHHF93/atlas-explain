/** Explain's read-only connector registry. Local ATLAS is the only entry today. */
import { mayCallLocalAtlas, probeAtlasLocal } from "./atlas-local";
import type { AtlasLink, ConnectorId } from "./types";

export type ConnectorListing = {
  id: ConnectorId;
  name: string;
  kind: "mcp" | "rest";
  transport: "loopback";
  note: string;
};

export const CONNECTORS: readonly ConnectorListing[] = [
  {
    id: "atlas-local-mcp",
    name: "ATLAS local MCP",
    kind: "mcp",
    transport: "loopback",
    note: "POST http://localhost:3000/api/mcp/public. Read-only public tools. The hosted web app never calls it.",
  },
  {
    id: "atlas-local-rest",
    name: "ATLAS local REST",
    kind: "rest",
    transport: "loopback",
    note: "Fallback GET http://localhost:3000/api/explain/assets when MCP is missing or unreadable.",
  },
];

export function listConnectors(): readonly ConnectorListing[] {
  return CONNECTORS;
}

export { mayCallLocalAtlas, probeAtlasLocal };
export type { AtlasLink, ConnectorId };

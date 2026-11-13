# ATLAS Explain connectors

Read-only connectors for this project. They live under `src/connectors/`, separate from ATLAS's `src/atlas/mcp/adapters`. `execution_permission` is none. No secrets, no balances, no account fields.

The hosted web app at atlas-explain.web.app never calls localhost. Only the Chrome extension and a local loopback build may probe ATLAS on this computer.

## Path

| Piece | Where |
| --- | --- |
| Registry | `src/connectors/registry.ts` |
| ATLAS local MCP + REST fallback | `src/connectors/atlas-local.ts` |
| Public MCP client | `src/core/atlas-mcp.ts` (`POST /api/mcp/public`) |
| REST catalog | `src/core/assets.ts` (`GET /api/explain/assets`) |
| Header connection pill | `src/core/popup-copy.ts`, wired from the extension popup and the web app |

## How a local connection is decided

1. If this page is the hosted web app, the header says so and no request is sent.
2. Otherwise the registry probes official public MCP first.
3. If MCP is missing, mid-protocol, or unreadable, it falls back to the REST catalog.
4. The header shows "ATLAS local" only when one of those probes actually answers. It shows "ATLAS desk" when this tab is the Markets desk. It does not fake a connection.

## Tests

`npx vitest run test/connectors.test.ts test/popup-ux.test.ts test/assets-mcp.test.ts`

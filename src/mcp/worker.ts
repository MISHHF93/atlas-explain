/**
 * Cloudflare Workers entry for ATLAS Explain's live side: the MCP connector at /mcp, the live data
 * at /data/v1, and the cron that captures that data (all in src/mcp/live-data.ts). The runtime
 * treats every export of this file as an entry point, so it exports only the handler object.
 * Deployed with `npm run deploy:mcp` (wrangler.toml). See docs/MCP.md.
 */
import { handleRequest, runCapture, type WorkerEnv } from "./live-data";

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

export default {
  fetch(request: Request, env: WorkerEnv): Promise<Response> {
    return handleRequest(request, env);
  },
  scheduled(event: { cron: string }, env: WorkerEnv, ctx: ExecutionContext): void {
    ctx.waitUntil(runCapture(event.cron, env));
  },
};

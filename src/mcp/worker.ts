/**
 * Cloudflare Workers entry for ATLAS Explain's live side: the MCP connector at /mcp, the live data
 * at /data/v1 (refreshed on visit), and the backup crons (all in src/mcp/live-data.ts). The runtime
 * treats every export of this file as an entry point, so it exports only the handler object.
 * Deployed with `npm run deploy:mcp` (wrangler.toml). See docs/MCP.md.
 */
import { handleRequest, runCapture, type WaitContext, type WorkerEnv } from "./live-data";

export default {
  fetch(request: Request, env: WorkerEnv, ctx: WaitContext): Promise<Response> {
    return handleRequest(request, env, ctx);
  },
  scheduled(event: { cron: string }, env: WorkerEnv, ctx: WaitContext): void {
    ctx.waitUntil(runCapture(event.cron, env));
  },
};

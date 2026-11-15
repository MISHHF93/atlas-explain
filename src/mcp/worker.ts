/**
 * Cloudflare Workers entry for the hosted ATLAS Explain MCP server (free plan: 100,000
 * requests a day, no card; over the limit requests fail, nothing is charged).
 * Deployed with `npm run deploy:mcp` (wrangler.toml). See docs/MCP.md.
 */
import { handleHttp } from "./http";
import type { Fetcher } from "./server";

// The two data files change hourly at most; let Cloudflare's edge cache keep them for 5 minutes.
const cachedFetch: Fetcher = (url, init) =>
  fetch(url, { ...init, cf: { cacheTtl: 300, cacheEverything: true } } as RequestInit);

export default {
  fetch(request: Request): Promise<Response> {
    return handleHttp(request, cachedFetch);
  },
};

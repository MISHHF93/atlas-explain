/**
 * Cloudflare Workers entry for the hosted ATLAS Explain MCP server (free plan: 100,000
 * requests a day, no card; over the limit requests fail, nothing is charged).
 * Deployed with `npm run deploy:mcp` (wrangler.toml). See docs/MCP.md.
 */
import { handleHttp } from "./http";
import type { Fetcher } from "./server";

// The data files change hourly at most, so Cloudflare's edge keeps them for 5 minutes. Live crypto
// prices are kept for 1 minute: fresh enough to call live (every answer shows CoinGecko's own time),
// and it keeps many assistants from tripping CoinGecko's free rate limit.
// The app's shared readers pass browser-only options (cache, credentials) that Workers reject, so
// they are dropped here; a User-Agent names the server, as public APIs ask.
const cachedFetch: Fetcher = (url, init = {}) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cache, credentials, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("User-Agent", "ATLAS Explain MCP (+https://atlas-explain.web.app/support#ai-assistants)");
  return fetch(url, { ...rest, headers, cf: { cacheTtl: url.includes("coingecko.com") ? 60 : 300, cacheEverything: true } } as RequestInit);
};

export default {
  fetch(request: Request): Promise<Response> {
    return handleHttp(request, cachedFetch);
  },
};

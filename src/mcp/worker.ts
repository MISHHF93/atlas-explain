/**
 * Cloudflare Workers entry for the hosted ATLAS Explain MCP server (free plan: 100,000
 * requests a day, no card; over the limit requests fail, nothing is charged).
 * Deployed with `npm run deploy:mcp` (wrangler.toml). See docs/MCP.md.
 */
import { handleHttp } from "./http";
import type { Fetcher } from "./server";

/**
 * The only place the server's data comes from: ATLAS Explain's own data site. Any other address is
 * refused, so the connector never calls a third-party API itself (the data job does that, hourly).
 */
export const DATA_ORIGIN = "https://atlas-explain-data.web.app";

// The data files change hourly at most, so Cloudflare's edge keeps them for 5 minutes.
// The app's shared readers pass browser-only options (cache, credentials) that Workers reject, so
// they are dropped here; a User-Agent names the server.
export const ownDataFetch: Fetcher = (url, init = {}) => {
  if (new URL(url).origin !== DATA_ORIGIN) return Promise.reject(new Error(`Refused: ${new URL(url).origin} is not ATLAS Explain's data site.`));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { cache, credentials, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("User-Agent", "ATLAS Explain MCP (+https://atlas-explain.web.app/connect)");
  return fetch(url, { ...rest, headers, cf: { cacheTtl: 300, cacheEverything: true } } as RequestInit);
};

export default {
  fetch(request: Request): Promise<Response> {
    return handleHttp(request, ownDataFetch);
  },
};

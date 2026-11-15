/**
 * Public addresses of ATLAS Explain. Everything people use is online: the website, the web app,
 * the Chrome extension from the Chrome Web Store, and the hosted MCP address for AI assistants.
 * Nobody has to download files or build anything.
 *
 * The two nulls are owner steps. While one is null the site says it is not available yet and never shows
 * a link that doesn't work; setting it switches every button on.
 */
export const EXPLAIN_WEB_URL = "https://atlas-explain.web.app";
/** Chrome Web Store listing, e.g. "https://chromewebstore.google.com/detail/atlas-explain/<id>". */
export const CHROME_STORE_URL: string | null = null;
/** Hosted MCP endpoint (Cloudflare Workers free plan), e.g. "https://atlas-explain-mcp.<account>.workers.dev/mcp". */
// The public address (the directory and registry use it too). One account that had added it before
// the protocol fix kept a saved failure for it and used "?v=2" instead; the server ignores the query.
export const MCP_URL: string | null = "https://atlas-explain-mcp.atlas-explain.workers.dev/mcp";

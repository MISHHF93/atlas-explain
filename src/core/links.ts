/**
 * ATLAS Explain's public identity, in one place: every address people or programs use, and the
 * education line every surface ends with. The website, the web app, the MCP
 * connector, the data job and the docs' tests all read from here, so they can't drift apart.
 * Dependency-free, so the data job (plain Node) and the connector (Cloudflare Workers) can import it.
 *
 * Everything people use is online: the hosted MCP address for AI assistants, the website and the
 * web app. Nobody downloads or builds anything.
 */

/* ---------- the website and web app ---------- */
export const EXPLAIN_WEB_URL = "https://atlas-explain.web.app";
export const APP_URL = `${EXPLAIN_WEB_URL}/app`;
/** The one page for setting up the connector in AI assistants. */
export const CONNECT_URL = `${EXPLAIN_WEB_URL}/connect`;

/* ---------- the MCP connector (Cloudflare Workers free plan) ---------- */
export const MCP_ORIGIN = "https://atlas-explain-mcp.atlas-explain.workers.dev";
/**
 * The public connector address (the directory, the registry and /connect use it). One account that
 * had added it before the protocol fix kept a saved failure for it and used "?v=2", and on 16 Nov 2026
 * "?v=3" (chat stopped seeing the tools though the server answered); the server ignores the query.
 */
export const MCP_URL: string | null = `${MCP_ORIGIN}/mcp`;

/* ---------- live data (captured on a schedule by the same Worker, kept in Workers KV) ---------- */
/**
 * Where the app and the connector read live data: one address, one copy. The connector's Worker
 * captures it on a schedule (src/data/capture.ts) and serves it here, so every surface shows the
 * same numbers with the same times. Providers, one job each: Cloudflare runs the connector and the
 * data; Firebase runs the website, the web app, sign-in and Gemini; GitHub only holds the code.
 */
export const DATA_SITE_URL = MCP_ORIGIN;
export const MARKET_DATA_URL = `${DATA_SITE_URL}/data/v1/market.json`;
export const NEWS_DATA_URL = `${DATA_SITE_URL}/data/v1/news.json`;
export const CRYPTO_DATA_URL = `${DATA_SITE_URL}/data/v1/crypto.json`;
export const ECONOMY_DATA_URL = `${DATA_SITE_URL}/data/v1/economy.json`;
export const WORLD_DATA_URL = `${DATA_SITE_URL}/data/v1/world.json`;

/* ---------- the education line ---------- */
/** The short form, for tight spaces (chart footers, error screens). */
export const EDUCATION_SHORT = "Educational information, not investment advice.";
/** The full line every connector answer and site page ends with. */
export const EDUCATION_LINE = `${EDUCATION_SHORT} ATLAS Explain never tells anyone to trade.`;

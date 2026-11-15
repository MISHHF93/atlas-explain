/**
 * ATLAS Explain's public identity, in one place: every address people or programs use, and the
 * education line every surface ends with. The website, the web app, the extension, the MCP
 * connector, the data job and the docs' tests all read from here, so they can't drift apart.
 * Dependency-free, so the data job (plain Node) and the connector (Cloudflare Workers) can import it.
 *
 * Everything people use is online: the website, the web app, the Chrome extension from the
 * Chrome Web Store, and the hosted MCP address for AI assistants. Nobody downloads or builds anything.
 * CHROME_STORE_URL is an owner step: while it is null the site says the extension is not in the store
 * yet and never shows a link that doesn't work; setting it switches every button on.
 */

/* ---------- the website and web app ---------- */
export const EXPLAIN_WEB_URL = "https://atlas-explain.web.app";
export const APP_URL = `${EXPLAIN_WEB_URL}/app`;
/** The one page for setting up the connector in AI assistants. */
export const CONNECT_URL = `${EXPLAIN_WEB_URL}/connect`;
/** Chrome Web Store listing, e.g. "https://chromewebstore.google.com/detail/atlas-explain/<id>". */
export const CHROME_STORE_URL: string | null = null;

/* ---------- the data site (published by the scheduled data job) ---------- */
export const DATA_SITE_URL = "https://atlas-explain-data.web.app";
export const MARKET_DATA_URL = `${DATA_SITE_URL}/data/v1/market.json`;
export const NEWS_DATA_URL = `${DATA_SITE_URL}/data/v1/news.json`;
export const CRYPTO_DATA_URL = `${DATA_SITE_URL}/data/v1/crypto.json`;

/* ---------- the MCP connector (Cloudflare Workers free plan) ---------- */
export const MCP_ORIGIN = "https://atlas-explain-mcp.atlas-explain.workers.dev";
/**
 * The public connector address (the directory, the registry and /connect use it). One account that
 * had added it before the protocol fix kept a saved failure for it and used "?v=2" instead; the
 * server ignores the query.
 */
export const MCP_URL: string | null = `${MCP_ORIGIN}/mcp`;

/* ---------- the education line ---------- */
/** The short form, for tight spaces (the extension, chart footers, error screens). */
export const EDUCATION_SHORT = "Educational information, not investment advice.";
/** The full line every connector answer and site page ends with. */
export const EDUCATION_LINE = `${EDUCATION_SHORT} ATLAS Explain never tells anyone to trade.`;

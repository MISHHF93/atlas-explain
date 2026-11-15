// src/core/asset-schema.ts
var ASSET_CLASSES = [
	"crypto",
	"stock",
	"etf",
	"index",
	"forex",
	"commodity",
	"future",
	"option",
	"rate"
];
/** Image hosts allowed for logos: CoinGecko (coin images in its API data) and Logo.dev (company logos, credited). */
var LOGO_HOSTS = [
	"coin-images.coingecko.com",
	"assets.coingecko.com",
	"img.logo.dev"
];
function isAllowedLogo(url) {
	if (typeof url !== "string" || url.length > 400) return false;
	try {
		const u = new URL(url);
		return u.protocol === "https:" && LOGO_HOSTS.includes(u.hostname);
	} catch {
		return false;
	}
}
var ID = /^(crypto|stock|etf|index|fx|commodity|future|option|rate):[A-Z0-9:._/-]{1,40}$/;
var CURRENCY = /^([A-Z]{3}|%)$/;
var ACCOUNT_KEY = /balance|account|portfolio|pnl|password|secret|token|buying.?power/i;
var TRADE_WORDS = /\b(buy|sell|you should)\b/i;
/** Allowed clock skew between a source and this device. */
var SKEW_MS = 3e5;
function validateSource(source, at) {
	if (!source) return [`${at}: missing source`];
	const errors = [];
	if (!source.providerId || !source.label) errors.push(`${at}: source needs an id and a label`);
	if (!source.attribution?.text || !/^https:\/\//.test(source.attribution?.href ?? "")) errors.push(`${at}: attribution needs text and an https link`);
	if (!source.licence?.displayAllowed) errors.push(`${at}: licence does not allow display`);
	return errors;
}
function validTime(value, now) {
	if (!value) return false;
	const t = Date.parse(value);
	return Number.isFinite(t) && t <= now + SKEW_MS;
}
function validateAsset(asset, now = Date.now()) {
	const errors = [];
	if (!ID.test(asset.id)) errors.push(`id "${asset.id}" is not namespaced`);
	if (!asset.symbol || !asset.name) errors.push("symbol and name are required");
	if (!ASSET_CLASSES.includes(asset.class)) errors.push(`unknown class "${asset.class}"`);
	const listed = (c) => c === "stock" || c === "etf";
	const cd = asset.classData?.class;
	if (cd !== asset.class && !(listed(cd) && listed(asset.class))) errors.push("classData does not match class");
	if (!CURRENCY.test(asset.currency)) errors.push(`currency "${asset.currency}" is not ISO 4217 or %`);
	if (asset.logo != null && !isAllowedLogo(asset.logo)) errors.push("logo must be an https image from an allowed host");
	if (asset.quote === null) {
		if (!asset.noQuoteReason?.trim()) errors.push("a missing quote needs a plain noQuoteReason");
	} else {
		const q = asset.quote;
		if (!Number.isFinite(q.value)) errors.push("quote value is not a number");
		if (q.value === 0 && asset.class !== "rate") errors.push("quote value is 0: a failed fetch must be null, not zero");
		if (q.changePct != null && !Number.isFinite(q.changePct)) errors.push("changePct is not a number");
		if (!q.changeWindow?.trim()) errors.push("change needs its time window");
		if (!validTime(q.asOf, now)) errors.push("quote asOf is missing, invalid or in the future");
		errors.push(...validateSource(q.source, "quote"));
	}
	asset.facts.forEach((f, i) => {
		if (!f.label || !f.value) errors.push(`fact ${i}: needs a label and a value`);
		if (f.asOf && !validTime(f.asOf, now)) errors.push(`fact ${i}: asOf is invalid or in the future`);
		errors.push(...validateSource(f.source, `fact ${i}`));
	});
	if (asset.status.state === "shown" && asset.status.insights.some((x) => x.clearedForPublic !== true)) errors.push("an insight that is not cleared for public use is marked shown");
	for (const key of keysDeep(asset)) if (ACCOUNT_KEY.test(key)) errors.push(`account-shaped field "${key}"`);
	for (const text of stringsDeep(asset)) if (TRADE_WORDS.test(text) && !/^https?:\/\//.test(text)) errors.push(`trade wording in "${text.slice(0, 60)}"`);
	return {
		ok: errors.length === 0,
		errors
	};
}
function keysDeep(value, out = []) {
	if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
	else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) {
		out.push(k);
		keysDeep(v, out);
	}
	return out;
}
function stringsDeep(value, out = []) {
	if (typeof value === "string") out.push(value);
	else if (Array.isArray(value)) value.forEach((v) => stringsDeep(v, out));
	else if (value && typeof value === "object") Object.values(value).forEach((v) => stringsDeep(v, out));
	return out;
}
// src/core/news.ts
/**
* "What was in the news today" (docs/ux/MULTI_ASSET_CATALOG.md §5.5, M7).
* Headlines come from the GDELT Project's free news index (commercial use allowed with a
* citation and link), collected by the scheduled data job into a small news.json.
* The app never searches the web from the model: it hands the model only these linked
* headlines and asks for a summary, so every sentence can be traced to a source.
*
* Pure: no network, no DOM. Shared by the data job (Node) and the app.
*/
var NEWS_SCHEMA = "atlas-explain-news-v1";
/**
* Assets that get headlines, and how a headline is matched to each (by name in the title).
* GDELT allows one request every 5 seconds, so a few grouped queries (NEWS_GROUPS) fetch
* everything at once and the headlines are assigned here, instead of one query per asset.
*/
var NEWS_TARGETS = [
	["AAPL", /\bApple\b/],
	["MSFT", /\bMicrosoft\b/],
	["NVDA", /\bNvidia\b/i],
	["AMZN", /\bAmazon\b/],
	["GOOGL", /\b(Alphabet|Google)\b/],
	["META", /\bMeta( Platforms)?\b/],
	["TSLA", /\bTesla\b/],
	["BRK-B", /\bBerkshire\b/],
	["JPM", /\bJPMorgan\b/i],
	["V", /\bVisa\b/],
	["MA", /\bMastercard\b/],
	["UNH", /\bUnitedHealth\b/],
	["XOM", /\bExxon(Mobil)?\b/],
	["JNJ", /\bJohnson & Johnson\b|\bJ&J\b/],
	["PG", /\bProcter\b|\bP&G\b/],
	["HD", /\bHome Depot\b/],
	["COST", /\bCostco\b/],
	["WMT", /\bWalmart\b/],
	["KO", /\bCoca-Cola\b/],
	["PEP", /\bPepsiCo\b/],
	["NFLX", /\bNetflix\b/],
	["AMD", /\bAMD\b|\bAdvanced Micro Devices\b/],
	["INTC", /\bIntel\b/],
	["ORCL", /\bOracle\b/],
	["CRM", /\bSalesforce\b/],
	["ADBE", /\bAdobe\b/],
	["DIS", /\bDisney\b/],
	["BA", /\bBoeing\b/],
	["CAT", /\bCaterpillar\b/],
	["GS", /\bGoldman\b/]
].map(([ticker, match]) => ({
	assetId: `stock:US:${ticker}`,
	match
})).concat([
	{
		assetId: "crypto:BTC",
		match: /\bBitcoin\b|\bBTC\b/i
	},
	{
		assetId: "crypto:ETH",
		match: /\bEthereum\b|\bEther\b/i
	},
	{
		assetId: "crypto:SOL",
		match: /\bSolana\b/i
	},
	{
		assetId: "crypto:XRP",
		match: /\bXRP\b|\bRipple\b/
	},
	{
		assetId: "crypto:DOGE",
		match: /\bDogecoin\b/i
	}
]);
var NEWS_TARGET_IDS = new Set(NEWS_TARGETS.map((t) => t.assetId));
/** Reads the published news.json; anything malformed or stale is dropped, never shown. */
function readNewsFile(body, now = Date.now()) {
	if (!body || typeof body !== "object") return null;
	const f = body;
	if (f.schema !== "atlas-explain-news-v1" || typeof f.generatedAt !== "string" || !f.items || typeof f.items !== "object") return null;
	const items = {};
	for (const [id, list] of Object.entries(f.items)) {
		if (!NEWS_TARGET_IDS.has(id) || !Array.isArray(list)) continue;
		items[id] = list.filter((n) => !!n && typeof n.title === "string" && n.title.length <= 200 && typeof n.url === "string" && /^https?:\/\//.test(n.url) && typeof n.domain === "string" && typeof n.seenAt === "string" && now - Date.parse(n.seenAt) <= 1296e5).slice(0, 5);
	}
	return {
		schema: NEWS_SCHEMA,
		generatedAt: f.generatedAt,
		items
	};
}
// src/core/catalog.ts
/**
* The public multi-asset catalog: plain copy per class, search and filters, recently viewed,
* number formatting and the Explain prompt. Pure functions on the Asset schema; no network, no DOM.
* See docs/ux/MULTI_ASSET_CATALOG.md §5.
*/
/** The free data hosting site the job deploys to (separate from the app, so the app is never redeployed by it). */
var MARKET_DATA_URL = "https://atlas-explain-data.web.app/data/v1/market.json";
var MARKET_SCHEMA = "atlas-explain-market-v1";
/**
* Reads the published market file. Every record is re-validated here, so a bad file can
* never put an unattributed or invented number on screen: invalid records are dropped.
*/
function readMarketFile(body, now = Date.now()) {
	if (!body || typeof body !== "object") return [];
	const file = body;
	if (file.schema !== MARKET_SCHEMA || !Array.isArray(file.assets)) return [];
	return file.assets.filter((a) => {
		try {
			return a.class !== "crypto" && validateAsset(a, now).ok;
		} catch {
			return false;
		}
	}).slice(0, 2e3);
}
var NEWS_DATA_URL = "https://atlas-explain-data.web.app/data/v1/news.json";
/** "$68,169.70", "1.0842", "4.21%". Never formats a missing value as 0. */
function formatValue(a) {
	const q = a.quote;
	if (!q) return null;
	if (a.class === "rate" || a.currency === "%") return `${q.value.toFixed(2)}%`;
	if (a.class === "forex") {
		const v = q.value;
		return v.toFixed(v >= 100 ? 2 : v >= 10 ? 3 : v >= 1 ? 4 : v >= .01 ? 5 : 6);
	}
	const digits = q.value >= 1e3 ? 2 : q.value >= 1 ? 2 : q.value >= .01 ? 4 : 6;
	try {
		return new Intl.NumberFormat("en-US", {
			style: "currency",
			currency: a.currency,
			minimumFractionDigits: digits,
			maximumFractionDigits: digits
		}).format(q.value);
	} catch {
		return `${q.value.toFixed(digits)} ${a.currency}`;
	}
}
// src/core/glossary.ts
/**
* Short educational definitions that ATLAS Explain and the ATLAS desk
* can share by id. The wording is descriptive only: it does not tell
* anyone to trade, and it does not describe balances or accounts.
*/
var GLOSSARY = [
	{
		id: "shadow",
		title: "Shadow metrics",
		summary: "A shadow metric is a paper record of how a research model would have scored after the fact. It is used to study the model, not to place a trade, and it is not a recommendation."
	},
	{
		id: "signal15",
		title: "Signal15",
		summary: "Signal15 is a 15-minute research signal on the private ATLAS desk. In this app it is only a concept to explain: a short-horizon label that can be read as a case for or against a move, never as an instruction to buy or sell."
	},
	{
		id: "chart_layers",
		title: "Chart layers",
		summary: "Chart layers are optional overlays on a price chart, such as volume, indicators, or research series. Turning a layer on helps you see one more piece of context. It does not by itself say what to do next."
	},
	{
		id: "live_lock",
		title: "Live lock",
		summary: "A live lock is a freshness check. It tells you whether the desk is looking at a live feed or at a held, delayed, or incomplete series, so a reading is not mistaken for a current quote."
	},
	{
		id: "paper_only",
		title: "Paper only",
		summary: "Paper-only means the desk is for research and simulation. It does not send live orders and it does not grant permission to trade. Explanations of paper results stay educational."
	},
	{
		id: "drop_study",
		title: "Drop study",
		summary: "A drop study looks at how a sharp decline unfolded over the following sessions: how often prices recovered, how often they kept falling, and what else was happening. It is a historical reading, not a forecast and not advice."
	},
	{
		id: "hybrid_inference",
		title: "Hybrid inference",
		summary: "Hybrid inference means ATLAS Explain tries Gemini Nano on your own device first, and uses Gemini in the cloud only when your browser cannot run it or the text is too long. Every answer is labelled with where it ran. Private notes never leave your device."
	},
	{
		id: "move_card",
		title: "Move card",
		summary: "A move card is a structured description of one session move: the symbol, the percent change, and optional market, peer, volume, and headline context. ATLAS Explain reads that card and writes a balanced explanation. It does not receive balances or account details."
	}
];
new Map(GLOSSARY.map((entry) => [entry.id, entry]));
// src/core/terms.ts
var TRADING_TERMS = [
	{
		id: "stop_limit",
		group: "orders",
		title: "Stop-limit order",
		summary: "An order with two prices. The stop price activates it; the limit price caps the worst fill accepted. In a fast market it can stay unfilled."
	},
	{
		id: "market_order",
		group: "orders",
		title: "Market order",
		summary: "An order that fills at the best price available right now. It favours speed over price, so the fill can differ from the last quote."
	},
	{
		id: "spread",
		group: "market",
		title: "Bid-ask spread",
		summary: "The gap between the highest bid and the lowest ask. A wide spread usually means thinner trading and a higher cost to get in and out."
	},
	{
		id: "volume",
		group: "market",
		title: "Volume",
		summary: "How many shares or contracts changed hands in a period. A move on heavy volume is often read as broader participation than the same move on light volume."
	},
	{
		id: "gap",
		group: "market",
		title: "Gap",
		summary: "When a price opens well above or below the prior close with no trading in between, often after news outside market hours."
	},
	{
		id: "implied_volatility",
		group: "risk",
		title: "Implied volatility (IV)",
		summary: "The size of future moves that option prices are pricing in. High IV means the market expects bigger swings, not which direction they will go."
	},
	{
		id: "margin",
		group: "risk",
		title: "Margin",
		summary: "Borrowed money used to hold a larger position than cash alone allows. It magnifies gains and losses, and a falling price can trigger a margin call."
	},
	{
		id: "drawdown",
		group: "risk",
		title: "Drawdown",
		summary: "The fall from a peak to a later low, usually shown as a percent. It describes how deep a decline went, not whether it will recover."
	},
	{
		id: "hit_rate",
		group: "risk",
		title: "Hit rate",
		summary: "The share of resolved predictions that turned out right. On its own it says little: sample size and the size of wins and misses matter too."
	},
	{
		id: "market_hours",
		group: "market",
		title: "Market hours",
		summary: "The times an exchange is open for regular trading. US stock exchanges open 9:30 am to 4 pm New York time on weekdays. Crypto trades around the clock, and currencies trade around the clock on weekdays."
	},
	{
		id: "index",
		group: "market",
		title: "Index",
		summary: "A number that tracks a group of investments to describe a market, such as the S&P 500 for large US companies. An index is a measurement, not something you can own directly; funds can be built to follow it."
	},
	{
		id: "etf",
		group: "market",
		title: "ETF (exchange-traded fund)",
		summary: "A fund that holds a basket of investments, such as the stocks in an index or a set of bonds, and trades on an exchange like a single stock. Its price follows the value of what it holds."
	},
	{
		id: "filings",
		group: "market",
		title: "10-K, 10-Q and 8-K",
		summary: "Reports US public companies must file with the SEC. A 10-K is the audited annual report, a 10-Q the quarterly report, and an 8-K a notice of a major event such as results, a merger or a leadership change."
	},
	{
		id: "futures_contract",
		group: "market",
		title: "Futures contract",
		summary: "An agreement to exchange a set amount of something, such as oil, gold or an index's value, at a price fixed today for a date in the future. Each contract has a standard size, a smallest price step and an expiry."
	},
	{
		id: "expiry",
		group: "market",
		title: "Expiry",
		summary: "The date a futures or options contract ends. After it, the contract is settled by delivering the underlying item or paying the difference in cash, and it no longer trades."
	},
	{
		id: "strike",
		group: "market",
		title: "Strike price",
		summary: "The fixed price written into an option contract: the price at which the holder may purchase (for a call) or hand over (for a put) the underlying asset."
	},
	{
		id: "call_put",
		group: "market",
		title: "Call and put options",
		summary: "A call gives its holder the right, not the obligation, to purchase an asset at the strike price before expiry. A put gives the right to hand it over at the strike price. The writer of the option takes the other side."
	},
	{
		id: "greeks",
		group: "risk",
		title: "The Greeks",
		summary: "Measures of how an option's value reacts to change. Delta: to the asset's price. Gamma: how fast delta itself changes. Theta: to the passing of time. Vega: to changes in expected volatility."
	},
	{
		id: "yield",
		group: "market",
		title: "Bond yield",
		summary: "The yearly return a bond pays, as a percentage of its price. When a bond's price falls, its yield rises, and the other way round. Government yields show what it costs a government to borrow."
	},
	{
		id: "yield_curve",
		group: "market",
		title: "Yield curve",
		summary: "A line joining the yields of government bonds from short terms (one month) to long terms (30 years). It usually slopes up. When short-term yields are higher than long-term ones, the curve is called inverted."
	},
	{
		id: "basis_point",
		group: "market",
		title: "Basis point",
		summary: "One hundredth of a percentage point (0.01%). A yield moving from 4.20% to 4.25% has risen 5 basis points. Rate changes are often quoted this way, or in percentage points (pt)."
	},
	{
		id: "pip",
		group: "market",
		title: "Pip",
		summary: "The smallest usual step in a currency rate: 0.0001 for most pairs, and 0.01 for pairs quoted in Japanese yen. A move in EUR/USD from 1.1050 to 1.1060 is 10 pips."
	},
	{
		id: "reference_rate",
		group: "market",
		title: "Reference rate",
		summary: "An exchange rate published once a day by a central bank, such as the European Central Bank or the Bank of Canada, from market prices at a set time. It is for information, not a price anyone can trade at."
	}
];
GLOSSARY.filter((entry) => entry.id !== "hybrid_inference").map((entry) => ({
	...entry,
	group: "atlas"
}));
/** The public glossary: trading terms plus how answers are made. */
var ALL_TERMS = [...TRADING_TERMS, ...GLOSSARY.filter((entry) => entry.id === "hybrid_inference").map((entry) => ({
	...entry,
	group: "ai"
}))];
function searchTerms(query, entries = ALL_TERMS) {
	const q = query.trim().toLowerCase();
	if (!q) return [...entries];
	return entries.filter((entry) => `${entry.title} ${entry.summary}`.toLowerCase().includes(q));
}
// src/mcp/server.ts
/**
* ATLAS Explain MCP server: lets AI assistants (Claude Desktop, Claude Code and others that
* speak the Model Context Protocol) look things up in ATLAS Explain.
*
* Read-only and free. It runs on the person's own computer over standard input and output,
* needs no API key, and only reads the public files ATLAS Explain already publishes:
*   - the plain-language glossary (built into the server),
*   - official market figures (US Treasury, ECB, Bank of Canada, EIA, SEC EDGAR) from the data site,
*   - today's headlines (GDELT) from the data site.
* It never calls a model, never reads accounts, and never gives trade advice. Every result
* names its source and time, and ends with the education-only line.
*
* Built into one file by `npm run build:mcp` (mcp/atlas-explain-mcp.mjs).
*/
var SERVER_NAME = "atlas-explain";
var SERVER_VERSION = "1.0.0";
var SUPPORTED_PROTOCOLS = [
	"2025-06-18",
	"2025-03-26",
	"2024-11-05"
];
var EDUCATION_LINE = "Educational information, not investment advice. ATLAS Explain never tells anyone to trade.";
var APP_URL = "https://atlas-explain.web.app/app";
var TOOLS = [
	{
		name: "explain_term",
		title: "Explain a market term",
		description: "Look up a trading or market term (for example 'stop-limit order', 'bid-ask spread', 'yield curve') in ATLAS Explain's plain-language glossary. Education only.",
		inputSchema: {
			type: "object",
			properties: { term: {
				type: "string",
				description: "The term or phrase to look up."
			} },
			required: ["term"],
			additionalProperties: false
		},
		annotations: {
			readOnlyHint: true,
			openWorldHint: false
		}
	},
	{
		name: "official_figures",
		title: "Official market figures",
		description: "Official figures ATLAS Explain publishes from free government and regulator sources (US Treasury yields, ECB and Bank of Canada reference rates, EIA energy prices, SEC filings for large US companies). Each has its source and date. Optional search by name or symbol.",
		inputSchema: {
			type: "object",
			properties: { query: {
				type: "string",
				description: "Optional name or symbol, for example '10-year', 'EUR', 'AAPL'."
			} },
			additionalProperties: false
		},
		annotations: {
			readOnlyHint: true,
			openWorldHint: true
		}
	},
	{
		name: "todays_headlines",
		title: "Today's market headlines",
		description: "Recent market headlines ATLAS Explain collected from the GDELT Project, each with its publisher, link and time. Headlines older than 36 hours are never returned. Optional filter by company or coin.",
		inputSchema: {
			type: "object",
			properties: { about: {
				type: "string",
				description: "Optional company, coin or word, for example 'Nvidia' or 'Bitcoin'."
			} },
			additionalProperties: false
		},
		annotations: {
			readOnlyHint: true,
			openWorldHint: true
		}
	}
];
var text = (body, isError = false) => ({
	content: [{
		type: "text",
		text: `${body}\n\n${EDUCATION_LINE}`
	}],
	...isError ? { isError } : {}
});
async function getJson(url, fetcher) {
	const ctl = new AbortController();
	const timer = setTimeout(() => ctl.abort(), 1e4);
	try {
		const res = await fetcher(url, { signal: ctl.signal });
		return res.ok ? await res.json() : null;
	} catch {
		return null;
	} finally {
		clearTimeout(timer);
	}
}
function explainTerm(term) {
	const query = term.trim();
	if (!query) return text("Give a term to look up, for example 'stop-limit order'.", true);
	const hits = searchTerms(query).slice(0, 3);
	if (!hits.length) return text(`"${query}" is not in the ATLAS Explain glossary. The ATLAS Explain web app can explain any term, sentence or headline in plain language, with both sides: ${APP_URL}`);
	return text(hits.map((t) => `${t.title}\n${t.summary}`).join("\n\n") + `\n\nSource: ATLAS Explain glossary. More: ${APP_URL}/learn`);
}
function figureLine(a) {
	const value = formatValue(a);
	if (!value || !a.quote) return `${a.name} (${a.symbol}): no figure shown. ${a.noQuoteReason ?? ""}`.trim();
	const source = a.quote.source.attribution.text.replace(/^source:\s*/i, "");
	return `${a.name} (${a.symbol}): ${value}, as of ${a.quote.asOf.slice(0, 10)}. Source: ${source} (${a.quote.source.attribution.href})`;
}
async function officialFigures(query, fetcher, now = Date.now()) {
	const body = await getJson(MARKET_DATA_URL, fetcher);
	if (body == null) return text("Official figures couldn't be loaded right now. Try again in a few minutes.", true);
	const assets = readMarketFile(body, now);
	const q = query?.trim().toLowerCase() ?? "";
	const matches = (q ? assets.filter((a) => `${a.name} ${a.symbol}`.toLowerCase().includes(q)) : assets).filter((a) => a.quote).slice(0, 20);
	if (!matches.length) return text(q ? `No official figure matches "${query}".` : "No official figure is available right now.");
	return text(matches.map(figureLine).join("\n"));
}
async function todaysHeadlines(about, fetcher, now = Date.now()) {
	const body = await getJson(NEWS_DATA_URL, fetcher);
	const file = body == null ? null : readNewsFile(body, now);
	if (!file) return text("Headlines couldn't be loaded right now. Try again in a few minutes.", true);
	const seen = /* @__PURE__ */ new Set();
	const q = about?.trim().toLowerCase() ?? "";
	const items = Object.values(file.items).flat().filter((n) => seen.has(n.url) ? false : (seen.add(n.url), true)).filter((n) => !q || n.title.toLowerCase().includes(q)).sort((a, b) => b.seenAt.localeCompare(a.seenAt)).slice(0, 10);
	if (!items.length) return text(q ? `No recent headline mentions "${about}".` : `No headline is recent enough to call today's news (the list was last refreshed ${file.generatedAt.slice(0, 16).replace("T", " ")} UTC). Older headlines are not returned.`);
	return text(items.map((n) => `${n.title}\n${n.domain}, ${n.seenAt.slice(0, 16).replace("T", " ")} UTC: ${n.url}`).join("\n\n") + "\n\nHeadlines found by the GDELT Project. They link to their publishers; ATLAS Explain does not write or check them.");
}
/** Answers one message; null for notifications, which get no reply. */
async function handle(message, fetcher) {
	const id = message.id ?? null;
	const isRequest = message.id !== void 0 && message.id !== null;
	const ok = (result) => ({
		jsonrpc: "2.0",
		id,
		result
	});
	const fail = (code, msg) => ({
		jsonrpc: "2.0",
		id,
		error: {
			code,
			message: msg
		}
	});
	if (message.jsonrpc !== "2.0" || typeof message.method !== "string") return isRequest ? fail(-32600, "Invalid request") : null;
	if (!isRequest) return null;
	switch (message.method) {
		case "initialize": {
			const asked = typeof message.params?.protocolVersion === "string" ? message.params.protocolVersion : "";
			return ok({
				protocolVersion: SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
				capabilities: { tools: { listChanged: false } },
				serverInfo: {
					name: SERVER_NAME,
					title: "ATLAS Explain",
					version: SERVER_VERSION
				},
				instructions: "Read-only look-ups from ATLAS Explain: a plain-language glossary, official figures with their sources, and today's headlines. Education only: never present results as trade advice."
			});
		}
		case "ping": return ok({});
		case "tools/list": return ok({ tools: TOOLS });
		case "tools/call": {
			const name = message.params?.name;
			const args = message.params?.arguments ?? {};
			const str = (v) => typeof v === "string" ? v : void 0;
			if (name === "explain_term") return ok(explainTerm(str(args.term) ?? ""));
			if (name === "official_figures") return ok(await officialFigures(str(args.query), fetcher));
			if (name === "todays_headlines") return ok(await todaysHeadlines(str(args.about), fetcher));
			return fail(-32602, `Unknown tool: ${String(name)}`);
		}
		default: return fail(-32601, `Method not found: ${message.method}`);
	}
}
/** Reads newline-delimited JSON-RPC messages from stdin and writes replies to stdout. Logs go to stderr only. */
function serveStdio(fetcher = fetch) {
	let buffer = "";
	const pending = /* @__PURE__ */ new Set();
	process.stdin.setEncoding("utf8");
	process.stdin.on("data", (chunk) => {
		buffer += chunk;
		let newline;
		while ((newline = buffer.indexOf("\n")) >= 0) {
			const line = buffer.slice(0, newline).trim();
			buffer = buffer.slice(newline + 1);
			if (!line) continue;
			let message;
			try {
				message = JSON.parse(line);
			} catch {
				process.stdout.write(JSON.stringify({
					jsonrpc: "2.0",
					id: null,
					error: {
						code: -32700,
						message: "Parse error"
					}
				}) + "\n");
				continue;
			}
			const job = handle(message, fetcher).then((reply) => {
				if (reply) process.stdout.write(JSON.stringify(reply) + "\n");
			}).catch((error) => {
				process.stderr.write(`atlas-explain-mcp: ${error instanceof Error ? error.message : String(error)}\n`);
			}).finally(() => pending.delete(job));
			pending.add(job);
		}
	});
	process.stdin.on("end", () => void Promise.allSettled([...pending]).then(() => process.stdin.pause()));
}
// src/mcp/main.ts
/** Entry point for `node mcp/atlas-explain-mcp.mjs`: serve MCP over standard input and output. */
serveStdio();
export {};

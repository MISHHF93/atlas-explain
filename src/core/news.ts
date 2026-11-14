/**
 * "What was in the news today" (docs/ux/MULTI_ASSET_CATALOG.md §5.5, M7).
 * Headlines come from the GDELT Project's free news index (commercial use allowed with a
 * citation and link), collected by the scheduled data job into a small news.json.
 * The app never searches the web from the model: it hands the model only these linked
 * headlines and asks for a summary, so every sentence can be traced to a source.
 *
 * Pure: no network, no DOM. Shared by the data job (Node) and the app.
 */

export const NEWS_SCHEMA = "atlas-explain-news-v1";
export const NEWS_MAX_PER_ASSET = 5;
/** Headlines older than this are not "today's" news. */
export const NEWS_MAX_AGE_MS = 36 * 3_600_000;

export interface NewsItem {
  title: string;
  url: string;
  domain: string;
  /** ISO time GDELT first saw the article. */
  seenAt: string;
}

export interface NewsFile {
  schema: typeof NEWS_SCHEMA;
  generatedAt: string;
  items: Record<string, NewsItem[]>;
}

/**
 * Assets that get headlines, and how a headline is matched to each (by name in the title).
 * GDELT allows one request every 5 seconds, so a few grouped queries (NEWS_GROUPS) fetch
 * everything at once and the headlines are assigned here, instead of one query per asset.
 */
export const NEWS_TARGETS: readonly { assetId: string; match: RegExp }[] = [
  ["AAPL", /\bApple\b/], ["MSFT", /\bMicrosoft\b/], ["NVDA", /\bNvidia\b/i], ["AMZN", /\bAmazon\b/], ["GOOGL", /\b(Alphabet|Google)\b/],
  ["META", /\bMeta( Platforms)?\b/], ["TSLA", /\bTesla\b/], ["BRK-B", /\bBerkshire\b/], ["JPM", /\bJPMorgan\b/i], ["V", /\bVisa\b/],
  ["MA", /\bMastercard\b/], ["UNH", /\bUnitedHealth\b/], ["XOM", /\bExxon(Mobil)?\b/], ["JNJ", /\bJohnson & Johnson\b|\bJ&J\b/], ["PG", /\bProcter\b|\bP&G\b/],
  ["HD", /\bHome Depot\b/], ["COST", /\bCostco\b/], ["WMT", /\bWalmart\b/], ["KO", /\bCoca-Cola\b/], ["PEP", /\bPepsiCo\b/],
  ["NFLX", /\bNetflix\b/], ["AMD", /\bAMD\b|\bAdvanced Micro Devices\b/], ["INTC", /\bIntel\b/], ["ORCL", /\bOracle\b/], ["CRM", /\bSalesforce\b/],
  ["ADBE", /\bAdobe\b/], ["DIS", /\bDisney\b/], ["BA", /\bBoeing\b/], ["CAT", /\bCaterpillar\b/], ["GS", /\bGoldman\b/],
].map(([ticker, match]) => ({ assetId: `stock:US:${ticker as string}`, match: match as RegExp }))
  .concat([
    { assetId: "crypto:BTC", match: /\bBitcoin\b|\bBTC\b/i },
    { assetId: "crypto:ETH", match: /\bEthereum\b|\bEther\b/i },
    { assetId: "crypto:SOL", match: /\bSolana\b/i },
    { assetId: "crypto:XRP", match: /\bXRP\b|\bRipple\b/ },
    { assetId: "crypto:DOGE", match: /\bDogecoin\b/i },
  ]);

export const NEWS_TARGET_IDS: ReadonlySet<string> = new Set(NEWS_TARGETS.map((t) => t.assetId));

/** A handful of grouped GDELT queries; each name group is ANDed with market words to stay on topic. */
export const NEWS_GROUPS: readonly string[] = [
  "(Apple OR Microsoft OR Nvidia OR Amazon OR Alphabet OR Google OR Meta OR Tesla OR Berkshire OR JPMorgan) (shares OR stock OR earnings OR investors)",
  "(Visa OR Mastercard OR UnitedHealth OR Exxon OR \"Johnson & Johnson\" OR Procter OR \"Home Depot\" OR Costco OR Walmart OR \"Coca-Cola\") (shares OR stock OR earnings OR investors)",
  "(PepsiCo OR Netflix OR AMD OR Intel OR Oracle OR Salesforce OR Adobe OR Disney OR Boeing OR Caterpillar OR Goldman) (shares OR stock OR earnings OR investors)",
  "(bitcoin OR ethereum OR solana OR XRP OR dogecoin) (crypto OR price OR market OR token)",
];

export function gdeltUrl(query: string): string {
  const q = encodeURIComponent(`${query} sourcelang:english`);
  return `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=250&format=json&timespan=1d&sort=datedesc`;
}

/** Assigns headlines to assets by name, newest first, at most NEWS_MAX_PER_ASSET each. */
export function assignNews(items: readonly NewsItem[]): Record<string, NewsItem[]> {
  const sorted = [...items].sort((a, b) => b.seenAt.localeCompare(a.seenAt));
  const out: Record<string, NewsItem[]> = {};
  for (const t of NEWS_TARGETS) {
    const hits = sorted.filter((n) => t.match.test(n.title)).slice(0, NEWS_MAX_PER_ASSET);
    if (hits.length) out[t.assetId] = hits;
  }
  return out;
}

/** GDELT answers its rate limit with plain text, not JSON. */
export function isRateLimitNotice(body: string): boolean {
  return /^\s*Please limit requests/i.test(body);
}

/** Headlines that tell people to trade are dropped: we only pass on reporting, never instructions. */
const INSTRUCTION = /\b(strong\s+(buy|sell)|(buy|sell)\s+(now|today|alert|signal|rating)|you should (buy|sell)|time to (buy|sell)|stocks? to (buy|sell))\b/i;

/** Undo GDELT's tokenizer spacing ("$14 . 2B", "Dry ? ") and collapse whitespace. */
export function cleanTitle(raw: string): string {
  const printable = Array.from(raw, (c) => (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127 ? " " : c)).join("");
  return printable
    .replace(/(\d) \. (\d)/g, "$1.$2")
    .replace(/(\d) , (\d)/g, "$1,$2")
    .replace(/ ([.,:;?!%)'’])/g, "$1")
    .replace(/([($]) /g, "$1")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function gdeltTime(v: unknown): string | null {
  const m = typeof v === "string" ? /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(v) : null;
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

/** GDELT artlist JSON to clean, recent, unique, linkable headlines (at most 250). */
export function parseGdelt(body: string, now: number = Date.now()): NewsItem[] {
  let data: { articles?: Array<Record<string, unknown>> };
  try {
    data = JSON.parse(body) as typeof data;
  } catch {
    return [];
  }
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  for (const a of data.articles ?? []) {
    const title = typeof a.title === "string" ? cleanTitle(a.title) : "";
    const url = typeof a.url === "string" ? a.url : "";
    const seenAt = gdeltTime(a.seendate);
    if (title.length < 12 || !/^https?:\/\/[^\s]{4,500}$/.test(url) || !seenAt) continue;
    const t = Date.parse(seenAt);
    if (now - t > NEWS_MAX_AGE_MS || t > now + 600_000) continue;
    if (INSTRUCTION.test(title)) continue;
    const key = title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    let domain = typeof a.domain === "string" ? a.domain : "";
    if (!domain) {
      try {
        domain = new URL(url).hostname;
      } catch {
        continue;
      }
    }
    out.push({ title, url, domain: domain.slice(0, 80), seenAt });
    if (out.length >= 250) break;
  }
  return out;
}

/** Reads the published news.json; anything malformed or stale is dropped, never shown. */
export function readNewsFile(body: unknown, now: number = Date.now()): NewsFile | null {
  if (!body || typeof body !== "object") return null;
  const f = body as Partial<NewsFile>;
  if (f.schema !== NEWS_SCHEMA || typeof f.generatedAt !== "string" || !f.items || typeof f.items !== "object") return null;
  const items: Record<string, NewsItem[]> = {};
  for (const [id, list] of Object.entries(f.items)) {
    if (!NEWS_TARGET_IDS.has(id) || !Array.isArray(list)) continue;
    items[id] = list.filter((n): n is NewsItem =>
      !!n && typeof n.title === "string" && n.title.length <= 200 && typeof n.url === "string" && /^https?:\/\//.test(n.url) &&
      typeof n.domain === "string" && typeof n.seenAt === "string" && now - Date.parse(n.seenAt) <= NEWS_MAX_AGE_MS,
    ).slice(0, NEWS_MAX_PER_ASSET);
  }
  return { schema: NEWS_SCHEMA, generatedAt: f.generatedAt, items };
}

/**
 * The question for Explain: summarise only the listed headlines and filings, by number,
 * as education. The model gets titles and dates, never the web.
 */
export function newsQuestion(assetName: string, symbol: string, items: readonly NewsItem[], filings: readonly string[]): string {
  const lines = [
    ...items.map((n, i) => `${i + 1}. "${n.title}" (${n.domain}, ${n.seenAt.slice(0, 16).replace("T", " ")} UTC)`),
    ...filings.map((f, i) => `${items.length + i + 1}. SEC filing: ${f}`),
  ];
  return `Summarise for a beginner what these recent headlines and filings say about ${assetName} (${symbol}). ` +
    "Use only the items listed below and refer to them by number. If they disagree or are unclear, say so. " +
    "Do not add facts, prices or causes that are not in the list. Do not recommend a trade.\n\n" + lines.join("\n");
}

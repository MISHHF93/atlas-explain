/**
 * "What was in the news today" (docs/ux/MULTI_ASSET_CATALOG.md §5.5, M7).
 * Two free sources, captured on a schedule (src/data/capture.ts) into a small news.json:
 *   - the GDELT Project's news index (commercial use allowed with a citation and link), matched
 *     to assets by name;
 *   - official press releases from the Federal Reserve, the SEC, the CFTC (US government works)
 *     and the ECB (reuse allowed with the source named), kept as market-wide news and also
 *     matched to assets they name. GDELT often refuses automated requests; these feeds don't.
 * The app never searches the web from the model: it hands the model only these linked
 * headlines and asks for a summary, so every sentence can be traced to a source.
 *
 * Pure: no network, no DOM. Shared by the capture (Worker and Node) and the app.
 */

export const NEWS_SCHEMA = "atlas-explain-news-v1";
export const NEWS_MAX_PER_ASSET = 5;
/** Headlines older than this are not "today's" news. */
export const NEWS_MAX_AGE_MS = 36 * 3_600_000;
/** Official releases come out less often (and not at weekends), so they stay for four days, with their dates shown. */
export const OFFICIAL_MAX_AGE_MS = 4 * 86_400_000;
/** The key in news.json for market-wide official releases (not tied to one asset). */
export const OFFICIAL_NEWS_ID = "market:official";
export const OFFICIAL_MAX = 8;

/** Official press-release feeds: free, keyless RSS. */
export const OFFICIAL_FEEDS: readonly { id: string; label: string; url: string; domain: string }[] = [
  { id: "fed", label: "Federal Reserve", url: "https://www.federalreserve.gov/feeds/press_all.xml", domain: "federalreserve.gov" },
  { id: "sec", label: "SEC", url: "https://www.sec.gov/news/pressreleases.rss", domain: "sec.gov" },
  { id: "cftc", label: "CFTC", url: "https://www.cftc.gov/RSS/RSSGP/rssgp.xml", domain: "cftc.gov" },
  { id: "ecb", label: "ECB", url: "https://www.ecb.europa.eu/rss/press.html", domain: "ecb.europa.eu" },
  { id: "boc", label: "Bank of Canada", url: "https://www.bankofcanada.ca/content_type/press-releases/feed/", domain: "bankofcanada.ca" },
  { id: "boe", label: "Bank of England", url: "https://www.bankofengland.co.uk/rss/news", domain: "bankofengland.co.uk" },
];
export const HEADLINE_CREDIT = "Headlines: the GDELT Project's news index and official releases from the Federal Reserve, SEC, CFTC, ECB, Bank of Canada and Bank of England.";

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

/**
 * A headline without the outlet's name tacked on ("Story | News Radio 101.9", "Story - Reuters"): the
 * publisher is shown beside every headline already, and syndicated copies then read the same.
 */
export function withoutSiteName(title: string): string {
  const pipe = title.lastIndexOf(" | ");
  let t = pipe > 20 ? title.slice(0, pipe) : title;
  const dash = /^(.{20,}?) [-–—] ([^-–—|]{2,40})$/.exec(t);
  // An outlet's name has no digits ("Reuters", "CNBC"); "November 2026" is part of the story.
  if (dash && !/\d/.test(dash[2]!) && dash[2]!.split(" ").length <= 5) t = dash[1]!;
  return t.trim();
}

/** The same story told by different outlets: case, punctuation and the outlet's name don't count. */
export function storyKey(title: string): string {
  return withoutSiteName(title).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Keeps the newest copy of each story (items newest first). */
export function oneOfEachStory(items: readonly NewsItem[]): NewsItem[] {
  const seen = new Set<string>();
  return items.filter((n) => {
    const k = storyKey(n.title);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Assigns headlines to assets by name, newest first, at most NEWS_MAX_PER_ASSET each, each story once. */
export function assignNews(items: readonly NewsItem[]): Record<string, NewsItem[]> {
  const sorted = oneOfEachStory([...items].sort((a, b) => b.seenAt.localeCompare(a.seenAt)));
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
    const title = typeof a.title === "string" ? withoutSiteName(cleanTitle(a.title)) : "";
    const url = typeof a.url === "string" ? a.url : "";
    const seenAt = gdeltTime(a.seendate);
    if (title.length < 12 || !/^https?:\/\/[^\s]{4,500}$/.test(url) || !seenAt) continue;
    const t = Date.parse(seenAt);
    if (now - t > NEWS_MAX_AGE_MS || t > now + 600_000) continue;
    if (INSTRUCTION.test(title)) continue;
    const key = storyKey(title);
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

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
function xmlText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 31 ? String.fromCodePoint(code) : " ";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

/**
 * An RSS or Atom feed to clean, recent, linkable headlines, newest first. A plain reader (no XML
 * library), so it runs in a Worker: items without a title, an http(s) link or a date are skipped.
 */
export function parseRss(xml: string, domain: string, now: number = Date.now(), maxAgeMs: number = OFFICIAL_MAX_AGE_MS): NewsItem[] {
  const out: NewsItem[] = [];
  const seen = new Set<string>();
  for (const m of xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)) {
    const block = m[0];
    const tag = (name: string) => new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i").exec(block)?.[1];
    const title = cleanTitle(xmlText(tag("title") ?? ""));
    const link = xmlText(tag("link") ?? "").trim() || /<link\b[^>]*href="([^"]+)"/i.exec(block)?.[1] || "";
    const dateRaw = xmlText(tag("pubDate") ?? tag("dc:date") ?? tag("updated") ?? tag("published") ?? "").trim();
    const t = Date.parse(dateRaw);
    if (title.length < 12 || !/^https?:\/\/[^\s]{4,500}$/.test(link) || !Number.isFinite(t)) continue;
    if (now - t > maxAgeMs || t > now + 600_000 || INSTRUCTION.test(title)) continue;
    const key = title.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url: link, domain, seenAt: new Date(t).toISOString() });
  }
  return out.sort((a, b) => b.seenAt.localeCompare(a.seenAt));
}

/** Reads the published news.json; anything malformed or stale is dropped, never shown. */
export function readNewsFile(body: unknown, now: number = Date.now()): NewsFile | null {
  if (!body || typeof body !== "object") return null;
  const f = body as Partial<NewsFile>;
  if (f.schema !== NEWS_SCHEMA || typeof f.generatedAt !== "string" || !f.items || typeof f.items !== "object") return null;
  const items: Record<string, NewsItem[]> = {};
  for (const [id, list] of Object.entries(f.items)) {
    const official = id === OFFICIAL_NEWS_ID;
    if ((!official && !NEWS_TARGET_IDS.has(id)) || !Array.isArray(list)) continue;
    const isOfficialDomain = (d: string) => OFFICIAL_FEEDS.some((feed) => feed.domain === d);
    const kept = list.filter((n): n is NewsItem =>
      !!n && typeof n.title === "string" && n.title.length <= 200 && typeof n.url === "string" && /^https?:\/\//.test(n.url) &&
      typeof n.domain === "string" && typeof n.seenAt === "string" &&
      // An official release stays for four days; a news story for 36 hours.
      now - Date.parse(n.seenAt) <= (isOfficialDomain(n.domain) ? OFFICIAL_MAX_AGE_MS : NEWS_MAX_AGE_MS),
    ).slice(0, official ? OFFICIAL_MAX : NEWS_MAX_PER_ASSET);
    if (kept.length) items[id] = kept;
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

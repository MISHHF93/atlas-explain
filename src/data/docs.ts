/**
 * Official statements and speeches (docs/V2_DESIGN.md, phase 2): the Federal Reserve's FOMC statements and
 * the Bank of Canada's rate announcements, kept two at a time so the newest can be compared word by word
 * with the one before, and each bank's recent speeches with the bank's own one-line description.
 *
 * Read from each bank's own RSS feed and release page, never through an aggregator (FRED's terms rule out
 * caching). Fed text is a US government work (public domain). Bank of Canada text: stored for comparison,
 * returned as short attributed quotes with links until its terms for commercial reuse are confirmed.
 */
import type { CaptureEnv } from "./capture";
import { decisionTime, type EconomyFile } from "./economy";

export const DOCS_SCHEMA = "atlas-explain-docs-v1";
export type DocBank = "fed" | "boc";
export const DOC_BANKS: readonly DocBank[] = ["fed", "boc"];

export const DOC_SOURCES = {
  fedMonetary: "https://www.federalreserve.gov/feeds/press_monetary.xml",
  fedSpeeches: "https://www.federalreserve.gov/feeds/speeches.xml",
  bocPress: "https://www.bankofcanada.ca/content_type/press-releases/feed/",
  bocSpeeches: "https://www.bankofcanada.ca/content_type/speeches/feed/",
} as const;

export const BANK_NAME: Record<DocBank, string> = { fed: "Federal Reserve", boc: "Bank of Canada" };
export const BANK_LICENCE: Record<DocBank, "public_domain" | "confirm"> = { fed: "public_domain", boc: "confirm" };

export interface Decision {
  action: "raise" | "cut" | "hold";
  /** The target after the decision, in percent: the top of the Fed's range, or the Bank of Canada's rate. */
  rate: number;
  /** The Fed's range as written, for example "3.75 to 4". */
  range: string | null;
  /** Size of the move in basis points, when stated. */
  bp: number | null;
}

export interface Statement {
  bank: DocBank;
  date: string;
  title: string;
  url: string;
  paragraphs: string[];
  decision: Decision | null;
  capturedAt: string;
}

export interface Speech {
  bank: DocBank;
  date: string;
  title: string;
  speaker: string | null;
  /** The bank's own one-line description from its feed. */
  about: string;
  url: string;
}

export interface DocsFile {
  schema: typeof DOCS_SCHEMA;
  generatedAt: string;
  /** Newest first, at most two per bank. */
  statements: Record<DocBank, Statement[]>;
  /** Newest first, at most 12 per bank. */
  speeches: Record<DocBank, Speech[]>;
}

/* ---------- parsing ---------- */

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", frac14: "¼", frac12: "½", frac34: "¾" };
export function plain(html: string): string {
  return html
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+\d*);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

export interface FeedItem { title: string; link: string; date: string | null; description: string }

/** RSS items, with a date from pubDate or, failing that, from the link (both banks put it there). */
export function parseFeed(xml: string): FeedItem[] {
  return [...xml.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)].map((m) => {
    const it = m[1]!;
    const tag = (t: string) => it.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`))?.[1] ?? "";
    const link = plain(tag("link"));
    const pub = plain(tag("pubDate")) || plain(tag("dc:date"));
    const fromPub = pub && !Number.isNaN(Date.parse(pub)) ? new Date(Date.parse(pub)).toISOString().slice(0, 10) : null;
    const fromLink = link.match(/(\d{4})-(\d{2})-(\d{2})\/?$/) ?? link.match(/[a-z](\d{4})(\d{2})(\d{2})[a-z]?\.htm/);
    const date = fromPub ?? (fromLink ? `${fromLink[1]}-${fromLink[2]}-${fromLink[3]}` : null);
    return { title: plain(tag("title")), link, date, description: plain(tag("description")) };
  }).filter((i) => /^https:\/\//.test(i.link) && i.title);
}

const paragraphsIn = (html: string, start: string, length = 60_000) => {
  const i = html.indexOf(start);
  if (i < 0) return [];
  return [...html.slice(i, i + length).matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => plain(m[1]!)).filter(Boolean);
};

/** An FOMC statement page: the statement and its votes, without the page's date line and contacts. */
export function extractFedStatement(html: string): string[] {
  const all = paragraphsIn(html, '<div id="article">');
  const out: string[] = [];
  for (const p of all) {
    if (/^For media inquiries|^Implementation Note|^Board of Governors|^20th Street/.test(p)) break;
    if (/^[A-Z][a-z]+ \d{1,2}, \d{4}$/.test(p)) continue;
    // "For release at 2:00 p.m. EDT … approved the following statement …": keep only the vote line's sentence.
    const lead = p.match(/(The Federal Open Market Committee approved the following statement[^:]*):?/);
    if (/^For release at/.test(p)) { if (lead) out.push(lead[1]! + "."); continue; }
    out.push(p);
  }
  return out;
}

/** A Bank of Canada rate announcement: its paragraphs up to the next scheduled date. */
export function extractBocStatement(html: string): string[] {
  const all = paragraphsIn(html, "<div class='post-content'>");
  const out: string[] = [];
  for (const p of all) {
    out.push(p);
    if (/^The next scheduled date for announcing/.test(p)) break;
  }
  return out;
}

const FRACTION: Record<string, number> = { "1/4": 0.25, "1/2": 0.5, "3/4": 0.75, "¼": 0.25, "½": 0.5, "¾": 0.75 };
/** "3-3/4" → 3.75; "4" → 4; "2½" → 2.5. */
export function fracNumber(s: string): number {
  const m = s.trim().match(/^(\d+)(?:[- ]?(\d\/\d|[¼½¾]))?$|^(\d\/\d)$/);
  if (!m) return Number(s);
  if (m[3]) return FRACTION[m[3]] ?? NaN;
  return Number(m[1]) + (m[2] ? FRACTION[m[2]] ?? 0 : 0);
}

export function parseFedDecision(paragraphs: string[]): Decision | null {
  const text = paragraphs.join(" ");
  const m = text.match(/decided to (maintain|raise|lower) the target range for the federal funds rate (?:by ([\d/-]+) percentage point )?(?:at|to) ([\d/-]+) to ([\d/-]+) percent/);
  if (!m) return null;
  const lo = fracNumber(m[3]!), hi = fracNumber(m[4]!);
  const action = m[1] === "maintain" ? "hold" : m[1] === "raise" ? "raise" : "cut";
  const bp = m[2] ? Math.round(fracNumber(m[2]) * 100) : action === "hold" ? 0 : null;
  return Number.isFinite(lo) && Number.isFinite(hi) ? { action, rate: hi, range: `${lo} to ${hi}`, bp } : null;
}

export function parseBocDecision(paragraphs: string[]): Decision | null {
  const text = paragraphs.join(" ");
  const m = text.match(/(increased|raised|reduced|lowered|cut|held|maintained) its target for the overnight rate (?:by (\d+) basis points )?(?:to|at) ([\d.]+)%/);
  if (!m) return null;
  const action = /increased|raised/.test(m[1]!) ? "raise" : /reduced|lowered|cut/.test(m[1]!) ? "cut" : "hold";
  return { action, rate: Number(m[3]), range: null, bp: m[2] ? Number(m[2]) : action === "hold" ? 0 : null };
}

const isFedStatement = (i: FeedItem) => /issues FOMC statement/i.test(i.title);
const isBocDecision = (i: FeedItem) => /policy rate/i.test(i.title) && /fad-press-release/.test(i.link);

/** "Waller, The Economic Outlook…" → speaker "Waller". */
function fedSpeech(i: FeedItem): Speech | null {
  if (!i.date) return null;
  const m = i.title.match(/^([A-Z][A-Za-z'’-]+), (.+)$/);
  return { bank: "fed", date: i.date, title: m ? m[2]! : i.title, speaker: m ? m[1]! : null, about: i.description.slice(0, 300), url: i.link };
}
function bocSpeech(i: FeedItem): Speech | null {
  if (!i.date) return null;
  const who = i.description.match(/(Governor|Senior Deputy Governor|Deputy Governor) ([A-Z][a-z]+ [A-Z][a-zA-Z'’-]+)/);
  return { bank: "boc", date: i.date, title: i.title.replace(/^Speech: /, ""), speaker: who ? `${who[1]} ${who[2]}` : null, about: i.description.slice(0, 300), url: i.link };
}

/* ---------- capture ---------- */

const empty = <T>(): Record<DocBank, T[]> => ({ fed: [], boc: [] });

/**
 * Reads both banks' feeds; fetches a statement page only when that statement isn't stored yet, so a
 * normal run is four feed reads. Keeps the last good copy of anything that fails.
 */
export async function captureDocs(env: CaptureEnv, prev: DocsFile | null): Promise<DocsFile> {
  const [fedM, fedS, bocP, bocS] = await Promise.all([DOC_SOURCES.fedMonetary, DOC_SOURCES.fedSpeeches, DOC_SOURCES.bocPress, DOC_SOURCES.bocSpeeches].map((u) => env.get(u).catch(() => "")));
  const statements = empty<Statement>();
  const speeches = empty<Speech>();
  const plan: [DocBank, string, (i: FeedItem) => boolean, (h: string) => string[], (p: string[]) => Decision | null][] = [
    ["fed", fedM!, isFedStatement, extractFedStatement, parseFedDecision],
    ["boc", bocP!, isBocDecision, extractBocStatement, parseBocDecision],
  ];
  for (const [bank, xml, pick, extract, decide] of plan) {
    const known = new Map((prev?.statements[bank] ?? []).map((s) => [s.url, s]));
    const items = parseFeed(xml).filter(pick).filter((i) => i.date).sort((a, b) => b.date!.localeCompare(a.date!)).slice(0, 2);
    for (const item of items) {
      const kept = known.get(item.link);
      if (kept) { statements[bank].push(kept); continue; }
      const html = await env.get(item.link).catch(() => "");
      const paragraphs = html ? extract(html) : [];
      if (paragraphs.length >= 2) statements[bank].push({ bank, date: item.date!, title: item.title, url: item.link, paragraphs, decision: decide(paragraphs), capturedAt: new Date(env.now).toISOString() });
      else env.log(`docs: ${bank} statement ${item.link} couldn't be read`);
    }
    // A feed that failed, or a page that couldn't be read: keep what was there.
    if (statements[bank].length < 2) {
      for (const s of prev?.statements[bank] ?? []) if (!statements[bank].some((x) => x.url === s.url)) statements[bank].push(s);
      statements[bank] = statements[bank].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 2);
    }
  }
  const fromFeed = (xml: string, make: (i: FeedItem) => Speech | null) => parseFeed(xml).map(make).filter((s): s is Speech => s != null).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  speeches.fed = fedS ? fromFeed(fedS, fedSpeech) : [];
  speeches.boc = bocS ? fromFeed(bocS, bocSpeech) : [];
  for (const bank of DOC_BANKS) if (!speeches[bank].length) speeches[bank] = prev?.speeches[bank] ?? [];
  return { schema: DOCS_SCHEMA, generatedAt: new Date(env.now).toISOString(), statements, speeches };
}

export function readDocsFile(body: unknown): DocsFile | null {
  const b = body as Partial<DocsFile> | null;
  if (!b || b.schema !== DOCS_SCHEMA || typeof b.generatedAt !== "string" || !b.statements || !b.speeches) return null;
  const okS = (s: Statement) => DOC_BANKS.includes(s.bank) && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && /^https:\/\//.test(s.url) && Array.isArray(s.paragraphs) && s.paragraphs.every((p) => typeof p === "string");
  const okP = (s: Speech) => DOC_BANKS.includes(s.bank) && /^\d{4}-\d{2}-\d{2}$/.test(s.date) && /^https:\/\//.test(s.url) && typeof s.title === "string";
  const statements = empty<Statement>(), speeches = empty<Speech>();
  for (const bank of DOC_BANKS) {
    statements[bank] = (Array.isArray(b.statements[bank]) ? b.statements[bank] : []).filter(okS);
    speeches[bank] = (Array.isArray(b.speeches[bank]) ? b.speeches[bank] : []).filter(okP);
  }
  return { schema: DOCS_SCHEMA, generatedAt: b.generatedAt, statements, speeches };
}

/* ---------- reading: the wording diff and what the bank says it's watching ---------- */

export interface DiffPart { op: "same" | "added" | "removed"; text: string }

/** Word-level difference between two texts (longest common subsequence), merged into runs. */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = before.split(/\s+/).filter(Boolean), b = after.split(/\s+/).filter(Boolean);
  const n = a.length, m = b.length;
  // Lengths of the common subsequence from each position to the end, in one flat table.
  const L = new Uint16Array((n + 1) * (m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i * (m + 1) + j] = a[i] === b[j] ? L[(i + 1) * (m + 1) + j + 1]! + 1 : Math.max(L[(i + 1) * (m + 1) + j]!, L[i * (m + 1) + j + 1]!);
  const parts: DiffPart[] = [];
  const push = (op: DiffPart["op"], w: string) => { const last = parts[parts.length - 1]; if (last && last.op === op) last.text += " " + w; else parts.push({ op, text: w }); };
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { push("same", a[i]!); i++; j++; }
    else if (L[(i + 1) * (m + 1) + j]! >= L[i * (m + 1) + j + 1]!) push("removed", a[i++]!);
    else push("added", b[j++]!);
  }
  while (i < n) push("removed", a[i++]!);
  while (j < m) push("added", b[j++]!);
  return parts;
}

/** The changes, each with a few words of unchanged context before it, for reading. */
export function changesInContext(parts: DiffPart[], contextWords = 6): { before: string; removed: string; added: string }[] {
  const out: { before: string; removed: string; added: string }[] = [];
  for (let k = 0; k < parts.length; k++) {
    const p = parts[k]!;
    if (p.op === "same") continue;
    const prevSame = parts[k - 1]?.op === "same" ? parts[k - 1]!.text.split(" ") : [];
    const change = { before: prevSame.slice(-contextWords).join(" "), removed: "", added: "" };
    while (k < parts.length && parts[k]!.op !== "same") {
      if (parts[k]!.op === "removed") change.removed += (change.removed ? " " : "") + parts[k]!.text;
      else change.added += (change.added ? " " : "") + parts[k]!.text;
      k++;
    }
    k--;
    out.push(change);
  }
  return out;
}

/** Sentences in which the bank says what it is watching or weighing; quoted as written. */
const WATCH = /\b(will (continue to )?(monitor|assess|evaluate|consider)|will help the (Committee|Governing Council) (determine|assess|judge)|determine the (policy stance|extent and timing)|closely (monitor|watch)|carefully (assess|consider|monitor)|attentive to|incoming data|balance of risks|risks? (to|that|around)|reduce the risk|subject to (considerable |significant )?uncertainty|(Governing Council|Committee) (is|will be) (watching|monitoring|assessing|focused|looking)|prepared to (adjust|act))\b/i;
export function watchingSentences(paragraphs: string[], max = 5): string[] {
  return paragraphs
    .flatMap((p) => p.split(/(?<=[.!?])\s+(?=[A-Z“"])/))
    .map((s) => s.trim())
    .filter((s) => WATCH.test(s))
    .slice(0, max);
}

/* ---------- when to look, and whether anything changed ---------- */

/** From two minutes before a scheduled Fed or Bank of Canada decision to three hours after. */
export function decisionWindow(economy: EconomyFile, now: number): boolean {
  return economy.calendar.events.some((e) => {
    if (e.institution !== "Federal Reserve" && e.institution !== "Bank of Canada") return false;
    const t = Date.parse(decisionTime(e));
    return now >= t - 2 * 60_000 && now <= t + 3 * 60 * 60_000;
  });
}

/** True when a statement or speech was added or dropped (by address); a new capture time alone isn't a change. */
export function docsChanged(prev: DocsFile, next: DocsFile): boolean {
  const key = (f: DocsFile) => DOC_BANKS.map((b) => [...f.statements[b], ...f.speeches[b]].map((d) => d.url).join("|")).join("#");
  return key(prev) !== key(next);
}

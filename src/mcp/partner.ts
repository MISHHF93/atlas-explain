/**
 * The partner sandbox (docs/PARTNER_API.md): ATLAS Explain's explanations and sourced official figures for
 * other companies' apps and agents, under a partner key.
 *
 *   - REST at /api/v1/…: JSON with what must be credited, education only.
 *   - The same connector at /mcp, identified by "Authorization: Bearer atlx_…"; the public connector stays
 *     free and keyless.
 *   - Crypto prices are left out everywhere (Kraken's and CoinGecko's terms don't allow redistribution).
 *
 * Keys are stored only as SHA-256 hashes (KV "partners/keys/<hash>"), issued by scripts/partners/issue-key.mjs.
 * Each key has a daily call limit, counted in this Worker instance and written to KV every 25 calls or
 * 5 minutes, so usage stays inside the free plan's 1,000 KV writes a day; the limit is approximate by design.
 */
import { searchTerms } from "../core/terms";
import { EDUCATION_LINE, compareCountries, economySnapshot, evidenceBrief, moneyMathsTool, notableToday, officialFigures, scamRedFlags, treasuryAuctions, upcomingEvents, type Fetcher, type ToolResult } from "./server";
import { comingUp } from "../core/coming-up";
import { eventIcs } from "../core/scenarios";
import { readEconomyFile } from "../data/economy";
import { ECONOMY_DATA_URL } from "../core/links";

export const API_PREFIX = "/api/v1";
export const API_VERSION = "v1-sandbox";
const KEY_PATTERN = /^atlx_(sbx|live)_[A-Za-z0-9]{32}$/;
/** Tools a partner key can't use: crypto prices aren't licensed for redistribution. */
export const PARTNER_HIDDEN_TOOLS: ReadonlySet<string> = new Set(["crypto_prices", "price_history", "market_depth"]);
const FLUSH_EVERY = 25;
const FLUSH_AFTER_MS = 5 * 60_000;

export interface PartnerRecord {
  name: string;
  tier: "sandbox" | "pilot";
  dailyLimit: number;
  createdAt: string;
  active: boolean;
}
export interface PartnerStore {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}
interface Ctx {
  waitUntil(p: Promise<unknown>): void;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
const json = (body: unknown, status = 200, extra: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...extra } });
const problem = (status: number, code: string, message: string): Response => json({ error: { code, message }, meta: { apiVersion: API_VERSION, educationOnly: true } }, status);

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- keys and limits ---------- */

const records = new Map<string, { record: PartnerRecord | null; at: number }>();
const usage = new Map<string, { day: string; count: number; flushed: number; at: number }>();

/** For tests: forget what this instance remembers. */
export function resetPartnerCaches(): void {
  records.clear();
  usage.clear();
}

export function bearer(request: Request): string | null {
  const h = request.headers.get("Authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1]! : null;
}

async function lookup(store: PartnerStore, hash: string, now: number): Promise<PartnerRecord | null> {
  const cached = records.get(hash);
  if (cached && now - cached.at < 5 * 60_000) return cached.record;
  const raw = await store.get(`partners/keys/${hash}`).catch(() => null);
  const parse = (): PartnerRecord | null => {
    try {
      const r = raw ? (JSON.parse(raw) as PartnerRecord) : null;
      return r && r.active && typeof r.name === "string" && Number.isFinite(r.dailyLimit) ? r : null;
    } catch {
      return null;
    }
  };
  const record = parse();
  records.set(hash, { record, at: now });
  return record;
}

export type Admission = { ok: true; partner: PartnerRecord; hash: string; remaining: number } | { ok: false; response: Response };

/** Checks the key and counts the call against today's limit. */
export async function admit(request: Request, store: PartnerStore, ctx: Ctx | undefined, now = Date.now()): Promise<Admission> {
  const key = bearer(request);
  if (!key) return { ok: false, response: problem(401, "missing_key", "Send your partner key as 'Authorization: Bearer atlx_…'. The public connector at /mcp needs no key.") };
  if (!KEY_PATTERN.test(key)) return { ok: false, response: problem(401, "invalid_key", "That isn't an ATLAS Explain partner key.") };
  const hash = await sha256Hex(key);
  const partner = await lookup(store, hash, now);
  if (!partner) return { ok: false, response: problem(401, "invalid_key", "This key isn't active. Ask ATLAS Explain for a new one.") };
  const day = new Date(now).toISOString().slice(0, 10);
  let u = usage.get(hash);
  if (!u || u.day !== day) {
    const stored = Number(await store.get(`partners/usage/${hash}/${day}`).catch(() => null)) || 0;
    u = { day, count: stored, flushed: stored, at: now };
    usage.set(hash, u);
  }
  if (u.count >= partner.dailyLimit) {
    return { ok: false, response: json({ error: { code: "daily_limit", message: `This key's limit of ${partner.dailyLimit} calls a day is used up. It resets at midnight UTC.` } }, 429, { "Retry-After": String(Math.ceil((Date.parse(`${day}T00:00:00Z`) + 86_400_000 - now) / 1000)) }) };
  }
  u.count += 1;
  if (u.count - u.flushed >= FLUSH_EVERY || now - u.at >= FLUSH_AFTER_MS) {
    const write = store.put(`partners/usage/${hash}/${day}`, String(u.count), { expirationTtl: 40 * 86_400 }).catch(() => undefined);
    u.flushed = u.count;
    u.at = now;
    if (ctx) ctx.waitUntil(write);
  }
  return { ok: true, partner, hash, remaining: partner.dailyLimit - u.count };
}

/* ---------- REST ---------- */

const ENDPOINTS = [
  { method: "GET", path: "/api/v1/terms?q=", what: "Plain-language market and economics terms from the ATLAS Explain glossary." },
  { method: "GET", path: "/api/v1/brief/{asset}", what: "An evidence brief on a stock, ETF, currency, rate or commodity: sourced facts and what they don't tell you. Not crypto." },
  { method: "GET", path: "/api/v1/notable", what: "What stands out in today's official data, each item with the rule that picked it. Crypto moves left out." },
  { method: "GET", path: "/api/v1/calendar?only=rates|data&format=json|ics", what: "Upcoming rate decisions and US data releases with exact times and 'if this happens' explainers." },
  { method: "GET", path: "/api/v1/economy?topic=", what: "Inflation, jobs, policy rates and US debt from official sources." },
  { method: "GET", path: "/api/v1/countries?indicator=&countries=", what: "GDP growth, inflation, unemployment and GDP per person for the G20 (World Bank, CC BY 4.0)." },
  { method: "GET", path: "/api/v1/auctions?kind=", what: "US Treasury auctions, announced and recent results (TreasuryDirect)." },
  { method: "GET", path: "/api/v1/figures?q=", what: "Official figures: Treasury yields, ECB and Bank of Canada rates, EIA energy, SEC-filed company figures." },
  { method: "POST", path: "/api/v1/scam-check", what: "Body {\"text\": \"…\"}: which investment-fraud warning signs a message shows, where to check and report." },
  { method: "POST", path: "/api/v1/money", what: "Body like money_maths' inputs: compound growth, fees, inflation or diversification from given numbers." },
] as const;

const CREDIT: Record<string, string[]> = {
  terms: ["ATLAS Explain glossary"],
  brief: ["Each fact names its source; show it with the fact"],
  notable: ["Each item names its source; show it with the item"],
  calendar: ["Federal Reserve, European Central Bank, Bank of Canada and Bank of England calendars", "U.S. Bureau of Labor Statistics release calendar"],
  economy: ["Each figure names its source (BLS, New York Fed, ECB, Bank of Canada, Bank of England, US Treasury)"],
  countries: ["World Bank, World Development Indicators (CC BY 4.0)"],
  auctions: ["TreasuryDirect, U.S. Department of the Treasury"],
  figures: ["Each figure names its source"],
  "scam-check": ["SEC Investor.gov and FINRA (linked per warning sign)"],
  money: ["Arithmetic on the numbers given"],
};

function envelope(name: string, result: ToolResult, remaining: number): Response {
  const { notice: _n, ...data } = (result.structuredContent ?? {}) as Record<string, unknown>;
  if (result.isError) return json({ error: { code: "not_available", message: result.content[0]?.text.split("\n\n")[0] ?? "Not available." }, meta: meta(name) }, 404, { "X-RateLimit-Remaining": String(remaining) });
  return json({ data, meta: meta(name) }, 200, { "X-RateLimit-Remaining": String(remaining) });
}
function meta(name: string) {
  return {
    apiVersion: API_VERSION,
    generatedAt: new Date().toISOString(),
    educationOnly: true,
    notice: EDUCATION_LINE,
    credit: CREDIT[name] ?? [],
    terms: "https://github.com/MISHHF93/atlas-explain/blob/main/docs/PARTNER_API.md",
  };
}

/** Handles /api/v1 and /api/v1/… . */
export async function handlePartnerApi(request: Request, store: PartnerStore, fetcher: Fetcher, ctx?: Ctx, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const route = url.pathname.slice(API_PREFIX.length).replace(/^\/+|\/+$/g, "");
  // The index is public: what exists, and how to ask for a key.
  if (!route) return json({ apiVersion: API_VERSION, about: "ATLAS Explain partner sandbox: education-only explanations and sourced official figures. Send 'Authorization: Bearer atlx_…'.", endpoints: ENDPOINTS, docs: meta("index").terms });
  const gate = await admit(request, store, ctx, now);
  if (!gate.ok) return gate.response;
  const q = (k: string) => url.searchParams.get(k) ?? undefined;
  const [name, arg] = route.split("/", 2) as [string, string | undefined];
  const left = gate.remaining;
  const body = async (): Promise<Record<string, unknown>> => {
    try {
      const b = (await request.json()) as unknown;
      return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  };
  const want = (method: string) => request.method === method || (method === "GET" && request.method === "HEAD");
  switch (name) {
    case "terms": {
      if (!want("GET")) break;
      const hits = searchTerms(q("q") ?? "").slice(0, q("q") ? 10 : 100).map(({ id, title, summary, group }) => ({ id, title, summary, group }));
      return json({ data: { terms: hits }, meta: meta("terms") }, 200, { "X-RateLimit-Remaining": String(left) });
    }
    case "brief": {
      if (!want("GET") || !arg) break;
      const r = await evidenceBrief(decodeURIComponent(arg), fetcher, now);
      const cls = (r.structuredContent?.asset as { assetClass?: string } | undefined)?.assetClass;
      if (cls === "crypto") return problem(403, "not_licensed", "Crypto prices come from sources that don't allow redistribution, so briefs on coins aren't offered here.");
      return envelope("brief", r, left);
    }
    case "notable": {
      if (!want("GET")) break;
      const r = await notableToday(fetcher, now);
      const sc = r.structuredContent as { observations?: { kind: string }[] } | undefined;
      if (sc?.observations) sc.observations = sc.observations.filter((o) => o.kind !== "crypto_move");
      return envelope("notable", r, left);
    }
    case "calendar": {
      if (!want("GET")) break;
      if (q("format") === "ics") {
        const raw = await fetcher(ECONOMY_DATA_URL).then((res) => (res.ok ? res.json() : null)).catch(() => null);
        const file = raw ? readEconomyFile(raw) : null;
        if (!file) return problem(503, "not_available", "The calendar couldn't be loaded right now.");
        const events = comingUp(file, now, 20).filter((e) => !q("only") || (q("only") === "rates" ? e.kind === "rate_decision" : e.kind !== "rate_decision"));
        const ics = events.map((e) => eventIcs({ title: e.title, time: e.time, about: e.about, sourceUrl: e.sourceUrl, uid: e.id }))
          .map((one) => one.replace(/^BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:[^\r]*\r\n|END:VCALENDAR\r\n$/g, ""))
          .join("");
        return new Response(`BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ATLAS Explain//Partner calendar//EN\r\n${ics}END:VCALENDAR\r\n`, { headers: { ...CORS, "Content-Type": "text/calendar; charset=utf-8", "X-RateLimit-Remaining": String(left) } });
      }
      return envelope("calendar", await upcomingEvents(q("only"), fetcher, now), left);
    }
    case "economy":
      if (want("GET")) return envelope("economy", await economySnapshot(q("topic"), fetcher, now), left);
      break;
    case "countries":
      if (want("GET")) return envelope("countries", await compareCountries(q("indicator"), q("countries"), fetcher), left);
      break;
    case "auctions":
      if (want("GET")) return envelope("auctions", await treasuryAuctions(q("kind"), fetcher, now), left);
      break;
    case "figures":
      if (want("GET")) return envelope("figures", await officialFigures(q("q"), fetcher, now), left);
      break;
    case "scam-check":
      if (want("POST")) {
        const b = await body();
        return envelope("scam-check", await scamRedFlags(typeof b.text === "string" ? b.text : undefined, fetcher, now), left);
      }
      break;
    case "money":
      if (want("POST")) return envelope("money", moneyMathsTool(await body()), left);
      break;
    default:
      return problem(404, "not_found", `No endpoint ${API_PREFIX}/${name}. See ${API_PREFIX} for the list.`);
  }
  return problem(405, "method_not_allowed", `Use ${ENDPOINTS.find((e) => e.path.startsWith(`${API_PREFIX}/${name}`))?.method ?? "GET"} for ${API_PREFIX}/${name}.`);
}

/* ---------- the connector, keyed ---------- */

/**
 * A partner's agent on /mcp: the key is checked and counted, crypto tools are hidden from tools/list and
 * refused in tools/call. Everything else is the public connector unchanged.
 */
export async function handlePartnerMcp(request: Request, store: PartnerStore, ctx: Ctx | undefined, next: (r: Request) => Promise<Response>, now = Date.now()): Promise<Response> {
  if (request.method !== "POST") return next(request);
  const gate = await admit(request, store, ctx, now);
  if (!gate.ok) return gate.response;
  const raw = await request.text();
  type Msg = { id?: unknown; method?: string; params?: { name?: string } };
  const parse = (): Msg | null => {
    try {
      const m = JSON.parse(raw) as unknown;
      return m && typeof m === "object" ? (m as Msg) : null;
    } catch {
      return null;
    }
  };
  const msg = parse();
  if (msg?.method === "tools/call" && msg.params?.name && PARTNER_HIDDEN_TOOLS.has(msg.params.name)) {
    return json({ jsonrpc: "2.0", id: msg.id ?? null, error: { code: -32602, message: `${msg.params.name} isn't available to partner keys: crypto prices aren't licensed for redistribution.` } });
  }
  const res = await next(new Request(request.url, { method: "POST", headers: request.headers, body: raw }));
  if (msg?.method !== "tools/list" || !res.ok) return res;
  const out = (await res.json()) as { result?: { tools?: { name: string }[] } };
  if (out.result?.tools) out.result.tools = out.result.tools.filter((t) => !PARTNER_HIDDEN_TOOLS.has(t.name));
  return new Response(JSON.stringify(out), { status: res.status, headers: res.headers });
}

/**
 * One normalized Asset schema for every instrument class (docs/ux/MULTI_ASSET_CATALOG.md §2).
 * Pure types, validators and the provider registry. No network code, so the popup stays small.
 *
 * Rules enforced here, not just documented:
 * - A shown figure always carries a source, an attribution and a licence that allows display.
 * - No figure means `quote: null` plus a plain reason. Nothing is zero-filled or invented.
 * - No account-shaped fields, and no trade instructions in any text.
 */
import type { AssetView, CatalogView, LeanView } from "./assets";

export const ASSET_CLASSES = ["crypto", "stock", "etf", "index", "forex", "commodity", "future", "option", "rate"] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export type DataMode = "live" | "delayed" | "daily" | "reference" | "none";
export type SessionState = "open" | "closed" | "pre" | "post" | "always_open" | "unknown";

export interface Licence {
  status: "public_domain" | "free_with_attribution" | "licensed" | "unlicensed";
  /** Routing refuses any source where this is false. */
  displayAllowed: boolean;
  /** ATLAS may not train on the data unless this is true. */
  mlAllowed: boolean;
  note: string;
}

export interface SourceRef {
  providerId: string;
  label: string;
  attribution: { text: string; href: string };
  licence: Licence;
}

export interface Quote {
  value: number;
  change: number | null;
  changePct: number | null;
  changeWindow: string;
  asOf: string;
  mode: Exclude<DataMode, "none">;
  source: SourceRef;
}

export interface Fact {
  /** "figure": an official number; "filing": a recent filing. The page groups them. */
  kind?: "figure" | "filing";
  label: string;
  value: string;
  period: string | null;
  asOf: string | null;
  source: SourceRef;
}

export interface ModelInsight {
  modelId: string;
  assetId: string;
  horizon: string;
  output: { kind: "direction"; lean: "up" | "down" | "none" } | { kind: "range"; low: number; high: number; coverage: number };
  trackRecord: { resolved: number; hitRate: number | null; since: string; brierVsBase: number | null };
  confidence: number | null;
  /** Set by the model's own published evidence gate, never by this client. */
  clearedForPublic: boolean;
  reason: string;
  asOf: string;
}

export type AtlasStatus =
  | { state: "shown"; insights: ModelInsight[] }
  | { state: "withheld"; reason: string }
  | { state: "none" };

export type ClassData =
  | { class: "crypto"; base: string; quote: string }
  | { class: "stock" | "etf"; cik: string | null; exchange: string | null; etfCategory?: "index" | "sector" | "bond" | "commodity" | "other" }
  | { class: "index"; owner: string; constituents: number | null }
  | { class: "forex"; base: string; quote: string; derived: boolean }
  | { class: "commodity"; unit: string; benchmark: string; publishLagDays: number }
  | { class: "future"; underlying: string; contractSize: string; tick: string; expiryCycle: string; exchange: string }
  | { class: "option"; underlying: string; style: "american" | "european"; multiplier: number }
  | { class: "rate"; tenor: string; curve: string };

export interface Asset {
  id: string;
  symbol: string;
  name: string;
  class: AssetClass;
  venue: string | null;
  currency: string;
  country: string | null;
  session: { state: SessionState; hours: string | null; nextChange: string | null };
  quote: Quote | null;
  /** Required when quote is null: plain words for why no figure is shown. */
  noQuoteReason: string | null;
  facts: Fact[];
  status: AtlasStatus;
  relatedTerms: string[];
  classData: ClassData;
}

/* ---------- free sources and their licences (docs/ux/MULTI_ASSET_CATALOG.md §4) ---------- */

const free = (note: string): Licence => ({ status: "free_with_attribution", displayAllowed: true, mlAllowed: false, note });
const publicDomain = (note: string): Licence => ({ status: "public_domain", displayAllowed: true, mlAllowed: false, note });

export const SOURCES = {
  coingecko: { providerId: "coingecko", label: "CoinGecko", attribution: { text: "Prices by CoinGecko", href: "https://www.coingecko.com" }, licence: free("Free public API with required attribution. A commercial licence needs a paid plan.") },
  kraken: { providerId: "kraken", label: "Kraken", attribution: { text: "Prices: Kraken", href: "https://www.kraken.com" }, licence: { status: "unlicensed", displayAllowed: true, mlAllowed: false, note: "Demo only: Kraken's terms restrict third-party apps without written consent." } },
  ecb: { providerId: "ecb", label: "ECB reference rate", attribution: { text: "Source: European Central Bank", href: "https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html" }, licence: free("Free use if reproduced accurately with the ECB cited. For information, not transactions.") },
  boc: { providerId: "boc", label: "Bank of Canada", attribution: { text: "Source: Bank of Canada", href: "https://www.bankofcanada.ca/terms/" }, licence: free("Free to use, copy and distribute with attribution.") },
  us_treasury: { providerId: "us_treasury", label: "US Treasury", attribution: { text: "Source: U.S. Department of the Treasury", href: "https://home.treasury.gov/policy-issues/financing-the-government/interest-rate-statistics" }, licence: publicDomain("US federal government data.") },
  eia: { providerId: "eia", label: "EIA", attribution: { text: "Source: U.S. Energy Information Administration", href: "https://www.eia.gov/" }, licence: publicDomain("US government data, public domain; credit EIA.") },
  sec_edgar: { providerId: "sec_edgar", label: "SEC filings", attribution: { text: "Source: SEC EDGAR", href: "https://www.sec.gov/edgar/search/" }, licence: publicDomain("US government data; fair access at most 10 requests a second.") },
  gdelt: { providerId: "gdelt", label: "GDELT", attribution: { text: "News index: The GDELT Project", href: "https://www.gdeltproject.org/" }, licence: free("Open for commercial use with a citation and link to the GDELT Project.") },
} as const satisfies Record<string, SourceRef>;

export type SourceId = keyof typeof SOURCES;

/* ---------- validation (the contract every adapter and data file must meet) ---------- */

const ID = /^(crypto|stock|etf|index|fx|commodity|future|option|rate):[A-Z0-9:._/-]{1,40}$/;
const CURRENCY = /^([A-Z]{3}|%)$/;
const ACCOUNT_KEY = /balance|account|portfolio|pnl|password|secret|token|buying.?power/i;
const TRADE_WORDS = /\b(buy|sell|you should)\b/i;
/** Allowed clock skew between a source and this device. */
const SKEW_MS = 5 * 60_000;

export interface Validation {
  ok: boolean;
  errors: string[];
}

export function validateSource(source: SourceRef | undefined, at: string): string[] {
  if (!source) return [`${at}: missing source`];
  const errors: string[] = [];
  if (!source.providerId || !source.label) errors.push(`${at}: source needs an id and a label`);
  if (!source.attribution?.text || !/^https:\/\//.test(source.attribution?.href ?? "")) errors.push(`${at}: attribution needs text and an https link`);
  if (!source.licence?.displayAllowed) errors.push(`${at}: licence does not allow display`);
  return errors;
}

function validTime(value: string | null | undefined, now: number): boolean {
  if (!value) return false;
  const t = Date.parse(value);
  return Number.isFinite(t) && t <= now + SKEW_MS;
}

export function validateAsset(asset: Asset, now: number = Date.now()): Validation {
  const errors: string[] = [];
  if (!ID.test(asset.id)) errors.push(`id "${asset.id}" is not namespaced`);
  if (!asset.symbol || !asset.name) errors.push("symbol and name are required");
  if (!(ASSET_CLASSES as readonly string[]).includes(asset.class)) errors.push(`unknown class "${asset.class}"`);
  const listed = (c: string | undefined) => c === "stock" || c === "etf";
  const cd = asset.classData?.class;
  if (cd !== asset.class && !(listed(cd) && listed(asset.class))) errors.push("classData does not match class");
  if (!CURRENCY.test(asset.currency)) errors.push(`currency "${asset.currency}" is not ISO 4217 or %`);

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
  if (asset.status.state === "shown" && asset.status.insights.some((x) => x.clearedForPublic !== true)) {
    errors.push("an insight that is not cleared for public use is marked shown");
  }
  for (const key of keysDeep(asset)) if (ACCOUNT_KEY.test(key)) errors.push(`account-shaped field "${key}"`);
  for (const text of stringsDeep(asset)) {
    if (TRADE_WORDS.test(text) && !/^https?:\/\//.test(text)) errors.push(`trade wording in "${text.slice(0, 60)}"`);
  }
  return { ok: errors.length === 0, errors };
}

function keysDeep(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keysDeep(v, out));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      out.push(k);
      keysDeep(v, out);
    }
  }
  return out;
}

function stringsDeep(value: unknown, out: string[] = []): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => stringsDeep(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => stringsDeep(v, out));
  return out;
}

/** Only insights a model has cleared for the public survive. Everything else becomes "withheld". */
export function publicStatus(insights: readonly ModelInsight[], withheldReason: string): AtlasStatus {
  const cleared = insights.filter((x) => x.clearedForPublic === true);
  if (cleared.length) return { state: "shown", insights: cleared };
  return insights.length ? { state: "withheld", reason: withheldReason } : { state: "none" };
}

/* ---------- provider registry and routing (§3.3) ---------- */

export interface ProviderAdapter {
  id: SourceId;
  classes: readonly AssetClass[];
  mode: Exclude<DataMode, "none">;
  costTier: "free" | "paid";
  /** Remote Config boolean that switches the adapter on. */
  flag: string;
  limits: { perMinute: number; batchSize: number };
  cacheTtlMs: number;
}

const MODE_RANK: Record<Exclude<DataMode, "none">, number> = { live: 0, delayed: 1, daily: 2, reference: 3 };

/**
 * Adapters that may price this class, best first: enabled by flag, licence allows display,
 * live before delayed before daily before reference, free before paid. An unlicensed (demo-only)
 * source is dropped once the product charges money.
 */
export function route(
  klass: AssetClass,
  adapters: readonly ProviderAdapter[],
  ctx: { flags: Readonly<Record<string, boolean>>; billingEnabled: boolean },
): ProviderAdapter[] {
  return adapters
    .filter((a) => a.classes.includes(klass))
    .filter((a) => ctx.flags[a.flag] === true)
    .filter((a) => SOURCES[a.id].licence.displayAllowed)
    .filter((a) => !(ctx.billingEnabled && SOURCES[a.id].licence.status === "unlicensed"))
    .sort((a, b) => MODE_RANK[a.mode] - MODE_RANK[b.mode] || (a.costTier === b.costTier ? 0 : a.costTier === "free" ? -1 : 1));
}

/** Plain reasons shown when a class has no source we may display (§3.3). */
export const NO_QUOTE_REASON: Record<AssetClass, string> = {
  crypto: "This price is unavailable right now. We'll try again shortly.",
  stock: "Price not shown. Free stock prices aren't licensed for public display. The company's official figures from its SEC filings are below.",
  etf: "Price not shown. Free fund prices aren't licensed for public display. The fund's official filings are below.",
  index: "Index levels are owned by the index provider and need its permission to show. Here's what the index measures and how it's built.",
  forex: "This rate is unavailable right now. We'll try again shortly.",
  commodity: "Price not shown. This benchmark price is licensed. Here's how this market works.",
  future: "Live contract prices need an exchange licence. Here are the contract's official specs and how it works.",
  option: "Live option prices need an exchange licence. Here's how options work.",
  rate: "This rate is unavailable right now. We'll try again shortly.",
};

/* ---------- today's crypto rows on the new schema (used by M2) ---------- */

/**
 * Maps one public live-price row (Kraken or CoinGecko) onto the Asset schema.
 * ATLAS rows return null: they come from owner-only feeds and never enter the public catalog.
 */
export function assetFromLiveRow(view: AssetView, source: CatalogView["source"]): Asset | null {
  if (source !== "coingecko" && source !== "kraken") return null;
  if (view.klass !== "crypto") return null;
  const ref = SOURCES[source];
  const q = view.quote;
  const quote: Quote | null = q.price != null && q.price > 0 && q.asOf
    ? { value: q.price, change: null, changePct: q.changePct, changeWindow: q.changeWindow || "over 24 hours", asOf: q.asOf, mode: "live", source: ref }
    : null;
  const base = view.symbol.replace(/-USD$/, "");
  return {
    id: `crypto:${base}`,
    symbol: base,
    name: view.name,
    class: "crypto",
    venue: ref.label,
    currency: "USD",
    country: null,
    session: { state: "always_open", hours: "24/7", nextChange: null },
    quote,
    noQuoteReason: quote ? null : NO_QUOTE_REASON.crypto,
    facts: [],
    status: statusFromLean(view.light),
    relatedTerms: ["spread", "volume", "implied_volatility"],
    classData: { class: "crypto", base, quote: "USD" },
  };
}

/** A grey (uncleared) light is withheld, with its reason; the public feeds never carry a cleared lean. */
function statusFromLean(light: LeanView): AtlasStatus {
  if (light.colour === "grey") return { state: "withheld", reason: "ATLAS predictions aren't cleared for public use." };
  return { state: "withheld", reason: "Shown only from ATLAS's own cleared models." };
}

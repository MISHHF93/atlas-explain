/**
 * Explainer pages for instruments we may not price for free (docs/ux/MULTI_ASSET_CATALOG.md §5.4, M5):
 * the main stock indices, common futures contracts and options. No levels or prices are shown:
 * index values are licensed by their owners, and live futures and options data needs exchange licences.
 *
 * Every fact is a published contract or index specification, restated in our own words and linked
 * to the owner's public page. Shipped with the app, so these pages work even when no feed answers.
 */
import { NO_QUOTE_REASON, type Asset, type Fact, type SourceRef } from "./asset-schema";

function owner(label: string, href: string): SourceRef {
  return {
    providerId: "specs",
    label,
    attribution: { text: `Details: ${label}`, href },
    licence: { status: "free_with_attribution", displayAllowed: true, mlAllowed: false, note: "Published specifications, restated in our own words and linked to the owner's page." },
  };
}

const fact = (label: string, value: string, source: SourceRef): Fact => ({ kind: "figure", label, value, period: null, asOf: null, source });

const SPDJI = (path: string) => owner("S&P Dow Jones Indices", `https://www.spglobal.com/spdji/en/indices/${path}`);
const NASDAQ = owner("Nasdaq", "https://www.nasdaq.com/solutions/global-indexes/nasdaq-100");
const CBOE_VIX = owner("Cboe", "https://www.cboe.com/tradable_products/vix/");
const RUSSELL = owner("FTSE Russell", "https://www.lseg.com/en/ftse-russell/indices/russell-us");
const CME = (path: string, label = "CME Group") => owner(label, `https://www.cmegroup.com/markets/${path}`);
const CBOE_SPX = owner("Cboe", "https://www.cboe.com/tradable_products/sp_500/spx_options/");
const OCC = owner("The Options Industry Council", "https://www.optionseducation.org/optionsoverview/what-is-an-option");

const base = {
  quote: null,
  status: { state: "none" } as const,
};

function index(input: { symbol: string; name: string; country: string; currency: string; owner: string; members: number | null; source: SourceRef; facts: [string, string][]; terms?: string[] }): Asset {
  return {
    ...base,
    id: `index:${input.symbol}`,
    symbol: input.symbol,
    name: input.name,
    class: "index",
    venue: null,
    currency: input.currency,
    country: input.country,
    session: { state: "unknown", hours: null, nextChange: null },
    noQuoteReason: NO_QUOTE_REASON.index,
    facts: input.facts.map(([l, v]) => fact(l, v, input.source)),
    relatedTerms: input.terms ?? ["index", "etf"],
    classData: { class: "index", owner: input.owner, constituents: input.members },
  };
}

function future(input: { symbol: string; name: string; underlying: string; size: string; tick: string; expiries: string; exchange: string; hours: string; settlement: string; source: SourceRef; terms?: string[] }): Asset {
  return {
    ...base,
    id: `future:${input.symbol}`,
    symbol: input.symbol,
    name: input.name,
    class: "future",
    venue: input.exchange,
    currency: "USD",
    country: "US",
    session: { state: "unknown", hours: input.hours, nextChange: null },
    noQuoteReason: NO_QUOTE_REASON.future,
    facts: [
      fact("Contract size", input.size, input.source),
      fact("Smallest price step", input.tick, input.source),
      fact("Expiry months", input.expiries, input.source),
      fact("At expiry", input.settlement, input.source),
    ],
    relatedTerms: input.terms ?? ["futures_contract", "expiry", "margin"],
    classData: { class: "future", underlying: input.underlying, contractSize: input.size, tick: input.tick, expiryCycle: input.expiries, exchange: input.exchange },
  };
}

const GLOBEX_HOURS = "Sunday to Friday, almost 24 hours a day, with a daily one-hour break (CME Globex)";

export const EDUCATION_ASSETS: readonly Asset[] = [
  index({
    symbol: "SPX", name: "S&P 500", country: "US", currency: "USD", owner: "S&P Dow Jones Indices", members: 500, source: SPDJI("equity/sp-500/"),
    facts: [["What it tracks", "About 500 of the largest US companies, chosen by a committee"], ["How it's weighted", "By the market value of shares available to trade"], ["First published", "1957"]],
  }),
  index({
    symbol: "DJI", name: "Dow Jones Industrial Average", country: "US", currency: "USD", owner: "S&P Dow Jones Indices", members: 30, source: SPDJI("equity/dow-jones-industrial-average/"),
    facts: [["What it tracks", "30 large, well-known US companies"], ["How it's weighted", "By share price, so higher-priced shares count for more"], ["First published", "1896"]],
  }),
  index({
    symbol: "NDX", name: "Nasdaq-100", country: "US", currency: "USD", owner: "Nasdaq", members: 100, source: NASDAQ,
    facts: [["What it tracks", "The 100 largest non-financial companies listed on the Nasdaq exchange"], ["How it's weighted", "By market value, with caps so no single company dominates"], ["First published", "1985"]],
  }),
  index({
    symbol: "RUT", name: "Russell 2000", country: "US", currency: "USD", owner: "FTSE Russell", members: 2000, source: RUSSELL,
    facts: [["What it tracks", "About 2,000 smaller US companies"], ["How it's weighted", "By the market value of shares available to trade"], ["Why people follow it", "A common gauge of small US companies, next to large-company indices like the S&P 500"]],
  }),
  index({
    symbol: "TSX", name: "S&P/TSX Composite", country: "CA", currency: "CAD", owner: "S&P Dow Jones Indices (with TMX Group)", members: null, source: SPDJI("equity/sp-tsx-composite-index/"),
    facts: [["What it tracks", "The largest companies on the Toronto Stock Exchange; the number of members changes over time"], ["How it's weighted", "By the market value of shares available to trade"]],
  }),
  index({
    symbol: "VIX", name: "Cboe Volatility Index (VIX)", country: "US", currency: "%", owner: "Cboe", members: null, source: CBOE_VIX,
    facts: [["What it measures", "How much movement the options market expects in the S&P 500 over the next 30 days, as a yearly percentage"], ["How it's built", "From the prices of S&P 500 index options"], ["How to read it", "A higher number means larger expected swings, in either direction; it is often called the market's fear gauge"]],
    terms: ["implied_volatility", "call_put", "index"],
  }),
  future({
    symbol: "ES", name: "E-mini S&P 500 futures", underlying: "S&P 500 index", size: "$50 × the S&P 500 index", tick: "0.25 index points ($12.50)",
    expiries: "March, June, September, December", exchange: "CME", hours: GLOBEX_HOURS, settlement: "Settled in cash, not by delivering shares",
    source: CME("equities/sp/e-mini-sandp500.contractSpecs.html"), terms: ["futures_contract", "expiry", "index"],
  }),
  future({
    symbol: "MES", name: "Micro E-mini S&P 500 futures", underlying: "S&P 500 index", size: "$5 × the S&P 500 index (one-tenth of the E-mini)", tick: "0.25 index points ($1.25)",
    expiries: "March, June, September, December", exchange: "CME", hours: GLOBEX_HOURS, settlement: "Settled in cash",
    source: CME("equities/sp/micro-e-mini-sandp-500.contractSpecs.html"), terms: ["futures_contract", "expiry", "index"],
  }),
  future({
    symbol: "CL", name: "Crude oil futures (WTI)", underlying: "West Texas Intermediate crude oil", size: "1,000 barrels", tick: "$0.01 per barrel ($10)",
    expiries: "Every month", exchange: "NYMEX (CME Group)", hours: GLOBEX_HOURS, settlement: "Physical delivery of oil at Cushing, Oklahoma",
    source: CME("energy/crude-oil/light-sweet-crude.contractSpecs.html"),
  }),
  future({
    symbol: "NG", name: "Natural gas futures (Henry Hub)", underlying: "Natural gas delivered at Henry Hub, Louisiana", size: "10,000 million BTU", tick: "$0.001 per million BTU ($10)",
    expiries: "Every month", exchange: "NYMEX (CME Group)", hours: GLOBEX_HOURS, settlement: "Physical delivery at Henry Hub",
    source: CME("energy/natural-gas/natural-gas.contractSpecs.html"),
  }),
  future({
    symbol: "GC", name: "Gold futures", underlying: "Gold", size: "100 troy ounces", tick: "$0.10 per troy ounce ($10)",
    expiries: "Most active: February, April, June, August, October, December", exchange: "COMEX (CME Group)", hours: GLOBEX_HOURS, settlement: "Physical delivery of gold",
    source: CME("metals/precious/gold.contractSpecs.html"),
  }),
  future({
    symbol: "ZN", name: "10-Year US Treasury Note futures", underlying: "US Treasury notes", size: "$100,000 face value", tick: "Half of 1/32 of a point ($15.625)",
    expiries: "March, June, September, December", exchange: "CBOT (CME Group)", hours: GLOBEX_HOURS, settlement: "Physical delivery of eligible Treasury notes",
    source: CME("interest-rates/us-treasury/10-year-us-treasury-note.contractSpecs.html"), terms: ["futures_contract", "yield", "expiry"],
  }),
  {
    ...base,
    id: "option:EQUITY",
    symbol: "STOCK-OPTIONS",
    name: "Stock options (US)",
    class: "option",
    venue: "US options exchanges",
    currency: "USD",
    country: "US",
    session: { state: "unknown", hours: "Mon–Fri, 9:30 am–4:00 pm New York time", nextChange: null },
    noQuoteReason: NO_QUOTE_REASON.option,
    facts: [
      fact("Shares per contract", "100", OCC),
      fact("Style", "American: may be exercised on any trading day up to expiry", OCC),
      fact("Standard expiry", "The third Friday of the month, with many weekly expiries as well", OCC),
      fact("Settlement", "By delivering shares", OCC),
    ],
    relatedTerms: ["call_put", "strike", "greeks", "expiry"],
    classData: { class: "option", underlying: "individual US stocks", style: "american", multiplier: 100 },
  },
  {
    ...base,
    id: "option:SPX",
    symbol: "SPX-OPTIONS",
    name: "S&P 500 index options (SPX)",
    class: "option",
    venue: "Cboe",
    currency: "USD",
    country: "US",
    session: { state: "unknown", hours: "Mon–Fri, 9:30 am–4:15 pm New York time, plus extended sessions", nextChange: null },
    noQuoteReason: NO_QUOTE_REASON.option,
    facts: [
      fact("Contract value", "$100 × the S&P 500 index", CBOE_SPX),
      fact("Style", "European: exercised only at expiry", CBOE_SPX),
      fact("Settlement", "In cash, not by delivering shares", CBOE_SPX),
    ],
    relatedTerms: ["call_put", "strike", "greeks", "index"],
    classData: { class: "option", underlying: "S&P 500 index", style: "european", multiplier: 100 },
  },
];

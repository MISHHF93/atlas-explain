/**
 * Where to see a live price ATLAS Explain can't show itself (no free licence for stock, fund, index, futures or
 * option prices). A link to the official page is allowed; copying its numbers isn't. Every address here was
 * opened and checked on 19 Nov 2026 (some sites refuse automated checks but open normally in a browser).
 */
import { NO_QUOTE_REASON, type AssetClass } from "./asset-schema";

export interface PriceLink {
  /** Plain words for the link, for example "Live price on Nasdaq.com". */
  label: string;
  url: string;
}

/** Index and contract pages, by catalog symbol. */
const BY_SYMBOL: Record<string, PriceLink> = {
  SPX: { label: "Index level from S&P Dow Jones Indices", url: "https://www.spglobal.com/spdji/en/indices/equity/sp-500/" },
  DJI: { label: "Index level from S&P Dow Jones Indices", url: "https://www.spglobal.com/spdji/en/indices/equity/dow-jones-industrial-average/" },
  TSX: { label: "Index level from S&P Dow Jones Indices", url: "https://www.spglobal.com/spdji/en/indices/equity/sp-tsx-composite-index/" },
  NDX: { label: "Index level from Nasdaq", url: "https://indexes.nasdaqomx.com/Index/Overview/NDX" },
  RUT: { label: "Index information from FTSE Russell", url: "https://www.lseg.com/en/ftse-russell/indices/russell-us" },
  VIX: { label: "Index level from Cboe", url: "https://www.cboe.com/tradable_products/vix/" },
  ES: { label: "Contract prices at CME Group", url: "https://www.cmegroup.com/markets/equities/sp/e-mini-sandp500.html" },
  MES: { label: "Contract prices at CME Group", url: "https://www.cmegroup.com/markets/equities/sp/micro-e-mini-sandp-500.html" },
  CL: { label: "Contract prices at CME Group", url: "https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.html" },
  NG: { label: "Contract prices at CME Group", url: "https://www.cmegroup.com/markets/energy/natural-gas/natural-gas.html" },
  GC: { label: "Contract prices at CME Group", url: "https://www.cmegroup.com/markets/metals/precious/gold.html" },
  ZN: { label: "Contract prices at CME Group", url: "https://www.cmegroup.com/markets/interest-rates/us-treasury/10-year-us-treasury-note.html" },
  "SPX-OPTIONS": { label: "Option prices at Cboe", url: "https://www.cboe.com/tradable_products/sp_500/spx_options/" },
};

/**
 * The official page for an asset's live price, or null when ATLAS Explain shows the price itself or knows no
 * official page. Stocks and funds go to their listing exchange (from the SEC filing's exchange): Nasdaq.com
 * for Nasdaq listings, NYSE.com for NYSE listings (NYSE Arca for funds).
 */
export function officialPriceLink(asset: { symbol: string; class: AssetClass; venue: string | null }): PriceLink | null {
  const known = BY_SYMBOL[asset.symbol];
  if (known) return known;
  if (asset.class !== "stock" && asset.class !== "etf") return null;
  const venue = (asset.venue ?? "").toLowerCase();
  const sym = asset.symbol.trim();
  if (!/^[A-Z][A-Z0-9.]{0,9}$/.test(sym)) return null;
  if (venue.includes("nasdaq")) {
    return { label: "Live price on Nasdaq.com", url: `https://www.nasdaq.com/market-activity/${asset.class === "etf" ? "etf" : "stocks"}/${sym.toLowerCase().replace(".", "-")}` };
  }
  if (venue.includes("nyse") || venue.includes("arca")) {
    return { label: "Live price on NYSE.com", url: `https://www.nyse.com/quote/${asset.class === "etf" ? "ARCX" : "XNYS"}:${sym}` };
  }
  return null;
}

const LEGACY_NOTES: readonly string[] = [
  "Price not shown. Free stock prices aren't licensed for public display. The company's official figures from its SEC filings are below.",
  "Price not shown. Free fund prices aren't licensed for public display. The fund's official filings are below.",
  "Index levels are owned by the index provider and need its permission to show. Here's what the index measures and how it's built.",
  "Live contract prices need an exchange licence. Here are the contract's official specs and how it works.",
  "Live option prices need an exchange licence. Here's how options work.",
];

/** Why no price is shown, in the current wording, for a note stored with the earlier wording or none. */
export function noPriceNote(asset: { symbol: string; class: AssetClass; venue: string | null; noQuoteReason: string | null }): string {
  const stored = asset.noQuoteReason?.trim() ?? "";
  const current = NO_QUOTE_REASON[asset.class];
  const legacy = LEGACY_NOTES.find((l) => stored.startsWith(l));
  const note = legacy ? `${current}${stored.slice(legacy.length)}`.trim() : stored || current;
  // "the link opens it…" only when there is a link.
  return officialPriceLink(asset) ? note : note.replace(/; the link opens [^.]*\./, ".");
}

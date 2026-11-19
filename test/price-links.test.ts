import { describe, expect, it } from "vitest";
import { noPriceNote, officialPriceLink } from "../src/core/price-links";

describe("links to the official live price, and the note when no price is shown", () => {
  it("sends stocks and funds to their listing exchange, from the exchange in their SEC filing", () => {
    expect(officialPriceLink({ symbol: "AAPL", class: "stock", venue: "Nasdaq" })).toEqual({ label: "Live price on Nasdaq.com", url: "https://www.nasdaq.com/market-activity/stocks/aapl" });
    expect(officialPriceLink({ symbol: "BRK.B", class: "stock", venue: "NYSE" })!.url).toBe("https://www.nyse.com/quote/XNYS:BRK.B");
    expect(officialPriceLink({ symbol: "SPY", class: "etf", venue: "NYSE" })!.url).toBe("https://www.nyse.com/quote/ARCX:SPY");
    expect(officialPriceLink({ symbol: "ZZZ", class: "stock", venue: null })).toBeNull();
    expect(officialPriceLink({ symbol: "<script>", class: "stock", venue: "Nasdaq" })).toBeNull();
  });

  it("sends indices to their provider and futures to CME Group; nothing for what ATLAS prices itself", () => {
    expect(officialPriceLink({ symbol: "SPX", class: "index", venue: null })!.url).toContain("spglobal.com/spdji/en/indices/equity/sp-500");
    expect(officialPriceLink({ symbol: "CL", class: "future", venue: null })!.url).toContain("cmegroup.com");
    expect(officialPriceLink({ symbol: "EUR/USD", class: "forex", venue: "ECB" })).toBeNull();
    for (const sym of ["SPX", "DJI", "NDX", "RUT", "TSX", "VIX", "ES", "MES", "CL", "NG", "GC", "ZN", "SPX-OPTIONS"]) {
      expect(officialPriceLink({ symbol: sym, class: "index", venue: null })!.url, sym).toMatch(/^https:\/\//);
    }
  });

  it("leads with what is shown, rewords notes stored before, and only mentions the link when there is one", () => {
    const etf = noPriceNote({ symbol: "SPY", class: "etf", venue: "NYSE", noQuoteReason: "Price not shown. Free fund prices aren't licensed for public display. The fund's official filings are below. Holds the stocks of the S&P 500 index." });
    expect(etf).toBe("Shown here: the fund's official filings. Its live price isn't shown, because exchange prices need a licence ATLAS Explain doesn't have; the link opens it on the exchange's own site. Holds the stocks of the S&P 500 index.");
    const noLink = noPriceNote({ symbol: "ZZZ", class: "stock", venue: null, noQuoteReason: null });
    expect(noLink).toMatch(/^Shown here:/);
    expect(noLink).not.toContain("the link");
    expect(noPriceNote({ symbol: "BTC", class: "crypto", venue: null, noQuoteReason: "This price is unavailable right now. We'll try again shortly." })).toBe("This price is unavailable right now. We'll try again shortly.");
  });
});

# Multi-asset catalog

Status: **design approved in direction: free data only** (owner, 2026-11-13). The only money spent on this project is the US$5 Chrome Web Store registration. Every source in the launch plan below costs **$0**. Paid feeds are listed at the end only so the owner knows what each one would unlock later.

This turns `/app/assets` and `/app/assets/:symbol` from a list of 10 coins into one catalog for every kind of instrument a person meets on a trading platform: crypto, stocks, ETFs, indices, forex, commodities, futures and options, and bonds and rates.

The rules don't change:
- Education only. No buy or sell wording.
- No fake, placeholder or zero-filled numbers. Where no free, licensed source exists, the page says "Price not shown" and why. It then teaches what the instrument is, using official facts we *can* show (filings, financials, contract specs).
- Attribution is always visible.
- No data source is used without a known licence status.
- No balances or account details are read. No keys are in the repo.

---

## 1. What the person gets

- **One search** across every class, with filters for class, region, market open or closed, and watchlist.
- **Honest rows**: name, symbol, class badge, the latest official figure, its change and time window, a **Live · Daily · Reference** badge, the source, and the ATLAS status. If we can't show a price, the row says so in words.
- **A landing section for each class** ("Stocks", "Forex", "Futures and options", …), with a short plain explanation of how that market works.
- **Asset pages that fit the instrument.**
  - Crypto shows 24/7 activity.
  - Stocks show market hours, **official financials from SEC filings** and recent filings.
  - Forex shows the base and quote currencies, with official central-bank rates.
  - Rates show today's yield curve.
  - Futures and options show the contract specs and the terms, explained.
- **Explain on every asset**: "Explain this asset", "What was in the news today" (real headlines and filings, each linked, summarised on the device first), and the related glossary terms.
- **Watchlist** (signed in, synced through Firestore's free tier) and **recently viewed** (on this device).

---

## 2. Data model

One normalized schema, `src/core/asset-schema.ts`. It is pure types and validators, with no network code, so the popup stays small.

```ts
type AssetClass =
  | "crypto" | "stock" | "etf" | "index" | "forex"
  | "commodity" | "future" | "option" | "rate";

type DataMode =
  | "live"        // polled within about 1 minute, display allowed
  | "delayed"     // licensed, 15+ minute delay (kept for later paid feeds)
  | "daily"       // an end-of-day or official daily value
  | "reference"   // an official published level (ECB or Bank of Canada rate, Treasury curve): not a tradable quote
  | "none";       // no free licensed source: no price is shown

type SessionState = "open" | "closed" | "pre" | "post" | "always_open" | "unknown";

interface Asset {
  id: string;                    // namespaced and stable: "crypto:BTC", "stock:US:AAPL", "fx:EURUSD", "rate:US:10Y"
  symbol: string;                // "BTC", "AAPL", "EUR/USD", "US10Y"
  name: string;
  class: AssetClass;
  venue: string | null;          // "NASDAQ", "NYSE", "TSX", "CME", "ECB"
  currency: string;              // ISO 4217; rates use "%"
  country: string | null;        // ISO 3166 alpha-2; null for crypto
  session: { state: SessionState; hours: string | null; nextChange: string | null };
  quote: Quote | null;           // null exactly when no source may show a price
  noQuoteReason: string | null;  // plain words, required when quote is null
  facts: Fact[];                 // official, sourced figures that are not prices (revenue, shares, contract size)
  status: AtlasStatus;           // §6
  relatedTerms: string[];        // glossary ids
  classData: ClassData;
}

interface Quote {
  value: number;                 // a price, an exchange rate or a yield
  change: number | null;
  changePct: number | null;
  changeWindow: string;          // "since 00:00 UTC", "vs previous business day"
  asOf: string;                  // ISO time of the figure itself, not of the fetch
  mode: Exclude<DataMode, "none">;
  source: SourceRef;
}

interface Fact {
  label: string;                 // "Revenue (FY2025)", "Contract size"
  value: string;                 // pre-formatted, with its unit
  period: string | null;         // "FY2025", "Q3 2026"
  asOf: string | null;           // filing date
  source: SourceRef;             // e.g. SEC 10-K, linked to the filing
}

interface SourceRef {
  providerId: string;            // "coingecko", "ecb", "boc", "us_treasury", "eia", "sec_edgar", "gdelt", "cme_specs"
  label: string;                 // what the row shows
  attribution: { text: string; href: string };
  licence: {
    status: "public_domain" | "free_with_attribution" | "licensed" | "unlicensed";
    displayAllowed: boolean;     // routing refuses any source where this is false
    mlAllowed: boolean;          // ATLAS may not train on it unless true
    note: string;
  };
}

type ClassData =
  | { class: "crypto"; base: string; quote: string }
  | { class: "stock" | "etf"; cik: string | null; exchange: string | null; etfCategory?: "index" | "sector" | "bond" | "commodity" | "other" }
  | { class: "index"; owner: string; constituents: number | null }
  | { class: "forex"; base: string; quote: string; derived: boolean }      // derived: a cross computed from two official rates
  | { class: "commodity"; unit: string; benchmark: string; publishLagDays: number }
  | { class: "future"; underlying: string; contractSize: string; tick: string; expiryCycle: string; exchange: string }
  | { class: "option"; underlying: string; style: "american" | "european"; multiplier: number }
  | { class: "rate"; tenor: string; curve: string };
```

The **contract test** (`test/asset-schema.contract.test.ts`) runs on every adapter's output and on every published JSON file. It requires the following:
- Every quote and fact has a source, an attribution and `displayAllowed: true`.
- A null quote has a `noQuoteReason`.
- `asOf` is a real time and never in the future.
- No value is `0` or `NaN` because of a failed fetch.
- No field name looks like an account or a balance.
- No string carries trade wording.

---

## 3. How the data gets in, at $0

### 3.1 Two paths

| Path | Used for | Why |
|---|---|---|
| **Browser, keyless** (what exists today) | Live crypto from CoinGecko's free public API | Each visitor's browser asks for public prices and shows them with CoinGecko's attribution. We don't re-host the data. |
| **Scheduled data job** (new) | Everything official: SEC, ECB, Bank of Canada, US Treasury, EIA, GDELT headlines | A GitHub Actions workflow in this public repo (free) runs on a schedule. It fetches each source within its fair-use rules and normalises it into `Asset` records. It runs the contract test and publishes small static JSON files to Firebase Hosting (`/data/*.json`, free Spark plan). The app reads them from its own site. |

Why a scheduled job, not the browser:
- The SEC's data API blocks browser calls (no CORS) and requires a contact User-Agent header.
- A single job makes one request per source per update, not one per visitor, so we stay far inside every fair-use limit.
- The keys some sources need (the free EIA key, the Firebase deploy token) live in GitHub Actions secrets, never in the app or the repo.

There is no Cloud Functions server and no Blaze plan for any of this.

### 3.2 Schedule and size

| Data | Updates at the source | Job runs | Published file |
|---|---|---|---|
| US Treasury par yield curve | Once a business day, ~6 pm ET | Hourly, 6–11 pm ET | `rates.json` (~3 KB) |
| ECB euro reference rates | Once a business day, ~16:00 CET | Hourly, 16–18 CET | `fx.json` (~6 KB) |
| Bank of Canada exchange rates and bond yields | Once a business day, ~16:30 ET | Hourly, 16–19 ET | in `fx.json` / `rates.json` |
| EIA oil and gas spot prices | Daily values, published weekly | Daily | `commodities.json` (~2 KB) |
| SEC listings (ticker ↔ company) | Daily | Daily | `listings.json` (~150 KB gzipped for ~10k companies; loaded only when searching stocks) |
| SEC financials and recent filings | Nightly | Daily, for the curated ~300 most-watched companies, at ≤ 5 requests a second | `stocks/{CIK}.json` (~4 KB each, loaded per page) |
| GDELT news headlines | Continuously | Hourly, for the curated list | `news/{id}.json` (~2 KB) |

The files are served with long cache headers and a version in the path. The whole set stays well under the Spark plan's hosting limits (10 GB stored, 360 MB a day transferred). The job also deletes files more than 7 days old.

### 3.3 Routing

For each asset, the router does the following:
1. It picks the adapters for its class whose Remote Config flag is on and whose licence allows display.
2. It prefers live, then daily, then reference.
3. It never mixes sources within one number.
4. If no adapter applies, the result is `quote: null` with a plain `noQuoteReason`. A figure older than its expected update window is shown only with its own date and a "Stale" badge.

The reasons people see:

| Situation | Shown |
|---|---|
| Stocks and ETFs (no free display licence for prices) | "Price not shown. Free stock prices aren't licensed for public display. Below are the company's official figures from its SEC filings." |
| Indices | "Index levels are owned by the index provider and need its permission to show. Here's what the index measures and how it's built." |
| Gold and silver | "Price not shown. Benchmark gold and silver prices are licensed. Here's how the metals markets work." |
| Futures and options | "Live contract prices need an exchange licence. Here are the contract's official specs and how it works." |
| A source didn't answer | "This figure is unavailable right now. We'll try again shortly." |

---

## 4. Free source matrix

Checked 2026-11-13. "Licence" summarises each source's own published terms. It is not legal advice; the legal review in the launch checklist should confirm the rows marked ⚑.

| Class | Source | What we show | Mode | Licence for display | Cost |
|---|---|---|---|---|---|
| Crypto | **CoinGecko** public API (keyless, in the browser) | Live price, 24 h change, 48 h chart for the top coins | live | Free use requires attribution ("Prices by CoinGecko", linked). A commercial licence comes only with paid plans. ⚑ Fine while the app is free; revisit before charging for Pro | $0 |
| Crypto | Kraken public API | Same | live | Terms restrict third-party apps without written consent | $0, **demo only**. Switch the default to CoinGecko |
| Stocks and ETFs (US) | **SEC EDGAR**: `company_tickers.json`, submissions, XBRL company facts | Company name, ticker, exchange, **revenue, net income, EPS, shares outstanding** (with period and filing link), recent 10-K, 10-Q and 8-K filings | reference | US government data; no key; fair access ≤ 10 requests a second with a contact User-Agent | $0 |
| Stocks (US) prices | — | Not shown | none | No free source licensed for public display | — |
| Stocks (Canada) | — | Listing name only; financials and prices not covered yet | none | SEDAR+ has no open API | — |
| Indices | — | What the index measures, its owner, its method; **no level** | none | S&P DJI: "reproduction … prohibited without prior written permission" (also via FRED). The same holds for Nasdaq, Cboe (VIX) and TMX | — |
| Forex (EUR crosses) | **ECB** euro reference rates | ~30 currencies vs EUR; crosses (e.g. USD/JPY) computed and labelled "derived from ECB rates" | reference | Free use if reproduced accurately with the ECB cited. The rates are for information, not transactions | $0 |
| Forex (CAD pairs) | **Bank of Canada** Valet API | CAD vs ~25 currencies | reference | Free to use, copy and distribute with attribution ("Source: Bank of Canada") ⚑ | $0 |
| Commodities: oil and gas | **EIA** open data API | WTI, Brent, Henry Hub daily spot, with publication date | daily | US government data, public domain; free API key; credit EIA | $0 |
| Commodities: gold and silver | — | How the metals markets work; no price | none | LBMA benchmark prices are licensed | — |
| Bonds and rates (US) | **US Treasury** daily par yield curve | 1M–30Y yields, the curve chart, whether it is inverted | reference | US federal government work ⚑ (confirm Treasury's own reuse wording) | $0 |
| Bonds and rates (Canada) | **Bank of Canada** Valet | Government of Canada benchmark bond yields, the policy rate | reference | As above ⚑ | $0 |
| Futures | **Exchange contract specs** (CME, ICE public spec pages) | Contract size, tick, expiry cycle, trading hours, with a link to the exchange page; no price | reference | Facts restated in our own words with a link; no copying of exchange text or data feeds | $0 |
| Options | Our own education content | Calls and puts, strike, expiry, American vs European, the Greeks with worked examples | — | Our own content | $0 |
| News for "What was in the news" | **GDELT** DOC API | Up to 5 recent headlines per asset, each with publisher, time and link | reference | Open for any academic, commercial or governmental use, with a citation and link to gdeltproject.org | $0 |
| Explanations | Firebase AI Logic (Gemini Nano on the device first, then Gemini in the cloud on the free tier) | Summaries of *the headlines and filings we pass in* | — | Already in use | $0 within the free tier |

**Estimated monthly data cost: $0.** It runs on GitHub Actions (free for public repos), the Firebase Hosting and Firestore free tier (Spark), and the free CoinGecko public API.

### 4.1 What free data can't do (said plainly)

- **No stock, ETF or index prices.** Stock pages lead with official company figures and filings instead. This is more distinctive than yet another price ticker, and every number links to its SEC filing.
- **No live forex.** The official rates are daily references, labelled as such.
- **No gold or silver prices, and no futures or options prices.**

If revenue arrives later, §9 lists what each paid feed would add.

---

## 5. Catalog UX

### 5.1 Catalog (desktop 1440)

```
┌ Assets ─────────────────────────────────────────────── Live prices ┐
│ [🔍 Search any asset: Apple, EUR/USD, 10-year yield, gold…    ]    │
│ [All] [Crypto] [Stocks] [ETFs] [Indices] [Forex] [Commodities]     │
│ [Futures & options] [Rates]     Region ▾   Open now ☐  Watchlist ☐ │
├────────────────────────────────────────────────────────────────────┤
│ ☆ Bitcoin      BTC     Crypto   $68,169   −0.10%  since 00:00 UTC  │
│                                   Live · CoinGecko                 │
│ ☆ Apple        AAPL    Stock    Price not shown ⓘ                  │
│                                   Revenue FY2025 · SEC 10-K        │
│ ☆ Euro / USD   EUR/USD Forex    1.0842    +0.12%  vs prev. day     │
│                                   Reference · ECB · 13 Nov          │
│ ☆ US 10-year   US10Y   Rate     4.21%     −0.03 pt vs prev. day    │
│                                   Reference · US Treasury · 13 Nov  │
│ ☆ WTI crude    WTI     Commodity $71.40   −0.8%   vs prev. day     │
│                                   Daily · EIA · 10 Nov (weekly lag)│
└────────────────────────────────────────────────────────────────────┘
```

The ATLAS status column appears only for a class some ATLAS model covers, and then reads "withheld ⓘ" until a model is cleared (§6).

### 5.2 Catalog (phone 390)

```
Assets                     Live prices
[🔍 Search any asset             ]
(All)(Crypto)(Stocks)(Forex)(More ▾)
─────────────────────────────────
Bitcoin              $68,169
BTC · Crypto · Live    −0.10%
─────────────────────────────────
Apple        Price not shown ⓘ
AAPL · Stock · SEC figures
─────────────────────────────────
Euro / US dollar        1.0842
EUR/USD · Reference    +0.12%
```

The filters scroll sideways in a single row. Region, open now and watchlist live in a Filters sheet. Touch targets are at least 44 px.

### 5.3 Class landing sections

The All view starts with sections in this order: Crypto · Stocks · ETFs · Indices · Forex · Commodities · Futures & options · Rates. Each section has two plain lines, a "Learn how it works" link and its first 5 rows. For example:

> **Forex.** Currencies trade in pairs: EUR/USD is how many US dollars one euro buys. The market trades around the clock on weekdays. The rates here are official daily reference rates from the European Central Bank and the Bank of Canada, published once a day. They are not live trading prices.

### 5.4 Asset page by class

Every page shares the same header (name, symbol, class, venue, session state), the main figure with its source and date (or the reason it isn't shown), the ATLAS status line, the Explain actions and the related terms.

| Class | Middle section |
|---|---|
| Crypto | 24/7 badge, 48 h chart |
| Stock / ETF | Market hours and session state (computed from the exchange calendar). **Official figures**: revenue, net income, EPS and shares outstanding for the last 4 periods, each linked to its filing. **Recent filings** (10-K, 10-Q, 8-K with plain descriptions of each form) |
| Index | What it measures, who owns it, how many companies, how it is weighted. Related ETFs listed as examples, without prices |
| Forex | "1 EUR = 1.0842 USD" explained, base and quote, the pip, why reference rates differ from trading prices; a derived-cross note where it applies |
| Commodity | Unit and benchmark (WTI Cushing, $/barrel), the publication lag stated, a 30-day chart from EIA daily values |
| Future | A contract spec card (underlying, size, tick, expiry cycle, hours, exchange link), with a worked example of expiry and margin in round illustrative numbers that are labelled as illustrations |
| Option | Calls and puts, strike, expiry, the Greeks, each with a plain example and an Explain link |
| Rate | Today's curve (1M to 30Y) as a line, inversion explained, the 1-year history of the 2Y and 10Y yields |

### 5.5 Explain integration (keeps the hybrid AI central)

- **Explain this asset**: the existing hybrid path, Gemini Nano on the device first. The prompt carries only the public fields of the `Asset`.
- **What was in the news today**: the app hands the model *only* the published GDELT headlines and today's SEC filings for that asset. Gemini Nano summarises them on the device first, and the cloud only if needed. Every sentence keeps its link. With no headlines or filings, it says "Nothing in the news or filings today", never a guess. The model doesn't search the web, so there's no grounding cost.
- **Related terms**: new glossary entries for market hours, ETF, index, pip, base and quote currency, reference rate, futures contract, expiry, strike, the Greeks, yield, yield curve, basis point, 10-K, 10-Q and 8-K.

### 5.6 Watchlist and recently viewed

- **Watchlist**: `users/{uid}/watchlist/{assetId}` (`assetId`, `addedAt`), with owner-only rules and rules tests. Firestore's free tier covers it. The limit comes from the plan (free 10, Pro 50). Signed-out visitors keep a local list and are offered to sync it when they sign in.
- **Recently viewed**: the last 10 assets, in localStorage only.

### 5.7 Performance and accessibility

- Listings load lazily with the Assets route. Per-asset files load only when that page opens.
- Rows are buttons with a full spoken label (name, figure, change, window, mode, source). Change is never shown by colour alone. Motion respects reduced-motion settings. Text is at least 11 px.

---

## 6. Model insights (ATLAS and future models)

Any model can attach a view to any asset through one interface. Withheld is the default.

```ts
interface ModelInsight {
  modelId: string;                 // "atlas.signal15"
  assetId: string;
  horizon: string;                 // "1h", "1d"
  output: { kind: "direction"; lean: "up" | "down" | "none" }
        | { kind: "range"; low: number; high: number; coverage: number };
  trackRecord: { resolved: number; hitRate: number | null; since: string; brierVsBase: number | null };
  confidence: number | null;       // calibrated probability only
  clearedForPublic: boolean;       // set by the model's published evidence gate, never by the client
  reason: string;                  // "Needs 200 resolved calls; has 81"
  asOf: string;
}

type AtlasStatus =
  | { state: "shown"; insights: ModelInsight[] }   // only insights with clearedForPublic === true
  | { state: "withheld"; reason: string }
  | { state: "none" };
```

The rules:
- The client drops any insight not explicitly cleared.
- Wording is description only, with the track record shown alongside.
- ATLAS's own feeds (IEX, EDGAR and FINRA under owner-only grants) never feed the public catalog.

---

## 7. Phase plan (all $0)

Each PR adds adapter tests (recorded fixtures under `test/fixtures/`), runs the schema contract test, and comes with screenshots at 1440 and 390.

| # | PR |
|---|---|
| M1 | `asset-schema.ts`, validators, contract test, the provider registry and router (types and the browser path) |
| M2 | Crypto moved onto `Asset` (CoinGecko as the default, Kraken as a fallback); catalog UI on the new schema; recently viewed |
| M3 | The data job: a GitHub Actions workflow with US Treasury, ECB, Bank of Canada and EIA adapters, publishing `/data/*.json`; the Forex, Rates and Commodities classes with landing sections |
| M4 | SEC adapters (listings, financials, filings) in the data job; the Stocks and ETFs classes with "Price not shown" and official figures |
| M5 | Indices, Futures and Options education pages, with the glossary additions |
| M6 | Watchlist (Firestore, rules and rules tests), the watchlist filter, sync on sign-in |
| M7 | GDELT headlines in the data job; "What was in the news today", summarised on the device first |

---

## 8. Owner steps (free)

1. **GitHub Actions secrets** (repo → Settings → Secrets):
   - `FIREBASE_SERVICE_ACCOUNT`: a service-account key for Hosting deploys only. The Firebase CLI can create it: `firebase init hosting:github`.
   - `EIA_API_KEY`: free registration at eia.gov/opendata.
   - `SEC_USER_AGENT`: a name and a contact email (for example `ATLAS Explain support@yourdomain`). The SEC requires it. It is a secret so the email isn't published.
2. **Remote Config**: set `price_provider` to `coingecko`. Kraken's terms restrict third-party apps.
3. **Legal review**: confirm the rows marked ⚑ in §4.

## 9. Later, only if revenue allows (not in the plan)

| Adds | Feed | About |
|---|---|---|
| Crypto commercial licence (needed before charging for Pro, if crypto stays a Pro selling point) | CoinGecko Basic | $35/mo |
| US stock and ETF prices, live forex | Tiingo redistribution licence | $250/mo |
| TSX, gold and silver, wider coverage | Twelve Data Venture | $499/mo |
| Index levels | S&P DJI, Nasdaq, Cboe, TMX licences | quote-based |
| Live futures and options | Databento Plus + CME and OPRA fees | $4,000+/mo |

## 10. Sources (checked 2026-11-13)

- SEC: [EDGAR APIs: no key, no CORS](https://www.sec.gov/page/sec-api-documentation), [fair access](https://www.sec.gov/os/accessing-edgar-data)
- ECB: [disclaimer and copyright](https://www.ecb.europa.eu/home/disclaimer/html/index.en.html), [reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
- Bank of Canada: [terms](https://www.bankofcanada.ca/terms/), [Valet API guide](https://www.bankofcanada.ca/valet-api-how-to/)
- US Treasury: [daily interest rate XML feed](https://home.treasury.gov/treasury-daily-interest-rate-xml-feed)
- EIA: [copyrights and reuse (archived)](https://webarchive.library.unt.edu/web/20121027102427/http:/www.eia.gov/about/copyrights_reuse.cfm)
- GDELT: [about and terms](https://www.gdeltproject.org/about.html)
- CoinGecko: [keyless public API and attribution](https://docs.coingecko.com/docs/keyless-public-api), [plans](https://www.coingecko.com/en/api/pricing)
- S&P 500 copyright via FRED: [St. Louis Fed on data citations](https://www.stlouisfed.org/publications/page-one-economics/2020/10/21/data-citations-with-fred); FRED: [API terms](https://fred.stlouisfed.org/docs/api/terms_of_use.html)
- Paid feeds (§9): [Tiingo](https://www.tiingo.com/products/consolidated-real-time-stock-api), [Twelve Data](https://twelvedata.com/pricing-business), [Databento](https://databento.com/docs/portal/live-data), [S&P DJI licensing](https://www.spglobal.com/spdji/en/about-us/data-index-licensing)

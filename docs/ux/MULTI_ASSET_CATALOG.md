# Multi-asset catalog

Status: **design, awaiting owner approval** (2026-11-13). No provider that needs a paid plan is added until the owner approves it (§4).

This turns `/app/assets` and `/app/assets/:symbol` from a list of 10 coins into one catalog covering every kind of instrument a person meets on a trading platform: crypto, stocks, ETFs, indices, forex, commodities, futures and options, and bonds and rates.

The rules don't change. It is education only: no buy or sell wording, and no advice. No fake, placeholder or zero-filled numbers: a price without a licensed source says "Price not available" and why. Attribution is always visible. No data source is used without a known licence status. No balances or account details are read, and no keys are kept in the repo.

---

## 1. What changes for the person using it

- **One search** across every class, filtered by class, region, market open or closed, and watchlist.
- **Honest rows.** Each row shows a name, symbol, class badge, last price, change with its time window, a **Live · Delayed · Daily · Reference** badge, the source, and the ATLAS status. Where no licensed price exists, the row says so in words instead of showing a blank.
- **A page for each class** ("Stocks", "Forex", "Futures and options", …) that explains in a few calm lines how that market works, so the catalog teaches, not just lists.
- **Asset pages that fit the instrument.** Crypto shows 24/7 activity. Stocks show market hours and SEC filings. Forex shows the base and quote currencies. Futures show the contract specs. Rates show the yield curve.
- **Explain on every asset**: "Explain this asset", "What moved it today" (grounded in filings and news, with sources) and the related glossary terms.
- **Watchlist** (signed in, synced) and **recently viewed** (on this device).

---

## 2. Data model

One normalized schema, used by every adapter, the catalog, the asset pages, Explain and the extension. It is a pure type plus validators in `src/core/asset-schema.ts`. It carries no Firebase or network code, so the popup bundle stays small.

```ts
type AssetClass =
  | "crypto" | "stock" | "etf" | "index" | "forex"
  | "commodity" | "future" | "option" | "rate";

type DataMode =
  | "live"        // streaming or polled within ~1 min, licensed for display
  | "delayed"     // licensed, 15+ min delay (exchange rule)
  | "daily"       // end-of-day close or official daily fixing
  | "reference"   // an official published level (ECB rate, Treasury curve), not a tradable quote
  | "none";       // no licensed source: the price is not shown

type SessionState = "open" | "closed" | "pre" | "post" | "always_open" | "unknown";

interface Asset {
  id: string;                    // stable, namespaced: "crypto:BTC", "stock:US:AAPL", "fx:EURUSD", "rate:US:10Y"
  symbol: string;                // what people type: "BTC", "AAPL", "EUR/USD", "US10Y"
  name: string;                  // "Bitcoin", "Apple Inc.", "Euro / US dollar"
  class: AssetClass;
  venue: string | null;          // "NASDAQ", "TSX", "Kraken", "CME", "ECB" (null when not exchange-traded)
  currency: string;              // ISO 4217 price currency ("USD", "CAD"); a rate uses "%"
  country: string | null;        // ISO 3166 alpha-2 for listings and rates; null for crypto
  session: {
    state: SessionState;
    hours: string | null;        // "Mon–Fri 9:30–16:00 America/New_York", "24/7"
    nextChange: string | null;   // ISO time the session next opens or closes, when known
  };
  quote: Quote | null;           // null when mode is "none"
  status: AtlasStatus;           // ATLAS's view, or "withheld" with a reason (§6)
  relatedTerms: string[];        // glossary ids: ["spread", "market_hours", "dividend"]
  classData: ClassData;          // the part that differs by class (below)
}

interface Quote {
  price: number;
  change: number | null;         // absolute
  changePct: number | null;
  changeWindow: string;          // "since 00:00 UTC", "since yesterday's close", "vs previous fixing"
  asOf: string;                  // ISO timestamp of the price itself, not of the fetch
  mode: Exclude<DataMode, "none">;
  delayMinutes: number | null;
  source: SourceRef;
}

interface SourceRef {
  providerId: string;            // "coingecko", "tiingo", "ecb", "us_treasury", "eia", "sec_edgar"
  label: string;                 // what the row shows: "CoinGecko", "IEX via Tiingo", "ECB reference rate"
  attribution: { text: string; href: string };  // always rendered next to the number
  licence: LicenceRef;
}

interface LicenceRef {
  status: "licensed" | "public_domain" | "free_with_attribution" | "demo_only" | "unlicensed";
  displayAllowed: boolean;       // routing refuses any source where this is false
  mlAllowed: boolean;            // ATLAS may not train on it unless true
  note: string;                  // "CoinGecko Basic commercial plan", "US government work"
}

type ClassData =
  | { class: "crypto"; base: string; quote: string; volume24h: number | null }
  | { class: "stock" | "etf"; cik: string | null; exchangeMic: string | null; etfCategory?: "index" | "sector" | "bond" | "commodity" | "other" }
  | { class: "index"; constituents: number | null; provider: string }           // "S&P Dow Jones Indices"
  | { class: "forex"; base: string; quote: string; pip: number }
  | { class: "commodity"; unit: string; benchmark: string }                     // "barrel", "WTI Cushing"
  | { class: "future"; underlying: string; contractUnit: string; tick: string; expiryCycle: string; exchange: string }
  | { class: "option"; underlying: string; style: "american" | "european"; multiplier: number }
  | { class: "rate"; tenor: string; curve: string };                            // "10Y", "US Treasury par"
```

**Contract test** (`test/asset-schema.contract.test.ts`): every adapter's output must pass `validateAsset()`. It checks the following:

- A non-null quote has a source, an attribution and a licence with `displayAllowed: true`.
- `mode: "none"` means a null quote.
- `asOf` is a real time, and never in the future beyond clock skew.
- No number is `0` because a source failed.
- No field name looks like an account or balance.
- No string carries trade wording.

The existing `AssetView` (crypto and the ATLAS stocks) maps onto `Asset` with an adapter, so the current UI keeps working while it migrates.

---

## 3. Provider layer

### 3.1 Adapter interface

The `price_provider` pattern (`src/core/price-feed.ts`) grows into a registry. Each adapter declares what it is, so routing never needs to guess.

```ts
interface ProviderAdapter {
  id: string;                          // "coingecko"
  classes: AssetClass[];               // what it can price
  mode: DataMode;                      // what it is licensed to display
  licence: LicenceRef;                 // per the signed plan, mirrored in docs/legal/DATA_SOURCES.md
  costTier: "free" | "paid";
  remoteConfigFlag: string;            // "provider_tiingo_enabled": off until a plan is bought
  limits: { perMinute: number; perDay: number | null; batchSize: number };
  cacheTtlMs: Partial<Record<DataMode, number>>;
  quotes(ids: string[], ctx: FetchContext): Promise<Map<string, Quote | null>>;   // batched, never per row
  history?(id: string, range: "1d" | "5d" | "1m", ctx: FetchContext): Promise<SparkPoint[] | null>;
}
```

### 3.2 Where adapters run

Paid keys can't sit in a browser or an extension, and most display licences need the provider to count the end user's requests. So every adapter except the keyless crypto feed runs in a **Cloud Function gateway** (`quotes`):

- **Client to gateway:** one batched request per screen (`/quotes?ids=…`), with App Check enforced.
- **Gateway to provider:** one batched call per provider per TTL window, cached in memory with a Firestore fallback. Thousands of viewers on one symbol cost one upstream call per TTL.
- **Keys** are Firebase secrets (`defineSecret`), never in the repo or in Remote Config.

This needs the Blaze plan, which the billing work (PR 6) already needs. Today's keyless Kraken and CoinGecko path stays in the browser until the CoinGecko paid key exists, then moves behind the gateway.

### 3.3 Routing rules

For each asset, `route(asset)` does the following:

1. It takes the adapters whose `classes` include the asset's class and whose Remote Config flag is on.
2. It drops any adapter whose licence has `displayAllowed: false` or status `unlicensed` or `demo_only` once `billing_enabled` is true. Demo keys are never used to show prices in a product that charges money.
3. It prefers live, then delayed, then daily, then reference. Among equals it prefers the lower cost tier.
4. It tries them in order. When an adapter fails or times out (8 s), it moves to the next one. When none succeeds, the result is `mode: "none"` with a reason, never a stale number passed off as fresh. A last-good quote older than its TTL is shown only with its own `asOf` and a "Stale" badge.
5. It never mixes sources within one number: change and price always come from the same adapter.

The reason strings shown to people:

| Situation | Shown on the row or page |
|---|---|
| No licensed provider for the class yet | "Price not shown: we don't have a display licence for this market yet." |
| Provider down | "Price unavailable right now. Try again in a minute." |
| Market closed | The last close with a "Daily" badge and "Market closed · opens Mon 9:30 ET" |
| Index without a licence | "Index levels need a licence from the index owner. We explain the index instead." |

### 3.4 Caching and limits (per adapter)

| Mode | TTL | Notes |
|---|---|---|
| live (crypto) | 30–60 s | One `/coins/markets` call covers the whole crypto list |
| delayed or live (stocks, ETFs, FX intraday) | 60 s while the market is open, 30 min while closed | Batched by the provider's batch size (Tiingo IEX: multi-ticker) |
| daily / reference (ECB, Treasury, EIA) | Until the next publication; checked hourly | 1–3 calls a day in total |
| SEC EDGAR filings | 15 min per CIK | 10 requests a second at most, with a declared User-Agent (the SEC's fair-access rule), so these run on the server only |
| history (sparklines) | 15 min | Drawn only where the adapter has a batched, licensed `history()` |

---

## 4. Provider matrix and cost

The licence and price facts below come from public pages and third-party comparisons checked on 2026-11-13. Several sources disagree. **Every paid line needs written confirmation from the vendor that its plan covers public display in a paid consumer app** before the adapter is switched on. The figures are list prices in USD a month, before exchange pass-through fees.

| Class | Provider | Mode | Licence for public display | Cost | Status |
|---|---|---|---|---|---|
| Crypto | **CoinGecko** API | live | Commercial licence from the paid Basic tier; attribution required ("Prices by CoinGecko"); no resale; no ML on the data | Basic ≈ $35/mo ($29 billed yearly); Analyst $129/mo if the call credits run short | Adapter built; **paid plan needs OK** |
| Crypto | Kraken public API | live | Terms restrict third-party apps without written consent | free | Demo only. Off at paid launch unless Kraken consents in writing |
| Stocks and ETFs (US) | **Tiingo** (IEX real-time + EOD) | live (IEX venue) / daily | Self-serve plans are internal only. Public display needs Tiingo's **redistribution licence** | ≈ $250/mo startup redistribution ($500 enterprise) | **Needs OK** + written scope confirmation |
| Stocks, ETFs, FX, commodities, (indices?) | **Twelve Data** Venture | live / delayed by venue | Venture includes "external display"; Enterprise adds external distribution | ≈ $499/mo (third parties quote lower credit levels; confirm) | Alternative to Tiingo when TSX or wider coverage is needed |
| Stocks (US, wide) | Massive (formerly Polygon.io) business | live | Individual plans are not for display; business or enterprise needed, plus exchange fees | ≈ $2,499/mo (one source); custom | Not recommended at this stage |
| Stocks (Canada, TSX) | TMX Datalinx direct, or a vendor that passes TSX through (Twelve Data) | delayed (15 min) | TMX requires a display agreement for public websites, even for delayed data | Quote-based (TMX price list and delayed-data Exhibit A, 2026) | Phase 4. Ask TMX (datasales@tmx.com) |
| Indices (S&P 500, Dow, Nasdaq-100, TSX, VIX) | Index owners: S&P DJI, Nasdaq, Cboe, TMX | delayed / daily | Index values are licensed by their owners **separately from any data vendor**. Website display needs their licence, even delayed | Quote-based per owner; historically per-site monthly fees | Phase 4. Until then the index page explains the index and shows no level |
| Forex | **ECB euro reference rates** | reference (once a day, ~16:00 CET) | ECB: free use if reproduced accurately with the ECB cited as the source. The rates are for information, not transactions | free | **Phase 1 (free)**. Cross rates labelled as derived from ECB |
| Forex intraday | Tiingo FX / Twelve Data | live | Covered by the same redistribution or Venture plan | included above | Phase 3, with the stock plan |
| Commodities: oil, natural gas | **EIA** (WTI, Brent, Henry Hub spot) | daily (published with a lag of a few days) | US government data, public domain; free API key; credit EIA | free | **Phase 1 (free)**. Labelled with its date |
| Commodities: gold, silver | Via the stock or FX vendor (XAU/XAG) | live / daily | LBMA benchmark prices are licensed, and FRED dropped them, so there is no free licensed source | included with Twelve Data, or not available | Shown as "Price not shown" until a plan covers it |
| Bonds and rates | **US Treasury** daily par yield curve (XML feed) | reference (daily) | Federal government data (not subject to US copyright; confirm Treasury's own reuse wording) | free | **Phase 1 (free)** |
| Bonds and rates | FRED | reference | Free for non-commercial use; commercial use depends on each series' copyright note | free | Not used: Treasury direct is cleaner |
| Futures | Databento (CME Globex) | live | Standard is personal use only. Public display needs Plus (≈ $1,750/mo) **plus** CME distribution fees (≈ $2,170/mo) and per-user fees | ≈ $4,000+/mo | **Not recommended.** Futures pages are education-only: specs, expiry and terms, no live price |
| Options | (same as futures, or OPRA via a vendor) | — | OPRA display licensing on top of the vendor | high | Education-only pages (contract, strike, expiry, the Greeks) with worked examples |
| Filings (stocks) | **SEC EDGAR** (data.sec.gov) | reference | Public; fair access: at most 10 requests a second with a declared User-Agent | free | **Phase 2 (free)**, server-side |
| News for "What moved it today" | Gemini grounding with Google Search (Firebase AI Logic, cloud) | reference | Google's grounding terms: show the search suggestions and sources; billed per grounded request beyond the free quota | Usage-based; confirm current rate | Phase 2, with a budget cap. On-device Nano can't browse, so these answers are always labelled "Cloud" |
| ATLAS research | ATLAS on the owner's computer | — | Owner-only feeds (IEX, EDGAR and FINRA grants say owner display only) | — | Never feeds the public catalog; ATLAS-only views stay hidden |

### 4.1 Estimated monthly data cost

| Tier | Turns on | Paid lines | Data cost / month |
|---|---|---|---|
| **A: launch minimum** (recommended now) | Crypto live (licensed); forex daily reference; oil and gas daily; the Treasury curve; SEC filings; education pages for indices, futures and options; "Price not shown" for stocks, ETFs and metals | CoinGecko Basic | **≈ $35** (+ Firebase Blaze ≈ $5–25 for the gateway, cache and filings) |
| **B: + US stocks, ETFs and intraday FX** | Stocks and ETFs (IEX live + daily close), FX live, sparklines for them | + Tiingo redistribution (startup) | **≈ $290–310** |
| **B′: B via Twelve Data instead** | B plus TSX (if included), gold and silver, wider FX | + Twelve Data Venture in place of Tiingo | **≈ $540–560** |
| **C: + index levels** | S&P 500, Dow, Nasdaq-100, VIX and TSX levels (delayed) | + S&P DJI, Nasdaq, Cboe and TMX display licences | **B + quote-based**, likely several hundred to low thousands a month |
| Not planned | Live futures and options prices | Databento Plus + CME distribution + OPRA | ≈ $4,000+ |

Against the approved Pro price (US$5.99 a month, ≈ US$5.50 net), tier A breaks even at about **7 subscribers**, B at about **55** and B′ at about **100**. Recommendation: **ship tier A, then turn on B with Tiingo once its written redistribution scope is confirmed and Pro has about 50 subscribers.** Revisit B′ only if TSX or metals demand shows up.

---

## 5. Catalog UX

### 5.1 Catalog (desktop 1440)

```
┌ Assets ───────────────────────────────────────────── Live prices ┐
│ [🔍 Search any asset: Apple, EUR/USD, 10-year yield…        ]    │
│ [All] [Crypto] [Stocks] [ETFs] [Indices] [Forex] [Commodities]   │
│ [Futures & options] [Rates]   Region ▾   Open now ☐  Watchlist ☐ │
├──────────────────────────────────────────────────────────────────┤
│ ☆ ◎ Bitcoin      BTC   Crypto  $68,169   −0.10%  since 00:00 UTC │
│                                  Live · CoinGecko · withheld ⓘ   │
│ ☆ ◎ Apple        AAPL  Stock   Price not shown ⓘ                 │
│                                  No display licence yet           │
│ ☆ ◎ Euro / USD   EUR/USD Forex 1.0842   +0.12%  vs prev. fixing  │
│                                  Reference · ECB · 13 Nov 16:00 CET│
│ ☆ ◎ US 10-year   US10Y  Rate   4.21%   −0.03 pt  vs prev. day    │
│                                  Reference · US Treasury · 13 Nov │
└──────────────────────────────────────────────────────────────────┘
```

- "Withheld ⓘ" opens a one-line reason ("ATLAS predictions aren't cleared for public use"). The status column is hidden entirely when no ATLAS model covers the class.
- Badges are **Live**, **Delayed 15 min**, **Daily** and **Reference**, each with a tooltip that says what it means.
- Sparklines appear only where §3.4 allows them.

### 5.2 Catalog (phone 390)

```
Assets                    Live prices
[🔍 Search any asset            ]
(All)(Crypto)(Stocks)(Forex)(More ▾)
────────────────────────────────
Bitcoin            $68,169
BTC · Crypto · Live   −0.10%
────────────────────────────────
Apple       Price not shown ⓘ
AAPL · Stock
────────────────────────────────
Euro / US dollar      1.0842
EUR/USD · Reference   +0.12%
```

Filters scroll sideways in one row. Region, the open-now filter and the watchlist filter live in a "Filters" sheet. Touch targets are at least 44 px.

### 5.3 Class landing sections

The All view starts with short sections in this order: Crypto · Stocks · ETFs · Indices · Forex · Commodities · Futures & options · Rates. Each has a two-line plain explanation, a "Learn how it works" link to the glossary, and its first 5 rows:

> **Forex.** Currencies trade in pairs: EUR/USD is how many US dollars one euro buys. The market runs 24 hours on weekdays. The rates here are the European Central Bank's daily reference rates, published once a day.

### 5.4 Asset page, adapted by class

All pages share the header (name, symbol, class, venue, session state), the price block with source and time, the ATLAS status line, the Explain actions and the related terms. The middle part changes by class:

| Class | Middle section |
|---|---|
| Crypto | 24/7 badge, 24 h range and volume (when licensed), 48 h chart |
| Stock / ETF | Market hours and session state, ETF category, **Recent filings** (8-K, 10-Q and 10-K titles and dates, linked to sec.gov) |
| Index | What the index measures, how many companies, who maintains it; the level only once licensed |
| Forex | Base and quote currencies explained ("1 EUR = 1.0842 USD"), the pip size, why ECB rates are not trading prices |
| Commodity | Unit and benchmark (WTI Cushing, $/barrel), publication lag |
| Future | A contract spec card (underlying, contract size, tick, expiry cycle, exchange), with a worked example of how expiry and margin work, and no live price |
| Option | Calls and puts, strike, expiry, American vs European, and the Greeks (delta, gamma, theta, vega) with plain examples. Each one links to Explain |
| Rate | Today's US Treasury curve (1M to 30Y) as a line, and whether it is inverted, explained without forecasting |

### 5.5 Explain integration

- **Explain this asset**: the existing hybrid path (on the device first). The prompt carries only public fields from the `Asset` (name, class, price, change and window, source, time).
- **What moved it today**: grounded, cloud only, and labelled. Its inputs are today's EDGAR filings for that CIK plus Gemini grounding with Google Search, and every claim lists its source and time. If nothing is found it says "No news or filings found for today", never a guess. It is behind a daily budget cap and counts toward the cloud limit.
- **Related terms** come from `relatedTerms`. New glossary entries for this work: market hours, ETF, index, pip, base and quote currency, futures contract, expiry, strike, the Greeks, yield, yield curve, basis point and reference rate.

### 5.6 Watchlist and recently viewed

- The **watchlist** lives at `users/{uid}/watchlist/{assetId}` (fields: `assetId`, `addedAt`), with owner-only rules and a size limit from the plan (free 10, Pro 50, per `src/core/billing.ts`). Signed-out visitors keep a local list and are offered to sync it when they sign in.
- **Recently viewed**: the last 10 assets in localStorage on this device only.

### 5.7 Performance and accessibility

- The catalog index (ids, names, classes) is a static JSON of a few hundred entries, loaded lazily with the Assets route. Prices fill in from one batched gateway call.
- The class filters are a `role="group"` of toggle buttons. Rows are buttons with a full spoken label (name, price, change, window, mode, source). Change is never shown by colour alone (± sign and arrow). Motion respects `prefers-reduced-motion`.

---

## 6. Model insights (ATLAS and future models)

One interface lets any model attach a view to any asset. It is the same for ATLAS engines and for third-party models later.

```ts
interface ModelInsight {
  modelId: string;                 // "atlas.signal15", "atlas.ml_meta"
  assetId: string;                 // Asset.id
  horizon: string;                 // "1h", "1d"
  output: { kind: "direction"; lean: "up" | "down" | "none" }
        | { kind: "range"; low: number; high: number; coverage: number };
  trackRecord: { resolved: number; hitRate: number | null; since: string; brierVsBase: number | null };
  confidence: number | null;       // calibrated probability only, never a raw score
  clearedForPublic: boolean;       // set by the model's own published evidence gate, never by the client
  reason: string;                  // plain words: "Needs 200 resolved calls; has 81"
  asOf: string;
}

type AtlasStatus =
  | { state: "shown"; insights: ModelInsight[] }      // only insights with clearedForPublic === true
  | { state: "withheld"; reason: string }             // "ATLAS predictions aren't cleared for public use."
  | { state: "none" };                                // no model covers this class
```

The rules:

- The client drops any insight where `clearedForPublic` is not exactly `true`.
- Wording is description only: "The model leans up over the next hour, on paper", never an instruction.
- Every insight shows its track record next to it. A model that has not cleared its gate shows **withheld** with the reason, and no number.

---

## 7. Phase plan (small PRs)

Each PR ships with adapter tests (fixtures stay under `test/fixtures/`), the schema contract test and screenshots at 1440 and 390.

| # | PR | Paid plan? |
|---|---|---|
| M1 | `asset-schema.ts` + validators + contract test; the provider registry and router; the `quotes` gateway skeleton (Cloud Functions, App Check, cache) | No (needs Blaze, which PR 6 also needs) |
| M2 | Crypto migrated onto `Asset` (Kraken and CoinGecko adapters behind the registry); the catalog UI on the new schema; recently viewed | No; the CoinGecko paid key switches on later by flag |
| M3 | Forex (ECB), Rates (Treasury curve page), Commodities (EIA oil and gas), each with a class landing section | No |
| M4 | Stocks and ETFs: the listing index, EDGAR filings, market hours and session state; prices show "Price not shown" until the flag is on; the Tiingo (or Twelve Data) adapter is built, tested against recorded fixtures and **off** | Adapter built but switched off. **Turning it on needs OK** |
| M5 | Indices and futures and options education pages, with the glossary additions | No |
| M6 | Watchlist (Firestore, rules and rules tests), the watchlist filter, sync on sign-in | No |
| M7 | "What moved it today" (EDGAR + grounded search, budget cap) | Usage-based Gemini grounding. **Needs OK on the cap** |

M1–M3 and M5–M6 need nothing bought. M4's adapter can be written and tested now, but it stays dark until a plan is approved and bought.

---

## 8. Decisions for the owner

1. **Tier A now?** CoinGecko Basic at about $35 a month is the only paid line. It was already a launch-checklist item.
2. **Stocks: Tiingo (≈ $250) or Twelve Data (≈ $499)?** Recommendation: Tiingo first, after Tiingo confirms in writing that its redistribution licence covers a public, paid consumer web app and Chrome extension.
3. **Index levels:** accept "explained, no level" at launch (recommended), or open talks with S&P DJI, Nasdaq, Cboe and TMX.
4. **Grounded "What moved it today":** approve a daily budget cap (suggested US$5 a day) once the current per-request rate is confirmed.

## 9. Sources (checked 2026-11-13)

- Tiingo: [real-time stock API and redistribution](https://www.tiingo.com/products/consolidated-real-time-stock-api), [IEX API](https://www.tiingo.com/products/iex-api), [comparison](https://aifinhub.io/articles/tiingo-vs-polygon-vs-finnhub-2026/)
- Twelve Data: [business pricing](https://twelvedata.com/pricing-business)
- Massive: [rename and plans](https://marketparquet.com/guides/polygon-io-massive-rebrand), [pricing summary](https://costkite.com/tools/massive-formerly-polygon-io)
- Databento: [live data and venue fees](https://databento.com/docs/portal/live-data), [CME fee list](https://api.databento.com/static/licensing/cme/cme-market-data-fee-list.pdf)
- CoinGecko: [API pricing](https://coingecko.com/en/api/pricing?amp=), [commercial licence from Basic](https://www.coingecko.com/learn/best-cryptocurrency-apis)
- S&P DJI: [data and index licensing](https://www.spglobal.com/spdji/en/about-us/data-index-licensing); Nasdaq: [index data policy](https://www.nasdaqtrader.com/content/technicalsupport/dataproducts/indexdatapolicy.pdf)
- TMX: [pricing and contract documents](https://tmxinfoservices.com/market-data/pricing-and-contract-documents)
- ECB: [disclaimer and copyright](https://www.ecb.europa.eu/home/disclaimer/html/index.en.html), [reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html)
- EIA: [copyrights and reuse (archived)](https://webarchive.library.unt.edu/web/20121027102427/http:/www.eia.gov/about/copyrights_reuse.cfm)
- US Treasury: [daily interest rate XML feed](https://home.treasury.gov/treasury-daily-interest-rate-xml-feed)
- SEC: [accessing EDGAR data](https://www.sec.gov/os/accessing-edgar-data)
- FRED: [API terms of use](https://fred.stlouisfed.org/docs/api/terms_of_use.html)

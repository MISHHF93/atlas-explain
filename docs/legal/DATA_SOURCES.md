# ATLAS Explain data sources

Status as of 2026-11-13. This is a research summary, not legal advice.
Full comparison: [ATLAS commercial data licensing map](https://cursor.com/canvas/store-037fc2ab-67d6-498a-87de-39585a369582/8f245460-8162-4baa-807b-8253f452a4ab).

ATLAS Explain shows public market figures for education only. It never reads
balances or account details. These feeds are never used to train a model, and
the app does not resell raw data.

The live crypto feed is selected with Firebase Remote Config `price_provider`.
The in-app default is `kraken` so the hackathon demo does not change until
that parameter is published as `coingecko`.

| Source | What the app shows | How it is fetched | Licence status (research, 13 Nov 2026) | In the app now |
| --- | --- | --- | --- | --- |
| Kraken public REST API (`api.kraken.com`) and public WebSocket ticker (`wss://ws.kraken.com/v2`, since 16 Nov 2026: real-time prices in the web app while it is open) | Live USD prices and hourly bars for 10 cryptocurrencies | Browser, keyless, 8 s timeout, 60 s cache | Terms restrict automation and third-party apps without written consent. Fine for the hackathon demo; not a safe basis for a market launch without written consent. | Demo only; off by default since 2026-11-13 |
| CoinGecko public API (`api.coingecko.com`) | Live USD prices and recent prices for the same 10 cryptocurrencies | Browser, keyless or optional Demo API key from Remote Config `coingecko_demo_api_key` (never committed). 8 s timeout, 60 s cache | Clearest commercial display licence found. Attribution is required (shown as "Prices by CoinGecko" with a link). No API resale. No ML training on the data. A paid commercial plan is needed before a market launch. The user cannot pay for a plan today, so the keyless public API is used until then. | **Default** (`price_provider=coingecko`); also supplies coin images |
| ATLAS on this computer (`localhost:3000`) | Prices plus paper predictions when the owner is running ATLAS | Local only, never from the hosted site | The owner's own ATLAS instance. Crypto and stock figures there follow ATLAS's own feed licences. | Used when ATLAS is reachable; lights can leave grey only from this path |
| IEX / stock prices | Stock rows and paper stats | Only through ATLAS on this computer | Not fetched directly by Explain. The hosted app tells the visitor to connect ATLAS. | Shown as a gap with an honest "Connect ATLAS" note when only a public crypto feed is used |
| Firebase / Gemini | Educational explanations | Firebase AI Logic, App Check | Google's terms for Firebase and Gemini. Explanations are generated, not a market-data feed. | Cloud fallback and the hosted app |

## Official free sources (scheduled capture)

Added 2026-11-13; moved 2026-11-16. Fetched on a schedule by the connector's Cloudflare Worker (`src/data/capture.ts`; SEC filings by `npm run data:publish` from a computer), validated against the Asset schema, and served at https://atlas-explain-mcp.atlas-explain.workers.dev/data/v1/. The app re-validates every record before showing it. Plan: docs/ux/MULTI_ASSET_CATALOG.md.

| Source | What the app shows | Licence (summary; legal review to confirm ⚑ rows) | Attribution shown |
| --- | --- | --- | --- |
| US Treasury daily par yield curve | US yields 1M–30Y, daily | US federal government data ⚑ | "Source: U.S. Department of the Treasury" |
| ECB euro reference rates | EUR pairs and crosses derived from two ECB rates (labelled) | Free use if reproduced accurately with the ECB cited; for information, not transactions | "Source: European Central Bank" |
| Bank of Canada Valet API | CAD pairs; Government of Canada benchmark bond yields | Free to use, copy and distribute with attribution ⚑ | "Source: Bank of Canada" |
| EIA open data | WTI, Brent and Henry Hub daily spot (the EIA API with a free `EIA_API_KEY`; without one, the same series from the EIA's own daily history pages, since 18 Nov 2026) | US government data, public domain | "Source: U.S. Energy Information Administration" |
| Official press releases: Federal Reserve, SEC, CFTC, Bank of Canada, Bank of England (RSS) | Headline, link and time of each release, as market news ("In the news", `todays_headlines`); matched to a company when it names one. Titles and links only, never the release text. | US government works, public domain | The publisher's domain on each headline, and "official releases from the Federal Reserve, SEC, CFTC, ECB, Bank of Canada and Bank of England" in the credit line |
| ECB press releases (RSS) | Same as above | Reuse allowed with the source named ⚑ | Same as above |
| BLS public API v1 (keyless, 25 requests a day) | US CPI-U, converted to inflation over 12 months, and the unemployment rate (`economy_snapshot`) | US government works, public domain | "U.S. Bureau of Labor Statistics" with a link |
| New York Fed reference rates API | Effective federal funds rate with the target range, and SOFR | Free to use with the New York Fed named ⚑ | "Federal Reserve Bank of New York" with a link |
| ECB data portal (HICP dataset) | Euro-area inflation over 12 months | Free use if reproduced accurately with the ECB cited | "European Central Bank" with a link |
| Bank of Canada Valet (series V39079) | Canada's policy rate (target for the overnight rate) | Free to use with attribution ⚑ | "Bank of Canada" with a link |
| US Treasury Fiscal Data (Debt to the Penny) | Total public debt outstanding | US government works, public domain | "U.S. Department of the Treasury, Fiscal Data" with a link |
| Fed, ECB and Bank of Canada calendar pages | Dates of upcoming rate decisions (`economic_calendar`) | Public schedules; dates and titles only | Each bank's page linked on every date |
| Bank of England database (Bank Rate, series IUDBEDR) and MPC dates page | The UK's Bank Rate and the Monetary Policy Committee's decision dates | Bank of England content may be reused with attribution ⚑ | "Bank of England" with a link |
| ECB data portal (FM dataset, deposit facility rate) | The ECB deposit facility rate | Free use if reproduced accurately with the ECB cited | "European Central Bank" with a link |
| TreasuryDirect securities API (announced and auctioned) | Upcoming US Treasury auctions and recent results (`treasury_auctions`) | US government works, public domain | "TreasuryDirect, U.S. Department of the Treasury" |
| World Bank Data360 API, World Development Indicators (keyless) | GDP growth, inflation, unemployment (ILO modelled estimate) and GDP per person for the G20 and the EU (`compare_countries`) | CC BY 4.0: reuse with attribution | "World Bank, World Development Indicators" with a link and licence on every answer |
| OECD SDMX API, Financial market (Main Economic Indicators), share prices (keyless) | Monthly share-price index (all shares, 2015 = 100) for 17 G20 members (`data_series` world_share_prices), captured daily with world.json | OECD terms (read 19 Nov 2026): Data may be downloaded, shared and distributed "for any purpose, even for commercial use", with credit; the dataset lists no third-party restriction | "OECD, Financial market" with OECD Data Explorer and the licence on every answer |
| Kraken public Ticker and Depth | Best bid and ask, and the best 25 levels of each coin's order book (`market_depth`) | Same terms as Kraken prices above (legal review item 12) ⚑ | "Kraken public market data" with the capture times |

None of these feeds is used to train a model. Stock, ETF, index, gold and silver prices are **not** shown: no free source is licensed for public display.

## Logos

| Logos | Source | Terms | Shown |
| --- | --- | --- | --- |
| Crypto coin images | The `image` field of CoinGecko's `/coins/markets` API data | Part of the API data shown with the "Prices by CoinGecko" credit | Yes, when `price_provider=coingecko` |
| Company logos (stock pages) | Logo.dev image API, publishable key `logo_dev_token` in Remote Config | Free plan: commercial use needs the visible credit "Logos provided by Logo.dev" (shown next to the list) | Only when the key is set; otherwise a lettered badge |
| Government, central bank, index and exchange logos (SEC, Treasury, ECB, Bank of Canada, EIA, S&P, Nasdaq, Cboe, CME) | — | Seals and emblems are legally restricted or licensed trademarks; their terms ask for a text citation | **Never shown**; text credits only |

Logo images load from `coin-images.coingecko.com` and `img.logo.dev` with no referrer. Those hosts see the visitor's IP address, which the privacy policy must mention (legal review).

## Switching to CoinGecko

1. Firebase console → the `atlas-explain` project → Remote Config.
2. Add a string parameter `price_provider` if it is not already there. Keep the
   default as `kraken` until you are ready to switch.
3. Set the parameter value to `coingecko` and publish. Clients refresh Remote
   Config at most once a minute; hard-refresh https://atlas-explain.web.app
   (Ctrl+Shift+R) after it publishes.
4. Optional: add `coingecko_demo_api_key` in Remote Config for a CoinGecko Demo
   API key. Leave it empty for keyless access. Never put a key in the repo.
5. Before a public market launch, obtain a paid CoinGecko commercial plan, or
   written consent from Kraken if that feed stays on. Update this file when
   the licence changes.

## Rules that do not change

- Education wording only. No buy/sell recommendations.
- No balances, accounts, or keys are read from a user.
- No placeholder or zero-filled prices. A missing figure is omitted.
- Billing stays off until after hackathon judging.

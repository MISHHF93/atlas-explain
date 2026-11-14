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
| Kraken public REST API (`api.kraken.com`) | Live USD prices and hourly bars for 10 cryptocurrencies | Browser, keyless, 8 s timeout, 60 s cache | Terms restrict automation and third-party apps without written consent. Fine for the hackathon demo; not a safe basis for a market launch without written consent. | Default (`price_provider=kraken`) |
| CoinGecko public API (`api.coingecko.com`) | Live USD prices and recent prices for the same 10 cryptocurrencies | Browser, keyless or optional Demo API key from Remote Config `coingecko_demo_api_key` (never committed). 8 s timeout, 60 s cache | Clearest commercial display licence found. Attribution is required (shown as "Prices by CoinGecko" with a link). No API resale. No ML training on the data. A paid commercial plan is needed before a market launch. The user cannot pay for a plan today, so the keyless public API is used until then. | Ready, off until `price_provider` is set to `coingecko` |
| ATLAS on this computer (`localhost:3000`) | Prices plus paper predictions when the owner is running ATLAS | Local only, never from the hosted site | The owner's own ATLAS instance. Crypto and stock figures there follow ATLAS's own feed licences. | Used when ATLAS is reachable; lights can leave grey only from this path |
| IEX / stock prices | Stock rows and paper stats | Only through ATLAS on this computer | Not fetched directly by Explain. The hosted app tells the visitor to connect ATLAS. | Shown as a gap with an honest "Connect ATLAS" note when only a public crypto feed is used |
| Firebase / Gemini | Educational explanations | Firebase AI Logic, App Check | Google's terms for Firebase and Gemini. Explanations are generated, not a market-data feed. | Cloud fallback and the hosted app |

## Official free sources (scheduled data job)

Added 2026-11-13. Fetched by `.github/workflows/market-data.yml` (`scripts/data/build-data.ts`), validated against the Asset schema, and published to the separate free hosting site https://atlas-explain-data.web.app. The app re-validates every record before showing it. Plan: docs/ux/MULTI_ASSET_CATALOG.md.

| Source | What the app shows | Licence (summary; legal review to confirm ⚑ rows) | Attribution shown |
| --- | --- | --- | --- |
| US Treasury daily par yield curve | US yields 1M–30Y, daily | US federal government data ⚑ | "Source: U.S. Department of the Treasury" |
| ECB euro reference rates | EUR pairs and crosses derived from two ECB rates (labelled) | Free use if reproduced accurately with the ECB cited; for information, not transactions | "Source: European Central Bank" |
| Bank of Canada Valet API | CAD pairs; Government of Canada benchmark bond yields | Free to use, copy and distribute with attribution ⚑ | "Source: Bank of Canada" |
| EIA open data | WTI, Brent and Henry Hub daily spot (needs a free `EIA_API_KEY`; skipped without it) | US government data, public domain | "Source: U.S. Energy Information Administration" |

None of these feeds is used to train a model. Stock, ETF, index, gold and silver prices are **not** shown: no free source is licensed for public display.

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

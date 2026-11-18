# ATLAS Explain data files

ATLAS Explain publishes the data its web app and connector use as plain JSON, free and without a key, from the connector's Worker. Start at the index:

```
https://atlas-explain-mcp.atlas-explain.workers.dev/data/v1/
```

The index (`atlas-explain-data-index-v1`) lists every file with its address, schema version, refresh rate, last capture time, and each source with what it permits.

| File | Schema | What it holds | Refresh |
|---|---|---|---|
| `market.json` | `atlas-explain-market-v1` | US Treasury yields; ECB and Bank of Canada rates and FX; EIA energy prices; SEC-filed company figures | Hourly on a visit; every 6 hours by schedule |
| `crypto.json` | `atlas-explain-crypto-v1` | Ten coins: price, change, best bid and ask; 30 days of hourly closes; the best 100 order-book levels a side | Prices every few minutes; history and books every 10 minutes |
| `news.json` | `atlas-explain-news-v1` | Headline, link, publisher and time of market news and official releases | Every 15 minutes; GDELT every 3 hours |
| `economy.json` | `atlas-explain-economy-v1` | US CPI and unemployment, fed funds and SOFR, euro HICP and the ECB deposit rate, Canada's policy rate, the UK's Bank Rate, US public debt, upcoming Fed, ECB, Bank of Canada and Bank of England decisions, and US Treasury auctions (`auctions`, since 18 Nov 2026) | Every 6 hours |
| `world.json` | `atlas-explain-world-v1` | GDP growth, inflation, unemployment and GDP per person for the G20 and the EU, about eight years each, from the World Bank (CC BY 4.0); actual values only | Once a day |

Readers for each schema live in the repository (`src/data/crypto.ts`, `src/data/economy.ts`, `src/data/market-sources.ts`, `src/core/news.ts`). A schema changes name (`-v2`) only when a change would break a reader; new optional fields can appear within a version.

## Terms of use

- **For information and education.** Not for transactions or trading decisions. ATLAS Explain gives no advice, and nothing here is a recommendation or a forecast.
- **Credit the original source.** Every value carries its source and time; keep them with the value when you show it.
- **Check each source's own terms.** Official sources (US Treasury, BLS, Fed and New York Fed, ECB, Bank of Canada, SEC, EIA) allow reuse with credit; the ECB's reference rates are "for information purposes only". Market data from Kraken and CoinGecko is marked `"licence": "review"` in the index: its terms are under legal review, so do not republish it commercially or use this copy to drive automated trading.
- **No guarantee.** Sources can be late, revised or missing; files say so instead of filling gaps. Build anything that matters on the original sources.

Plans for developer access (API keys and higher limits) are in `docs/PLATFORM_PLAN.md`, phase C. They wait on the licence review.

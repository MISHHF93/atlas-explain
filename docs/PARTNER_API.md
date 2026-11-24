# ATLAS Explain partner API (sandbox)

ATLAS Explain's explanations and sourced official figures for other companies' apps and AI agents: banks,
brokers, neobanks and fintechs. Education only: nothing here recommends, rates or forecasts anything.

Status: **sandbox** (since 18 Nov 2026). Free, rate-limited, keys issued by hand. Not yet for production use
or for sale: the partner terms below are a draft for a lawyer to review first.

## Two ways in

| Way | Address | For |
|---|---|---|
| REST | `https://atlas-explain-mcp.atlas-explain.workers.dev/api/v1/…` | A partner's own app or back end |
| MCP | `https://atlas-explain-mcp.atlas-explain.workers.dev/mcp` with the partner key | A partner's AI agent |

Both take `Authorization: Bearer atlx_sbx_…`. `GET /api/v1` lists the endpoints without a key, and
`GET /api/v1/catalog` (no key) gives everything as one JSON object: tools with their schemas, endpoints, series and reuse rules. The public
connector at `/mcp` without a key is unchanged and stays free.

## Endpoints

| Method and path | What it returns |
|---|---|
| `GET /api/v1/terms?q=` | Glossary terms in plain language (all terms when `q` is empty) |
| `GET /api/v1/brief/{asset}` | Evidence brief on a stock, ETF, currency, rate or commodity (not crypto) |
| `GET /api/v1/notable` | What stands out in today's official data, each item with its rule and source (crypto moves left out) |
| `GET /api/v1/calendar?only=rates\|data&format=json\|ics` | Rate decisions and US data releases with exact times and "if this happens"; `format=ics` gives one calendar file |
| `GET /api/v1/economy?topic=` | Inflation, jobs, policy rates, US debt |
| `GET /api/v1/countries?indicator=&countries=` | G20 GDP growth, inflation, unemployment, GDP per person (World Bank) |
| `GET /api/v1/auctions?kind=` | US Treasury auctions, announced and recent results |
| `GET /api/v1/figures?q=` | Treasury yields, ECB and Bank of Canada rates, EIA energy, SEC-filed company figures |
| `POST /api/v1/scam-check` `{"text": "…"}` | Which investment-fraud warning signs a message shows; where to check and report |
| `POST /api/v1/money` `{"calculation": "fees", …}` | Compound growth, fees, inflation or diversification from given numbers (same inputs as `money_maths`) |
| `GET /api/v1/decisions/{bank}?date=` | `fed`, `boc`, `ecb` or `boe`: the latest rate decision (or the one before), how the statement changed word for word, and what the bank says it is watching, quoted with links. Bank of Canada and Bank of England quotes are kept to 25 words while their reuse terms are confirmed ⚑ |
| `GET /api/v1/speeches/{bank}?days=` | Recent speeches by that bank's policymakers, with the bank's own description and a link |
| `GET /api/v1/whats-changed?topic=&since=&days=` | Every official figure that moved since a date (up to 90 days), the statements and speeches since, and the next decisions |
| `GET /api/v1/inflation?amount=&from_year=&to_year=&country=` | What money from one year buys in another (US from 1913, Canada from 1914, UK from 1988, euro area from 1997) |
| `POST /api/v1/rate-impact` `{"product": "heloc", …}` | What a rate change does to a variable mortgage, HELOC, savings or GIC/CD, to the cent (same inputs as `rate_change_impact`) |
| `POST /api/v1/debt-payoff` `{"debts": [...], "monthly_budget": …}` | The avalanche and snowball methods side by side (same inputs as `debt_payoff`) |

Every answer is `{ "data": …, "meta": { "apiVersion", "generatedAt", "educationOnly": true, "notice", "credit", "terms" } }`.
`meta.credit` says what must be shown with the data. Errors are `{ "error": { "code", "message" } }`:
`missing_key` / `invalid_key` (401), `not_licensed` (403), `not_found` (404), `method_not_allowed` (405),
`daily_limit` (429, with `Retry-After`), `not_available` (404 or 503).

On `/mcp` a partner key hides `crypto_prices`, `price_history` and `market_depth` and refuses calls to them. Since
1.30.0 a partner's call also can't read the crypto file at all, so `evidence_brief` and `asset_details` refuse
questions about a coin and `notable_today` leaves crypto moves out; before that, those three could still carry
crypto prices on `/mcp`. The finished answer is checked again before it is sent.

## Limits

- Sandbox keys: 1,000 calls a day (pilot keys: 10,000), reset at midnight UTC. `X-RateLimit-Remaining` on
  each answer. Counted per Worker instance and saved every 25 calls or 5 minutes, so the limit is
  approximate by a few calls; that keeps usage inside the free plan's 1,000 KV writes a day.
- The whole Worker shares Cloudflare's free-plan ceiling of 100,000 requests a day. Real partner traffic
  needs the Workers paid plan ($5 a month), an owner decision.

## What partners may redistribute

| Content | Redistribution | Credit |
|---|---|---|
| Glossary, explainers, "if this happens", scam warning signs, money maths | ATLAS Explain's own content | "ATLAS Explain" |
| US Treasury, BLS, EIA, SEC, TreasuryDirect, Federal Reserve | Public domain | The agency, as in `meta.credit` |
| World Bank | CC BY 4.0 | "World Bank, World Development Indicators" |
| ECB, Bank of Canada, Bank of England, New York Fed | Reuse with attribution; each bank's terms to be confirmed before paid use ⚑ | The bank |
| Headlines in `notable` | Titles and links only; publishers own the articles | The publisher |
| **Crypto prices** | **Not offered**: Kraken's and CoinGecko's terms forbid redistribution without a paid licence | — |

## Issuing and revoking keys (owner)

```
node scripts/partners/issue-key.mjs --name "Acme Bank"            # shows the key once and the command
node scripts/partners/issue-key.mjs --name "Acme Bank" --apply    # writes the key's hash to KV
node scripts/partners/issue-key.mjs --revoke <hash> --apply       # turns a key off
```

The key itself is never stored: only its SHA-256 hash, with the partner's name, tier and daily limit
(KV `partners/keys/<hash>`). Send keys privately.

## Draft partner terms (for a lawyer to review before any paid use)

1. **Education only.** The content explains and reports; it is not investment advice, a recommendation, a
   rating or a forecast, and partners must not present it as any of these.
2. **The partner's own compliance.** The partner is responsible for how it uses and presents the content
   under the rules that apply to it (for example FINRA Rule 2210 for US broker-dealers, securities
   registration rules in Canada), including review of AI-generated communications.
3. **Credit.** Show the source named in `meta.credit` (and per fact or item) wherever the data is shown.
4. **No crypto prices, no resale of raw feeds.** Partners may not resell the API itself or present the data
   as their own feed.
5. **Accuracy.** Figures are reproduced from official sources as published, with their times; ATLAS Explain
   does not guarantee them and they can be revised by their publishers.
6. **Availability.** Sandbox keys have no uptime commitment and can be revoked.

## Next steps (not built)

- Webhooks: "CPI release in 1 hour", a new notable item, pushed to the partner.
- Self-serve keys and paid tiers through the existing Stripe setup (docs/MONETIZATION.md).
- Per-partner usage reports (Workers Analytics Engine, if within the free allowance).

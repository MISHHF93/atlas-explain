# Usage pricing: charging partners and agents by what they use

Plan, 19 Nov 2026. Status: **proposed, not built, nothing charged.** `billing_enabled` stays false until the owner decides. It sits beside `docs/PRICING.md`, which covers people using the web app (Free and Pro, unchanged). This file covers businesses and AI agents that call ATLAS Explain: the partner API (`docs/PARTNER_API.md`) and the keyed connector.

The public connector stays free for people. Charging is for businesses and agents that call it at volume, through a partner key.

## 1. What a call costs us

Measured on the live connector on 19 Nov 2026: across 54 tool calls, the median answer took 53 ms and the 90th percentile 173 ms. A call is one Worker request, a read or two from KV, and a few milliseconds of CPU time. The rates below are Cloudflare's published Workers Paid rates; check them before relying on this.

| Part | Rate (Workers Paid, US$ 5 a month) | Per call |
|---|---|---|
| Request | 10 M a month included, then $0.30 per million | $0.0000003 |
| CPU time | 30 M ms included, then $0.02 per million ms; about 5 ms a call | $0.0000001 |
| KV reads | 10 M included, then $0.50 per million; about 2 a call | $0.000001 |
| Usage counter (KV write every 25 calls) | 1 M included, then $5 per million | $0.0000002 |
| **Total** | | **about $0.0000016: $1.60 per million calls**, after a $5 monthly floor |

The data itself is free: government and central-bank sources, the World Bank and the OECD, all reusable with credit. The real costs are elsewhere:
- **Fixed costs:** the $5 Workers Paid plan, needed before selling (see 5), a lawyer's review of the partner terms, and an accountant for sales tax.
- **Payment fees:** Stripe takes 2.9% + $0.30 per card payment and 0.7% of Billing volume (check current rates). Small card payments are costly, which is why credits are sold in top-ups of $10 or more.
- **Explanations from Gemini** cost a fraction of a cent each, but they're only in the web app, not the partner API.

So price on **value**, not cost. Gross margin is above 99% at any of the prices below.

## 2. What the market charges

These figures come from third-party comparisons and vendor pages, which often disagree. Check before quoting.

- **Financial data APIs** sell monthly plans with request limits:
  - [Financial Modeling Prep](https://multiples.vc/compare/fmp-api-alternatives/md) from about $19 a month;
  - Alpha Vantage from about $50, with [$250 for 600 calls a minute](https://apicostcalc.com/alpha-vantage.html);
  - Massive (formerly Polygon) from about $99–199 ([comparison](https://dev.to/pickuma/polygon-vs-alpha-vantage-which-stock-data-api-fits-a-side-project-budget-57d1)).

  They sell raw prices. ATLAS sells sourced explanations and official figures with the licence attached, a different product.
- **MCP servers:** the usual models are per-call, credits, subscriptions and hybrids ([Zuplo](https://zuplo.com/blog/mcp-monetization-models), [Dodo Payments](https://dodopayments.com/blogs/mcp-server-pricing-models)). Marketplaces take 15–20%: Apify keeps 20%, Agent Bazaar 18%, MCPize pays developers 85% ([overview](https://dev.to/nicolas_fainstein/the-state-of-mcp-monetization-in-2026-28i4)).
- **Agent micropayments (x402):** Coinbase and Cloudflare's x402 standard lets an agent pay per request in stablecoins. A median of about $0.028 a call is reported (single source). Cloudflare's Monetization Gateway added it at the edge in July 2026 ([InfoQ](https://infoq.com/news/2026/07/cloudflare-aws-x402-micropayment/), [The Block](https://www.theblock.co/news/business/2025-09-24-cloudflare-coinbase-launch-x402-foundation-372064)). Analysts note much of the traffic is still testing, not commerce ([Forkast](https://forkast.news/cloudflare-built-the-payment-layer-for-the-agentic-internet-the-agents-arent-paying-yet/)).
- **Stripe** meters usage (included up to 100 M events a month) and supports [credit-based pricing](https://docs.stripe.com/billing/subscriptions/usage-based/use-cases/credits-based-pricing-model). Credits burn down at invoice time; real-time burndown is in private preview.

## 3. The model: ATLAS credits

One credit is one simple answer. Tools that combine several sources cost more, because they do more for the caller, not because they cost us more. A partner sees one number, credits left today and this month, on every answer.

| Credits | Tools and endpoints |
|---|---|
| **1** | Simple look-ups:<br>• `explain_term`, `browse_glossary`, `asset_details`, `official_figures`;<br>• `economy_snapshot`, `economic_calendar`, `upcoming_events`, `treasury_auctions`;<br>• `compare_countries`, `todays_headlines`, `speech_tracker`;<br>• `money_maths`, `rate_change_impact`, `scam_red_flags`;<br>• REST equivalents (`/terms`, `/figures`, `/economy`, `/calendar`, `/auctions`, `/countries`, `/scam-check`, `/money`) |
| **2** | `data_series` and `/series` (dated rows and CSV), `notable_today` and `/notable` |
| **3** | `evidence_brief` and `/brief/{asset}`, `decision_explainer` (several sources combined, with the wording diff) |
| **0** | Errors, refusals (unknown asset, crypto refused to partners) and `GET /api/v1` (the list). A failed answer is never charged. |

Never sold at any price: crypto prices (their licence doesn't allow redistribution), individual stock, fund or index prices (no display licence), and anything that recommends, rates or forecasts. Credits buy explanations and official figures only.

## 4. Plans

| | **Sandbox** | **Builder** | **Growth** | **Enterprise** |
|---|---|---|---|---|
| For | Trying it | AI-agent and app builders, small fintechs | Fintechs, publishers, credit unions, workplace wellness | Banks, brokers, large platforms |
| Price | $0 | Prepaid credits:<br>• $10 for 5,000 ($0.0020 each);<br>• $50 for 30,000 ($0.0017);<br>• $200 for 150,000 ($0.0013) | $99 a month, with 100,000 credits; then $0.0012 each | From $500 a month, billed yearly; 1 M credits a month; then $0.0008 each |
| Limit | 1,000 credits a day | What's prepaid; credits last 12 months | 100,000 a month, plus pay-as-you-go | Agreed |
| Use | Not in production | Production | Production | Production, with redistribution rights where sources allow |
| Widgets | ATLAS branding | ATLAS branding | Partner's name and colours | Full white-label, tone presets, product mapping |
| Support and SLA | None | Email, best effort | Email within 2 business days; 99.5% target | Named contact; 99.9% with service credits |
| Compliance | — | Sources on every answer | Plus a monthly usage report | Plus a per-answer audit log and a lawyer-reviewed licence |

**Why these numbers**
- **Builder at $0.002 a credit** sits under the reported x402 median ($0.028) and under the cheapest data-API plans for light use. A $10 top-up keeps Stripe's fee under 6%.
- **Growth at $99** sits in the same range as Massive and Alpha Vantage's mid plans, while selling something they don't: explanations with sources and licences.
- **Enterprise from $500 a month** is a starting point for a bank pilot. Similar compliance content usually sells for more, so it's room to grow, not a ceiling.

**Worked examples** (an average of about 1.4 credits a call)
- **An agent builder:** 3,000 calls a day is about 126,000 credits a month. On Growth, that's $99 plus 26,000 × $0.0012 = **about $130 a month**. Cost to us: about $0.15.
- **A credit union's app:** 50,000 members, 20% using it a month, three answers each, is about 45,000 credits. That's **$99 a month** on Growth.
- **A personal-finance site's widget:** the calculator runs in the visitor's browser, so it uses no credits. The site pays for its branding (Growth) and for any API calls behind it.

## 5. What has to be built (in order, behind flags)

1. **Count credits, not calls.** Built 19 Nov 2026, off (`CREDITS_ENABLED = "0"` in `wrangler.toml`). With it on, the daily limit is in credits, and answers carry `X-Credits-Used`, `X-Credits-Remaining` and `meta.credits` (REST) or `_meta["io.atlas-explain/credits"]` (MCP). Errors, refusals and non-tool requests cost nothing (`test/credits.test.ts`).
   - A weight table in `src/mcp/partner.ts`; partner records gain `plan`, `monthlyCredits` and `prepaidBalance`.
   - Every answer carries `X-Credits-Remaining` and `meta.credits`.
   - Errors cost nothing.
   - The flag `credits_enabled` (off) gates all of it.
2. **A shared counter.** Today each Cloudflare instance counts on its own, so a limit is approximate. Charging money needs one counter. A Durable Object per partner is the simple fix; it needs Workers Paid ($5 a month), so it's built only with the first paying partner.
3. **Billing through Stripe.**
   - Builder: prepaid credits by Checkout.
   - Growth and Enterprise: monthly plans, with usage sent to Stripe Meters once a day (well under the 100 M events included).
   - Reuse the existing webhook (`src/mcp/billing-webhook.ts`) for "paid", "renewed" and "cancelled".
   - Never store card details.
4. **A partner page.** Usage today and this month, credits left, invoices (Stripe's customer portal) and key rotation.
5. **Later:** an x402 price on the public connector for agents that pay per call without an account. Only when the owner decides, since it means accepting stablecoin payments: a tax and regulatory question first.

## 6. Owner decisions

1. **Prices.** The numbers in 4 are a starting proposal; test them with the first three partners before publishing them.
2. **Workers Paid ($5 a month)** with the first paying partner. That's the only cost, and revenue covers it from the first Builder top-up.
3. **Stripe setup** and `billing_enabled` (`docs/MONETIZATION.md`, Go-live). It stays off until then.
4. **Lawyer:** the partner terms (`docs/PARTNER_API.md`) and the Bank of Canada and Bank of England reuse terms before any paid redistribution.
5. **Accountant:** GST/HST registration and Stripe Tax for selling to businesses.
6. **x402:** whether to accept stablecoin payments at all (section 5, step 5).
7. **The GitHub billing lock:** fix it so CI runs before money is involved.

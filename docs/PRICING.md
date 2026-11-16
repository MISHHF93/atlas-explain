# Pricing

**Status: revised 16 Nov 2026 for the MCP-first product, replacing the plan approved 13–14 Nov. Nothing here is live.** `billing_enabled` stays `false` until the owner flips it after hackathon judging. How payments are processed is in `docs/MONETIZATION.md`.

**What changed on 16 Nov 2026.**

- The Chrome extension is gone (15 Nov), so "highlight-to-explain in Chrome" is no longer a feature or a plan row.
- The product is **MCP first, web app second**. The AI-assistant connector is the front door, and it stays free.
- Pro sells what costs money or takes ongoing work: cloud answers in the web app, synced history, and, once they exist, premium connector tools.
- Pro turns on **instantly**: Stripe notifies the Cloudflare Worker, which already runs the connector for free, instead of a GitHub job 15 minutes later.

Prices, no trial, the FOUNDER code and the refund terms are unchanged.

## What costs money (and what doesn't)

| Part | Who pays | Cost to the owner today |
|---|---|---|
| Gemini Nano (on-device, desktop Chrome) | The user's own computer | Nothing, however much it's used |
| Cloud fallback (Gemini through Firebase AI Logic, for phones and computers without Nano) | The Firebase project, on Gemini's free tier | Nothing: no card is on file, so past the free quota requests fail and are never billed |
| The connector in Claude, ChatGPT, Cursor, VS Code | The user's own assistant plan does the AI work | Nothing: Cloudflare Workers free plan, 100,000 requests a day |
| Live data | Free official sources and public market data | Nothing (Kraken's and CoinGecko's terms are on the legal review list) |
| Stripe | A fee per sale, taken from the revenue | Nothing upfront; about 2.9% + C$0.30 per domestic card charge |

Running cost is zero. The limit is free quotas, not a bill. Revenue should first pay for the things that lift those quotas: the paid Gemini tier, and a commercial data licence if Pro ever shows licensed prices.

## Principles

1. **The core product is free and stays free.** The connector and all its tools, the web app's Explain, Learn and Assets with live prices are free. On-device Gemini Nano answers cost nothing, so they are unlimited on every plan.
2. **Pro pays for what costs money or ongoing work:** cloud model calls, synced storage, and premium connector tools.
3. **Honest limits.** "Unlimited" is never claimed where a fair-use cap exists. The cap is printed.
4. **Never sell what isn't built.** A Pro line item appears on the pricing page only once it works for a signed-in member of the public.
5. **Education only, on every plan.** No plan, tool or price tier ever adds buy or sell calls, verdicts or forecasts. ATLAS prediction leans stay withheld unless `clearedForPublic`, whatever the plan.

## Plans

| | **Free** | **Pro** |
|---|---|---|
| Price | $0 | **US$5.99 / month** or **US$47.99 / year** (≈ $4.00 / month, save 33%) |
| AI-assistant connector: all tools, charts in the chat | ✓ | ✓ |
| Web app: on-device explanations (Gemini Nano) | Unlimited | Unlimited |
| Web app: cloud explanations (phones, computers without Nano) | 10 a day | 100 a day (fair use) ¹ |
| Follow-ups, related terms, Learn library | ✓ | ✓ |
| Assets: live prices, official figures, economy and calendar, with source and time | ✓ | ✓ |
| Watchlist | 10 assets | Unlimited (hard cap 50) |
| History of explanations | Synced while signed in ² | Synced across devices |
| Premium connector tools ³ | – | ✓ |
| Data export and account deletion | ✓ | ✓ |

¹ Remote Config `pro_cloud_daily_limit`, default 100, because cloud answers share Gemini's free quota. It goes to 300, with the stronger Gemini Flash model, once revenue pays for the paid Gemini tier. Free's limit is `free_cloud_daily_limit`, default 10. Both reset at 00:00 UTC.

² Every signed-in account syncs today. Whether syncing becomes Pro-only is an open owner decision. Until it is decided, it is not sold as a Pro benefit.

³ **Not built, so not sold yet.** Candidates, in the order they would earn their place:
   - **Evidence brief:** one asset's figures, recent moves, the economic backdrop, news and official releases, liquidity (spread and depth), and the arguments on both sides, with "what we don't know". Never a verdict.
   - **Release alerts:** a note when a followed rate decision or data release (CPI, jobs) comes out.
   - **Longer history:** more than 30 days of prices, and two years of economic series.

   These need the connector to know who is calling, so it needs a sign-in (OAuth), which Claude's directory supports. The free tools stay free and keep working with no account. See `docs/MONETIZATION.md`, "Phase 3".

The pricing page shows only the rows that work. Until premium connector tools exist, Pro sells as: more cloud answers in the web app, the larger watchlist, and (if the owner decides) synced history.

## Why these numbers

**Cost per user is tiny; free quotas are the ceiling.** A cloud explanation is about 1–2k input tokens and about 600 output tokens: a small fraction of a cent at published Flash-Lite rates. (Check current Gemini rates before moving to the paid tier.) Until then the real limit is the project's shared free Gemini quota, which is why Pro's cap is 100.

**Break-even.** After Stripe fees, a monthly subscriber nets about US$5.50 and a yearly one about US$45.50 (≈ $3.80 a month). With today's zero running cost every subscriber is margin. The first revenue should go to the paid Gemini tier, which also removes the EEA/UK limit and Google's use of free-tier prompts (see `docs/MONETIZATION.md`).

**Why $5.99.** ATLAS Explain is a learning tool, not a research terminal. It should be an easy yes for an everyday investor: below a streaming subscription and far below research products that charge hundreds a year. At this price the fixed C$0.30 Stripe fee stays under 10%. Below about $4 the fee bites hard.

**Why yearly at $47.99.** Eight months' price for twelve: a strong, honest incentive that also improves cash flow and lowers churn, without making monthly look like a trap.

**Currency and tax.** List prices in USD. Turn on Stripe Adaptive Pricing so visitors pay in their local currency (CAD for Canadians). Turn on Stripe Tax so GST/HST is calculated on Canadian sales. Prices are shown before tax, and checkout shows the tax line. The registration decision belongs to the owner and their accountant (see `docs/MONETIZATION.md`).

## Trial: none at launch

The free plan is the trial: every feature is usable, only the cloud volume differs. A card-required trial adds "surprise charge" support load and refund requests for little gain at this price. Revisit after a month of conversion data. If one is added, use a 7-day trial on the **yearly** plan only, with a reminder email 2 days before it ends.

## Coupons

Turn on **promotion codes** on the Payment Links. Codes are created in the Stripe dashboard, never in code. Suggested launch code: `FOUNDER` for 40% off the first year of the yearly plan, limited to the first 500 redemptions, expiring 60 days after launch.

## Refunds (proposed; needs a lawyer's review)

- Cancel any time in the customer portal. Pro runs to the end of the period already paid.
- **14-day refund on the first payment** of either plan, by request to the support email.
- Renewals are not refunded, except where the law requires it. Consumer law in the EU, the UK and Quebec gives extra withdrawal rights, which the final terms must reflect.

## Upgrade prompts (honest, not pushy)

- Shown only when they help: when the daily cloud limit is reached, and in Account → Plan. Never as a pop-up on load, never as a countdown, never during onboarding, and never inside the connector's tool answers.
- The limit message says what happened, what still works and when it resets: "You've used today's 10 cloud explanations. Answers on this device still work, and so does the AI-assistant connector. The limit resets at 00:00 UTC. Pro raises it to 100 a day."
- One "See Pro" link. No "Upgrade now!" button styling and no repeat prompts in the same session.

## Stripe objects to create (owner, in test mode first)

| Object | Value |
|---|---|
| Product | `ATLAS Explain Pro` |
| Price (monthly) | US$5.99, recurring monthly, lookup key `pro_monthly` |
| Price (yearly) | US$47.99, recurring yearly, lookup key `pro_yearly` |
| Payment Links | One per price; promotion codes on, Stripe Tax on, Adaptive Pricing on; redirect to `/app/account?checkout=done` |
| Customer portal | Cancel at period end, switch monthly/yearly, update the card, view invoices; login link on |
| Webhook | Endpoint `https://atlas-explain-mcp.atlas-explain.workers.dev/billing/v1/stripe`, events listed in `docs/MONETIZATION.md` |

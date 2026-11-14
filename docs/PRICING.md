# Pricing

**Status: PROPOSED. Waiting for owner approval. Nothing here is live.** `billing_enabled` stays `false` until the owner flips it after hackathon judging.

## Principles

1. **The core product is free and stays free.** Highlight-to-explain, the web Explain, Learn, Assets with live prices and local history are all free. On-device Gemini Nano answers cost us nothing, so they are unlimited on every plan.
2. **Pro pays for what costs us money:** cloud model calls, synced storage and licensed market data.
3. **Honest limits.** "Unlimited" is never claimed where a fair-use cap exists. The cap is printed.
4. **Never sell what isn't built.** A Pro line item appears on the pricing page only once it works for a signed-in member of the public.

## Plans

| | **Free** | **Pro** |
|---|---|---|
| Price | $0 | **US$5.99 / month** or **US$47.99 / year** (≈ $4.00 / month, save 33%) |
| Highlight-to-explain in Chrome | ✓ | ✓ |
| On-device explanations (Gemini Nano) | Unlimited | Unlimited |
| Cloud explanations (phones, and computers without Nano) | 10 a day | Up to 300 a day (fair use) |
| Cloud model | Gemini Flash-Lite | Gemini Flash (deeper answers, served first) |
| Follow-ups, related terms, Learn library | ✓ | ✓ |
| Assets: live prices with source and time | ✓ | ✓ |
| History | This browser | Synced across devices and the extension |
| Daily market digest | Headline summary | Full digest: movers, breadth, sources ¹ |
| Asset pages | Price, 48 h chart | Longer history, more timeframes ¹ |
| Data export and account deletion | ✓ | ✓ |

¹ These need the paid commercial data plan and the server-side digest job (see AUDIT.md §4). Until both are live, these rows are hidden on the pricing page. Pro then sells as: higher cloud limit, the stronger model and synced history.

The daily cloud limit resets at 00:00 UTC. The limit is a Remote Config value (`free_cloud_daily_limit`, proposed **10**, down from today's default of 50). The server enforces it, not the client.

## Why these numbers

**Cost per user is tiny; fixed costs dominate.** A cloud explanation is about 1–2k input tokens and about 600 output tokens. At published Flash-Lite rates that is a small fraction of a cent. Even a heavy Pro user at 300 calls a day costs well under the subscription price on Flash. (Check current Gemini rates on Google's pricing page before launch.) The real costs are fixed:

- a commercial market-data licence (the largest line; check the provider's current plan pricing),
- Firebase Blaze (Functions, Firestore),
- Stripe fees: about 2.9% + C$0.30 per domestic card charge, plus cross-border and currency fees on foreign cards (check in the Stripe dashboard).

**Break-even.** After Stripe fees, a monthly subscriber nets about US$5.50 and a yearly subscriber about US$45.50 (≈ $3.80 a month). Pro breaks even once subscriber revenue covers the data licence. That is a few dozen subscribers for a licence in the low hundreds of dollars a month.

**Why $5.99.** ATLAS Explain is a learning tool, not a research terminal. It should be an easy yes for an everyday investor, priced below a streaming subscription and well below research products that charge hundreds a year. At this price the fixed C$0.30 Stripe fee is still under 10%. Below about $4 the fee bites hard.

**Why yearly at $47.99.** Eight months' price for twelve. That is a strong, honest incentive that also improves cash flow and lowers churn. It's large enough to matter, and not so large that monthly looks like a trap.

**Currency and tax.** List prices in USD. Turn on Stripe Adaptive Pricing so visitors pay in their local currency (CAD for Canadians). Turn on Stripe Tax so GST/HST is calculated on Canadian sales. Prices are shown before tax, and checkout shows the tax line. The registration decision belongs to the owner and their accountant (see MONETIZATION.md).

## Trial: recommend none at launch

The free plan is the trial: every feature is usable, only the cloud volume and the model differ. A card-required trial adds "surprise charge" support load and refund requests for little gain at this price. Revisit after a month of conversion data. If one is added, use a 7-day trial on the **yearly** plan only, with a reminder email 2 days before it ends.

## Coupons

Turn on **promotion codes** in Stripe Checkout (`allow_promotion_codes: true`). Codes are created in the Stripe dashboard, never in code. Suggested launch code: `FOUNDER` for 40% off the first year of the yearly plan, limited to the first 500 redemptions, expiring 60 days after launch.

## Refunds (proposed; needs a lawyer's review)

- Cancel any time in the Customer Portal. Pro runs to the end of the period already paid.
- **14-day refund on the first payment** of either plan, by request to the support email.
- Renewals are not refunded, except where the law requires it. Consumer law in the EU, the UK and Quebec gives extra withdrawal rights, which the final terms must reflect.

## Upgrade prompts (honest, not pushy)

- Shown only when they help: when the daily cloud limit is reached, and on the Account → Plan section. Never as a pop-up on load, never as a countdown, never during onboarding.
- The limit message says what happened, what still works and when it resets: "You've used today's 10 cloud explanations. Answers on this device still work. The limit resets at 00:00 UTC. Pro raises it to 300 a day."
- One "See Pro" link. No "Upgrade now!" button styling and no repeat prompts in the same session.

## Stripe objects to create (owner, in test mode first)

| Object | Value |
|---|---|
| Product | `ATLAS Explain Pro` |
| Price (monthly) | US$5.99, recurring monthly, lookup key `pro_monthly` |
| Price (yearly) | US$47.99, recurring yearly, lookup key `pro_yearly` |
| Customer Portal | Allow cancel (end of period), switch between monthly and yearly, update the card, view invoices |
| Checkout | Promotion codes on, Stripe Tax on, Adaptive Pricing on |

The code resolves prices by **lookup key**, so no price id is committed and test and live mode use the same code.

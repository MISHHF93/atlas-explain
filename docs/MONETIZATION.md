# Monetization

**Revised 16 Nov 2026 for the MCP-first product.** Prices and plans are in `docs/PRICING.md`. ATLAS Explain stays free through #BuildHybridAI judging. The kill switch is Remote Config `billing_enabled`, default **false**. While it is false:

- Every visitor gets every feature, with no daily cloud limit beyond the per-browser abuse guard.
- On-device Gemini Nano answers are unlimited on every plan either way, because they cost the project nothing.
- The connector is free on every plan either way.
- The plan card shows **Free** with nothing to compare. No checkout button is rendered and `startCheckout` refuses to run.

## The design: no paid server, and Pro turns on instantly

The owner keeps the Firebase project on the free Spark plan with no card on file (14 Nov 2026), so there are no Cloud Functions. The Cloudflare Worker that already runs the connector and captures the live data (free plan) takes the server's job instead:

| Piece | How it works | Status |
|---|---|---|
| Checkout | A **Stripe Payment Link** per price. The app opens it with `?client_reference_id=<account id>`, so Stripe records which account paid. | Built (`src/core/billing.ts`) |
| Change or cancel | Stripe's hosted **customer portal** login link. | Built |
| Granting Pro | Stripe sends **webhooks** to the Worker at `/billing/v1/stripe`. The Worker checks Stripe's signature, then writes `users/{uid}/plan/current` in Firestore through the Firestore REST API, using a Google service account held as a Worker secret. Pro is on as soon as Stripe confirms payment. | Built 16 Nov 2026 (`src/mcp/billing-webhook.ts`); waits for the owner's Stripe setup and secrets |
| Matching later events | Subscription updates and cancellations carry the subscription id, not the account. The Worker keeps `billing/v1/sub/<subscription id>` → account id in its KV store, written at checkout. | Built |
| Reconciling | The existing job (`scripts/billing/sync-plans.ts`, run by hand from GitHub Actions) stays as a backup: it rebuilds every plan from Stripe if a webhook was ever missed. | Built, not yet run live |
| Reading the plan | The app reads that document. Firestore rules let an account read its own plan and never write it. | Built |
| Daily cloud limit | The app counts cloud answers in `users/{uid}/usage/{yyyy-mm-dd}` (UTC) and stops at the plan's limit. | Built |

Stripe is free to open and takes its fee from each sale. Webhooks, the Worker, KV and the Firestore writes all fit the free plans: a few writes per subscriber per month.

### Webhook events the Worker handles

| Event | What the Worker does |
|---|---|
| `checkout.session.completed` | Read `client_reference_id` (the account) and `subscription`; save the subscription → account mapping in KV; fetch the subscription (restricted key, read only) and write the plan document. |
| `customer.subscription.updated` | Look up the account in KV; rewrite the plan document with the new status, interval and period end. `active`, `trialing` and `past_due` count as Pro. |
| `customer.subscription.deleted` | Look up the account; **delete** the plan document (back to Free). |
| anything else | Answer 200 and ignore it. |

Rules the Worker follows:

- **Verify first.** Reject any request whose `Stripe-Signature` doesn't match `STRIPE_WEBHOOK_SECRET` (HMAC-SHA256 over the raw body, with a 5-minute timestamp tolerance). Nothing is read or written before that.
- **Idempotent.** Stripe retries and may send events twice or out of order. Each write is the full current state of the subscription, fetched from Stripe, so replaying an event changes nothing.
- **Never downgrade on an error.** If Stripe or Firestore can't be reached, answer 500 so Stripe retries. Never delete a plan because a read failed.
- **No card data.** The plan document holds the plan, subscription id and status, billing interval and period end. Nothing else.

Worker secrets (set with `npx wrangler secret put`, never in the repository): `STRIPE_WEBHOOK_SECRET`, `STRIPE_RESTRICTED_KEY` (read-only on Checkout Sessions and Subscriptions), `FIREBASE_SERVICE_ACCOUNT` (JSON for a service account with **Cloud Datastore User** only).

## What this design still cannot do (be honest about these)

1. **The daily limit is not enforced by a server.** Firebase AI Logic calls go straight from the browser to Gemini, so someone who modifies the app can skip the counter. What still holds: App Check blocks calls that don't come from the real site, the rules stop anyone resetting or lowering their counter or granting themselves Pro, and with no billing account nobody can run up a bill. The worst case is the project's shared free Gemini quota running out for the day.
2. **Cloud volume rests on Gemini's free tier.** The quota is shared by the whole project. That is why Pro's limit is `pro_cloud_daily_limit` (default 100), not 300, and why the stronger model is not sold yet. Set the number to what the quota page in Google AI Studio shows the project can actually serve.
3. **Scale.** Firestore's free quota covers thousands of subscribers at a few writes each a month. The app's own reads are the larger part. Revisit at a few hundred subscribers.

## Gemini free-tier terms (checked 14 Nov 2026, terms effective 23 Mar 2026)

The Gemini API terms at https://aistudio.google.com/docs/terms say two things that matter while the project has no billing account, because the free tier counts as "Unpaid Services":

- "You may use only Paid Services when making API Clients available to users in the European Economic Area", Switzerland or the United Kingdom. **The cloud fallback therefore should not be offered in those regions on the free tier.** On-device answers and the connector are not affected. This needs an owner decision (see `docs/legal/REVIEW_NOTES.md`).
- On Unpaid Services, Google uses submitted content and responses to improve its products, and human reviewers may read them. The privacy page says this. On the paid tier Google does not.

Both go away once revenue pays for the paid Gemini tier. That is the first thing revenue should buy.

## The phases

| Phase | What | Needs |
|---|---|---|
| 1. Free (now, through judging) | Everything free; `billing_enabled` false | Nothing |
| 2. Pro in the web app | Stripe test mode, the webhook endpoint's secrets, then live mode and `billing_enabled` true | Owner's Stripe account (the endpoint is built and tested) |
| 3. Pro in the connector | Premium connector tools (see `docs/PRICING.md` ³) behind a sign-in | Owner decision on which tools; engineer builds OAuth on the Worker |
| 4. Paid Gemini tier | Move the cloud fallback to Gemini's paid tier: Pro's limit to 300, the stronger model, EEA/UK allowed, no training on prompts | Revenue to cover it; owner adds a card to Google Cloud |

### Phase 3: how the connector learns who is calling

The free tools must keep working with no account, in every assistant. So the connector uses MCP's standard sign-in (OAuth 2.1), and only premium tools ask for it:

- In the Claude directory listing, authentication becomes **"Required when the server asks"**. Claude connects without credentials, and a premium tool answers that it needs a sign-in, so Claude prompts the user then.
- The Worker becomes the OAuth server for its own tools: authorization and token endpoints, plus the protected-resource metadata MCP clients look for. Signing in sends the user to the website's `/signin` (Firebase Auth, which already exists). The Worker then issues its own short-lived token tied to the account id, and checks the account's plan on each premium call.
- No premium tool is listed in `tools/list` until it works, and the directory listing is updated through Anthropic's review.

## What is in the repo

- Plan math, Stripe link checks and the plan-document reader: `src/core/billing.ts` (no Firebase).
- The limit check and the usage count for every cloud answer, in the web app: `src/platform/web/explain-service.ts` (`cloudGate`, `recordCloudAnswer`).
- Stripe records to plans, the plan document's fields, and the write/remove diff: `src/core/billing-sync.ts` (pure, tested in `test/billing-sync.test.ts`). The webhook and the reconciliation job share it.
- The webhook: `src/mcp/billing-webhook.ts`, routed by the Worker at `/billing/v1/stripe` (`src/mcp/live-data.ts`). Tested in `test/billing-webhook.test.ts` with Stripe-format signatures, a real RSA key for the Google token, and stand-ins for Stripe, Google and Firestore. Without its three secrets it answers 503, so it is harmless until the owner sets it up.
- The reconciliation job: `scripts/billing/sync-plans.ts` with `.github/workflows/billing-sync.yml` (manual runs only). It needs only Node.
- Remote Config keys: `billing_enabled`, `free_cloud_daily_limit` (10), `pro_cloud_daily_limit` (100), `pro_monthly_link`, `pro_yearly_link`, `billing_portal_link`. The three links are public URLs, not secrets. A value that is not a Stripe link is ignored and its button stays hidden.
- Rules: `users/{uid}/plan/{doc}` is read-only for its owner. `users/{uid}/usage/{day}` can be created at 1 and raised by exactly 1; today's counter cannot be deleted.
- Dev preview of the plan card with billing on: `/app?tab=settings&plan=free`, `plan=account` or `plan=pro`.

### Not verified yet

The logic and the webhook are tested against stand-ins. Nothing has run against real Stripe, Google or Firestore, because that needs the owner's Stripe account and secrets. The first real run is step 9 below, in test mode: Stripe's dashboard shows each delivery and the Worker's answer, and `npx wrangler@4 tail atlas-explain-mcp` shows a line per event ("billing evt_…: checkout for …: pro (active)").

## Go-live, after judging (owner steps, in order)

Leave `billing_enabled` false until the last step. Do everything in **Stripe test mode** first, then repeat steps 2 to 7 in live mode.

1. Confirm hackathon judging is over. (The webhook endpoint is built and deployed with the connector.)
2. **Stripe account.** Create one at stripe.com (free; it needs a bank account for payouts, not a card).
3. **Product and prices.** Product `ATLAS Explain Pro`; recurring prices US$5.99 monthly and US$47.99 yearly (lookup keys `pro_monthly`, `pro_yearly`).
4. **Payment Links.** One per price. For each: after payment → "Don't show confirmation page" → redirect to `https://atlas-explain.web.app/app/account?checkout=done`. Turn on promotion codes for the FOUNDER code, and Stripe Tax if your accountant says to. Copy the link (`https://buy.stripe.com/...`).
5. **Customer portal.** Settings → Billing → Customer portal: allow cancel at period end, switching between monthly and yearly, card updates and invoices. Turn on the **login link** and copy it.
6. **Restricted key.** Developers → API keys → Create restricted key with **Read** on *Checkout Sessions* and *Subscriptions* only. Copy it (`rk_test_...` or `rk_live_...`). Never paste it into the repository, a chat or an issue.
7. **Webhook.** Developers → Webhooks → Add endpoint `https://atlas-explain-mcp.atlas-explain.workers.dev/billing/v1/stripe` with the three events above. Copy its signing secret (`whsec_...`).
8. **Worker secrets.** From the repository folder, run each of these and paste the value when asked (it is never shown again):

   ```bash
   npx wrangler secret put STRIPE_WEBHOOK_SECRET
   ```

   ```bash
   npx wrangler secret put STRIPE_RESTRICTED_KEY
   ```

   ```bash
   npx wrangler secret put FIREBASE_SERVICE_ACCOUNT
   ```

   For the last one, create a service account in Google Cloud console → IAM with the role **Cloud Datastore User** only, make a JSON key, and paste the whole JSON. (No cost.)
9. **Test purchase.** In Remote Config set the three links to the *test-mode* links and `billing_enabled` to `true` **in a condition that only matches you**. Sign in on the site, open Account, choose a plan, pay with Stripe's test card, and confirm the plan card says Pro within seconds. Cancel in the portal and confirm it says Free. Stripe's dashboard shows each webhook delivery and its answer.
10. **Deploy rules** if not already live: `npx firebase-tools deploy --only firestore:rules`.
11. **Go live.** Repeat steps 3 to 8 in live mode, replace the secrets and the three Remote Config links with the live ones, set `free_cloud_daily_limit` and `pro_cloud_daily_limit`, then set `billing_enabled` to `true` and publish.

To switch billing off again, set `billing_enabled` to `false`. Existing subscriptions keep running in Stripe until you cancel them there.

## Account deletion and data

- Deleting an account does not cancel a Stripe subscription. The delete sheet tells a Pro user to cancel first.
- The plan document holds the plan, the subscription id and status, the billing interval and the period end. No card or address details ever reach Firestore or the Worker's store.
- Stripe is the record of who paid. Refunds are done in the Stripe dashboard; the cancellation webhook then removes Pro.

## Tax note for Ontario

This is not tax or legal advice. The operator is in Ontario. A paid digital subscription sold to customers in Canada can be a taxable supply. Ontario's HST rate is 13%. A small supplier under the GST/HST registration threshold (currently $30,000 of taxable supplies over four consecutive calendar quarters) may not have to register; crossing it generally means registering, charging HST, and filing. Stripe Tax can calculate tax on the subscription if it is turned on for the Payment Link. Confirm the place-of-supply treatment and the registration decision with an accountant before charging anyone.

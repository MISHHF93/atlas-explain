# Monetization

ATLAS Explain stays free through #BuildHybridAI judging. The kill switch is Remote Config `billing_enabled`, default **false**. While it is false:

- Every visitor gets every feature, with no daily cloud limit beyond the per-browser abuse guard.
- On-device Gemini Nano explanations are unlimited on every plan either way, because they do not cost the project.
- The plan card shows **Free** with nothing to compare. No checkout button is rendered and `startCheckout` refuses to run.

## Why there is no server

The owner decided on 14 Nov 2026 not to put a card on file, so the Firebase project stays on the free Spark plan. That rules out Cloud Functions, the "Run Payments with Stripe" extension and the `explainCloud` quota function from the original plan. This design costs nothing to run:

| Piece | How it works |
|---|---|
| Checkout | A **Stripe Payment Link** per price. The app opens it with `?client_reference_id=<account id>`, so Stripe records which account paid. |
| Change or cancel | Stripe's hosted **customer portal** login link. |
| Granting Pro | A scheduled GitHub Actions job (`.github/workflows/billing-sync.yml`, `scripts/billing/sync-plans.ts`) reads Checkout Sessions and subscriptions from Stripe with a **read-only** key and writes `users/{uid}/plan/current` in Firestore. |
| Reading the plan | The app reads that document. Firestore rules let an account read its own plan and never write it. |
| Daily cloud limit | The app counts cloud answers in `users/{uid}/usage/{yyyy-mm-dd}` (UTC) and stops at the plan's limit. |

Stripe itself is free to open; it takes its fee from each sale. The GitHub job is free because the repository is public.

## What this design cannot do (be honest about these)

1. **Pro is not instant.** It turns on at the next job run, about 15 minutes after payment (GitHub can start scheduled runs late). The app says so before and after checkout.
2. **The daily limit is not enforced by a server.** Firebase AI Logic calls go straight from the browser to Gemini, so someone who modifies the app can skip the counter. What still holds: App Check blocks calls that don't come from the real site, the rules stop anyone resetting or lowering their counter or granting themselves Pro, and with no billing account an abuser cannot run up a bill. The worst case is the project's shared free Gemini quota running out for the day.
3. **Cloud volume rests on Gemini's free tier.** The quota is shared by the whole project. That is why Pro's limit is `pro_cloud_daily_limit` (default 100), not the 300 in the original pricing, and why the stronger-model row is not sold yet. Set the number to what the quota page in Google AI Studio shows the project can actually serve.
4. **Scale.** Each job run reads one Firestore document per paying account (96 runs a day). The free Firestore quota covers a few hundred subscribers. Before that point, revenue can pay for Blaze and the original server design.
5. **Stripe's key lives in GitHub Actions secrets,** not Firebase secrets, because there is no Firebase server to hold it. It is a restricted, read-only key and is never in the repository.

## Gemini free-tier terms (checked 14 Nov 2026, terms effective 23 Mar 2026)

The Gemini API terms at https://aistudio.google.com/docs/terms say two things that matter while the project has no billing account, because the free tier counts as "Unpaid Services":

- "You may use only Paid Services when making API Clients available to users in the European Economic Area", Switzerland or the United Kingdom. **The cloud fallback therefore should not be offered in those regions on the free tier.** On-device answers are not affected. This applies to the app today, not only to Pro. It needs an owner decision (see `docs/legal/REVIEW_NOTES.md`).
- On Unpaid Services, Google uses submitted content and responses to improve its products, and human reviewers may read them. The privacy page now says this. On the paid tier Google does not.

Both go away if the project ever moves to the paid Gemini tier (Blaze).

## What is in the repo

- Plan math, Stripe link checks and the plan-document reader: `src/core/billing.ts` (no Firebase).
- The limit check and the usage count for every cloud answer, in the web app: `src/platform/web/explain-service.ts` (`cloudGate`, `recordCloudAnswer`).
- Stripe records to plans, and the write/remove diff: `src/core/billing-sync.ts` (pure, tested in `test/billing-sync.test.ts`).
- The job that does the network calls: `scripts/billing/sync-plans.ts`. It needs only Node, no `npm install`.
- Remote Config keys: `billing_enabled`, `free_cloud_daily_limit` (10), `pro_cloud_daily_limit` (100), `pro_monthly_link`, `pro_yearly_link`, `billing_portal_link`. The three links are public URLs, not secrets. A value that is not a Stripe link is ignored and its button stays hidden.
- Rules: `users/{uid}/plan/{doc}` is read-only for its owner. `users/{uid}/usage/{day}` can be created at 1 and raised by exactly 1; today's counter cannot be deleted.
- Dev preview of the plan card with billing on: `/app?tab=settings&plan=free`, `plan=account` or `plan=pro`.

### How the job decides

- An account is Pro while a completed Checkout Session carrying its id points to a subscription whose status is `active`, `trialing` or `past_due` (Stripe is still retrying the card).
- When the subscription ends, the plan document is **deleted**, which puts the account back on Free.
- Only differences are written. If any read from Stripe or Firestore fails, the job stops before writing, so an outage never downgrades a paying account.
- Refunding and cancelling in the Stripe dashboard ends the subscription; the next run removes Pro.

### Not verified yet

The pure logic is unit-tested. The job's live calls (Stripe list endpoints, the Firestore collection-group read, the document write and delete) have **not** been run against real services, because that needs the owner's Stripe account and secrets. Step 8 below is the first real run, in Stripe test mode with the dry-run switch.

## Go-live, after judging (owner steps, in order)

Leave `billing_enabled` false until the last step. Do everything in **Stripe test mode** first, then repeat steps 2 to 6 in live mode.

1. Confirm hackathon judging is over.
2. **Stripe account.** Create one at stripe.com (free; it needs a bank account for payouts, not a card).
3. **Product and prices.** Product `ATLAS Explain Pro`; recurring prices US$5.99 monthly and US$47.99 yearly.
4. **Payment Links.** Create one Payment Link per price. For each:
   - After payment → "Don't show confirmation page" → redirect to `https://atlas-explain.web.app/app/account?checkout=done`.
   - Turn on promotion codes if you want the FOUNDER code. Turn on Stripe Tax if your accountant says to (see the tax note).
   - Copy the link (`https://buy.stripe.com/...`).
5. **Customer portal.** Settings → Billing → Customer portal: allow cancel at period end, switching between monthly and yearly, card updates and invoices. Turn on the **login link** and copy it (`https://billing.stripe.com/p/login/...`).
6. **Restricted key.** Developers → API keys → Create restricted key. Give it **Read** on *Checkout Sessions* and *Subscriptions*, and nothing else. Copy it (`rk_test_...` or `rk_live_...`). Never paste it into the repository, a chat or an issue.
7. **GitHub.** In the repository: Settings → Secrets and variables → Actions.
   - Secret `STRIPE_RESTRICTED_KEY` = the key from step 6.
   - Secret `FIREBASE_SERVICE_ACCOUNT` already exists for the market-data job. In Google Cloud console → IAM, give that service account the role **Cloud Datastore User** so it can write plan documents. (No cost.)
   - Variable (not secret) `BILLING_SYNC` = `on`. Without it the job is skipped.
8. **First run.** Actions → "Billing plan sync" → Run workflow with **dry run** ticked. It should print how many paying accounts it found and write nothing. If it reports an error reading stored plans, tell the engineer: the Firestore read may need a one-time index, which the error message links to.
9. **Test purchase.** In Remote Config set the three links to the *test-mode* links and `billing_enabled` to `true` **in a Remote Config condition that only matches you** (or do it briefly and switch back). Sign in on the site, open Account, choose a plan, pay with Stripe's test card, run the workflow, and confirm the plan card says Pro. Cancel in the portal, run the workflow again, and confirm it says Free.
10. **Deploy rules** if not already live: `npx firebase-tools deploy --only firestore:rules`.
11. **Go live.** Repeat steps 3 to 6 in live mode, replace the secret and the three Remote Config links with the live ones, set `free_cloud_daily_limit` and `pro_cloud_daily_limit`, then set `billing_enabled` to `true` and publish.

To switch billing off again, set `billing_enabled` to `false`. Existing subscriptions keep running in Stripe until you cancel them there.

## Account deletion and data

- Deleting an account does not cancel a Stripe subscription. The delete sheet tells a Pro user to cancel first.
- The plan document holds the plan, the subscription id and status, the billing interval and the period end. No card or address details ever reach Firestore.
- Stripe is the record of who paid. Refunds are done in the Stripe dashboard.

## Tax note for Ontario

This is not tax or legal advice. The operator is in Ontario. A paid digital subscription sold to customers in Canada can be a taxable supply. Ontario's HST rate is 13%. A small supplier under the GST/HST registration threshold (currently $30,000 of taxable supplies over four consecutive calendar quarters) may not have to register; crossing it generally means registering, charging HST, and filing. Stripe Tax can calculate tax on the subscription if it is turned on for the Payment Link. Confirm the place-of-supply treatment and the registration decision with an accountant before charging anyone.

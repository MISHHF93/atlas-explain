# Monetization

ATLAS Explain stays free through #BuildHybridAI judging. The kill switch is Remote Config `billing_enabled`, default **false**. While it is false:

- Every visitor gets Pro entitlements, including unlimited cloud explanations.
- On-device Gemini Nano explanations are unlimited on every plan either way, because they do not cost the project.
- The pricing panel shows **Free during beta** and **Pro — coming after beta**.
- The checkout button is not rendered. `startCheckout` refuses to run.

Only cloud fallback calls are metered, and only after the flag is turned on. The free-plan cap is Remote Config `free_cloud_daily_limit` (default 50). A day is UTC `yyyy-mm-dd`, stored at `users/{uid}/usage/{yyyy-mm-dd}`.

## What is already in the repo

- Plan math lives in `src/core/billing.ts` (no Firebase).
- `PaymentProvider` in `src/core/payments.ts` is the swap point. The web adapter is `src/platform/web/stripe-payments.ts`.
- That adapter follows the Firebase **Run Payments with Stripe** extension: the signed-in user creates `customers/{uid}/checkout_sessions/{id}` with `price`, `success_url`, `cancel_url`, and `mode: "subscription"`. The extension (not this repo) writes `url` or `error`. Active plans are read from `customers/{uid}/subscriptions` where `status` is `trialing` or `active`.
- The price id constant is `PRO_PRICE_ID` (`price_pro_placeholder`) in `src/core/billing.ts`. It is not a Stripe secret. Replace it when a real price exists.
- Anonymous users can link Google with `linkWithPopup` so the uid, saved explanations, and usage stay together. Sign-in is not required while the app is free.
- Firestore rules let a user create their counter at 1 and then add exactly 1. They cannot write a subscription document. Clients cannot edit notes or watchlists onto an explanation.

## Rules tests

`usageWriteAllowed` in `src/core/billing.ts` is the same transition the rules enforce (create at 1, update by exactly 1, date matches the document id). `npm test` covers that function. `test/firestore-rules.test.ts` reads `firestore.rules` and checks that the increment clause and the subscription write denial are still in the file.

The Firestore emulator was not started as part of `npm test`. Before go-live, run these rules through `@firebase/rules-unit-testing` with `firebase emulators:exec --only firestore`.

## Go-live, after judging

Do these in order. Leave `billing_enabled` false until the last step.

1. Confirm hackathon judging is over. The rules require the app to be free until then.
2. Upgrade the Firebase project `atlas-explain` from Spark to **Blaze**. The Stripe extension needs Cloud Functions, and Cloud Functions are not on Spark. This repo does not add those functions.
3. In the Stripe Dashboard, create a product for Pro and a recurring price. Copy the price id (`price_...`).
4. Put that price id in `PRO_PRICE_ID` in `src/core/billing.ts` and ship the change. Do not commit a Stripe secret key, webhook secret, or service account.
5. Install the official extension **Run Payments with Stripe** from the Firebase console. Give it the Stripe secret in the extension's own config, not in this repository. Point it at the `customers` collection. The extension uses the Admin SDK, which bypasses the client rules when it writes `url` onto a checkout session and when it writes subscriptions.
6. Enable the **Google** sign-in provider under Authentication. Anonymous sign-in is already on. Linking uses `linkWithPopup`, so the anonymous uid is kept.
7. In Remote Config, set `free_cloud_daily_limit` if 50 is not the cap you want, then set `billing_enabled` to `true` and publish. The in-app default stays `false`, so a failed fetch cannot turn billing on.
8. Deploy rules if they changed: `npx firebase-tools deploy --only firestore:rules`.

After the flag is true, a free user who has used the day's cloud explanations sees a short limit note. On-device explanations still run. Checkout is the only new control, and it is hidden again if the flag goes back to false.

## Tax note for Ontario

This is not tax or legal advice. The operator is in Ontario. A paid digital subscription sold to customers in Canada can be a taxable supply. Ontario's HST rate is 13%. A small supplier under the GST/HST registration threshold (currently $30,000 of taxable supplies over four consecutive calendar quarters) may not have to register; crossing it generally means registering, charging HST, and filing. Stripe Tax can calculate tax on the subscription if it is turned on for the price. Confirm the place-of-supply treatment and the registration decision with an accountant before charging anyone.

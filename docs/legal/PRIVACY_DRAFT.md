# ATLAS Explain Privacy Policy (DRAFT)

> **DRAFT for review. Not final and not legal advice.** Written as a plain-language
> starting point. Have it reviewed before a public launch, fill in every `[TODO]`, and
> publish the final text at a stable URL (needed for the Chrome Web Store listing and
> the Google OAuth consent screen).

Last updated: [TODO date] · Operator: [TODO legal name], Ontario, Canada · Contact: [TODO privacy email]

## What ATLAS Explain is
An educational tool that explains trading terms and market moves in plain language.
It is not investment advice and it never gives buy or sell instructions.

## What we collect
| Data | When | Where it is stored | Why |
|---|---|---|---|
| Anonymous user id | Every visit to the web app | Firebase Authentication | Keep your saved explanations on this browser |
| Account id, email, display name | Only if you sign in with Google or an email link | Firebase Authentication | Keep saved explanations and settings across devices |
| Saved explanations (public move card, question, explanation, which engine ran) | When an explanation is saved | Cloud Firestore, under your user id | Show your history |
| Theme preference | Signed-in users who change it | Cloud Firestore | Sync your setting |
| Daily count of cloud explanations | Only if billing is switched on | Cloud Firestore | Fair-use limits for the free plan |
| Cloud call timestamps (no content) | Each cloud explanation | Your browser's local storage only | Browser-side fair-use limit |

We do **not** collect balances, account numbers, form fields, private notes or
watchlists. Private notes and watchlists are only used on your device and are dropped
from any cloud request.

## The Chrome extension
- Sends only the text you highlight, the page title and the site name, and only when you click Explain.
- Site permissions: `http://localhost:3000` (reads ATLAS on your own computer; nothing leaves your computer) and `https://atlas-explain.web.app` (our web app, which runs cloud explanations behind Firebase App Check and shares your sign-in).
- Explanation history in the extension stays in your browser.

## Where explanations run
- **On your device:** Gemini Nano in Chrome. The prompt does not leave your computer.
- **In the cloud:** Gemini through Google's Firebase AI Logic, with App Check. The public move card or highlighted text and your question are sent to Google to generate the answer. See Google's terms for the Gemini API: [TODO link to the applicable Google terms].

## Service providers
- Google Firebase (hosting, authentication, database, App Check, Remote Config, AI Logic). Google acts as our processor. Data may be processed outside Canada.
- Public crypto price feeds (Kraken or CoinGecko, selected in Remote Config and named next to the prices): your browser requests public prices directly. No account balances are sent. An optional CoinGecko Demo API key may be read from Remote Config. These prices are never used to train a model.
- Stripe: only if paid plans are switched on later. Card numbers would go to Stripe, never to us.

We do not sell personal information and do not use it for advertising.

## Your choices and rights
- Use the app signed out.
- Sign out at any time from the account menu.
- Ask us to access, correct or delete your account and saved explanations: [TODO privacy email]. We aim to respond within 30 days.
- Residents of Canada (PIPEDA), the EU/UK (GDPR) and California (CCPA/CPRA) may have additional rights. [TODO: confirm which regimes apply at launch.]

## Retention
Saved explanations and account data are kept until you delete them or ask us to delete your account. [TODO: set an inactivity retention period.]

## Children
ATLAS Explain is not directed to children under 13 [TODO: or 16 where applicable] and we do not knowingly collect their data.

## Changes
We will post updates here and change the "Last updated" date.

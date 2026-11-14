# Legal review notes

The published pages (`/privacy` and `/terms`, last updated 14 November 2026) are written as production text with no placeholders. A lawyer should confirm these points before a paid launch or a wide public launch. This is not legal advice.

## Facts only the owner can supply

| Item | Where | Why it matters |
|---|---|---|
| Legal name of the operator (person or company) | Privacy "Who we are", Terms intro | PIPEDA, Quebec Law 25 and GDPR expect the controller to be identified. The pages say "the ATLAS Explain project, Ontario, Canada" until then. |
| A privacy and support email | Privacy "Who we are" and "Your choices", Terms §10 | The pages point to the Support page, which today routes to GitHub issues; a dedicated email is better for privacy requests. |
| Google Analytics data retention | Privacy "Cookies, storage and analytics" | If analytics is turned on, set retention in Google Analytics (2 months suggested) and state it on the page. |

## Points for the lawyer

1. **Minimum age (16).** Confirm the age; it differs by country (13 in the US under COPPA, 13–16 in the EU).
2. **EU/UK users.** If we serve them actively: the lawful bases (contract for the service, legitimate interest for security checks, consent for analytics); whether a representative is needed; transfers to the US (Google's data processing terms and standard contractual clauses).
3. **Quebec (Law 25).** A person in charge of personal information, and a privacy impact assessment for transfers outside Quebec.
4. **Cookie consent.** Analytics is opt-in, with nothing set before consent. Confirm the bar's wording, and that reCAPTCHA (App Check) counts as strictly necessary security.
5. **Today's usage count after deletion.** Confirm it's acceptable that one pseudonymous record (a date and a count) stays until it's no longer needed, and set a written retention period for it.
6. **Terms §5 (payments and refunds).** The 14-day refund on a first payment, cancel-anytime and renewal disclosures; consumer rights in the EU, the UK and Quebec; GST/HST registration (see docs/MONETIZATION.md).
7. **Terms §8 (liability).** The "as is" and exclusion wording, and whether to add a liability cap.
8. **Terms §9 (governing law).** Ontario, subject to local consumer law.
9. **Education-only positioning.** Confirm the "not advice" wording is enough under Canadian securities rules for an app that explains market news, and that no feature amounts to advice.
10. **Third-party data.** The licence summaries in docs/legal/DATA_SOURCES.md, especially the rows marked ⚑, and CoinGecko's free-plan terms if a paid plan launches.

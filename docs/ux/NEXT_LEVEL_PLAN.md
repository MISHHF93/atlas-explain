# ATLAS Explain: next-level UX plan

Audit date: 13 Nov 2026 (main `8b896be`). Scope: the Chrome extension popup (and side panel, which reuses it) and the hosted web app at https://atlas-explain.web.app. Screens were captured with a headless browser from the built `dist/` and `extension/dist/` folders using the preview query flags (`?demo=`, `?tab=`, `?assets=`).

The rules do not change: education only (no buy/sell or recommendation wording), selected text only (never balances or account details), no made-up numbers (honest "Connect ATLAS" and "not ready" states), billing built in and switched off, fonts at 11px or larger, design tokens only.

## What works today

- One wallet shell for both surfaces: header with status pill, five tabs, slide-in sheet, onboarding overlay.
- Honest states everywhere: grey signal light by default, "Not ready yet" brief, Connect ATLAS on Assets, offline and limit cards.
- The answer card already says where it ran (On-device · Gemini Nano or Cloud · model) and keeps the two-sided shape.
- Keyboard: arrow keys on tabs, Escape on menu and sheet, Ctrl+Enter to explain, `/` to search Assets.

## Audit findings (by screen)

| Screen | Finding | Impact |
|---|---|---|
| Web app, desktop | A 360px wallet floats alone in an empty page. Judges get no story: what it is, why hybrid matters, how to install. | High (hackathon) |
| Explain tab (both) | Nothing shows whether Gemini Nano is ready in *this* browser before you press Explain. The hybrid path is only visible after an answer. | High (hackathon) |
| Answer card | A dead end. No "explain simpler", no example, no link to related glossary terms. Learners have to retype. | High |
| Explain tab (both) | When the brief is not ready it takes the top third of the popup with a bold paragraph, pushing the input below the fold. | Medium |
| Glossary | Good learn path; term cards are fine. Related terms are not reachable from answers. | Medium |
| Assets | Polished in #32. Stale badge and grey light are honest. No change needed now. | Low |
| Settings | Dense but clear. Billing card correctly says free during beta. | Low |
| Accessibility | Focus rings, live regions and reduced-motion rules exist. New pieces must keep them. | Ongoing |

## Plan (small PRs, each squash-merged when green)

1. **This plan** (`docs/ux/NEXT_LEVEL_PLAN.md`).
2. **Hybrid engine strip.** A compact "On-device ⇄ Cloud" strip at the top of Explain that reads the Chrome Prompt API availability (`LanguageModel.availability()`) without downloading anything and shows which route the next answer will take: Gemini Nano ready, downloadable, downloading, or cloud mode. After an answer it marks the route that actually ran. Pure state logic in `src/core/hybrid-engine.ts` with tests.
3. **Judge-ready web landing.** On wide screens the web app becomes a two-column page: a static hero (what it is, the hybrid diagram, privacy promises, install and source links) beside the live wallet. Static HTML in `index.html`, so it costs no JavaScript. Mobile keeps the full-screen wallet.
4. **Keep-going follow-ups.** The answer card gets "Explain simpler", "Give an example" and "Why it matters" follow-ups plus up to three related glossary terms found in the text. Pure helpers in `src/core/follow-ups.ts` with tests; education-only wording is checked by tests and the trade-word scan.
5. **Compact brief when not ready.** A one-line "Today's brief · Not ready yet" row that expands for the reason, so the input stays above the fold. The ready brief is unchanged.

Later candidates (not in this round): streaming on-device answers, saved/pinned explanations with search, a side-panel-first layout, and a first-run "try it on this sentence" practice card.

## Budgets and checks

- `npm run release:check` must pass for every PR (typecheck, lint, tests, both builds, manifest least-privilege, bundle budget, npm audit, trade-word scan).
- Popup initial JS stays small: Firebase still loads only when the cloud is needed.
- No new permissions in `extension/manifest.json`.

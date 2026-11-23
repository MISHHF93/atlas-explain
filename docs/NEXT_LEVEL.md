# Next level: what the research says, ranked

**Written 17 Nov 2026** after the owner reported that people like the profile and asked what would take the platform to the next level. Sources: Anthropic's connector review checklist, verification page, MCP Apps design guidelines, display-mode and theming guides, and entry-point guide (all claude.com/docs, read 17 Nov 2026); the MCP 2026-07-28 specification; a critique of our own landing page; and roundups of what finance-education apps' users like (listicles, so treated as hints, not data).

## What the directory rewards

- **Verified is not applied for.** Anthropic lists a submission as **Community** after an automatic scan, then escalates listings "flagged as highly useful to Claude users" to Verified review, where a reviewer runs every tool. The escalation is assessed automatically; nothing to apply for.
- **Verified unlocks things Community can't have:** an MCP App on the **Artifacts** page (an entry point, pinnable to the sidebar), embedded sites, and the app's own declared icon. A Community listing's apps never appear on the Artifacts page.
- So the lever is **usefulness and quality**: every tool answers well, errors are specific, docs are live, and the apps follow Claude's design guidelines. Everything below is ranked by that.

## Ranked improvements

### 1. Make the chart views native to Claude (connector; done in 1.8.0, 17 Nov 2026)

Measured against the MCP Apps design guidelines, our five views break four rules:

| Guideline | Us today | Fix |
|---|---|---|
| Transparent background; style with the host's `--color-*`, `--font-*`, `--border-radius-*` variables from `hostContext.styles.variables`; `<meta name="color-scheme" content="light dark">`; `prefersBorder: false` | Our own palette (`#ffffff`, `#1c1a17`…), opaque body, `prefersBorder: true` | `app-shell.ts` applies the host variables on `ui/initialize` and on every `host-context-changed`, with our palette only as fallback outside Claude |
| Declare `fullscreen`; dashboards belong in the side panel or full screen; inline cards keep to 4–5 data points, no nested scrolling | `availableDisplayModes: ["inline"]` only, so Claude shows no expand button; the economy view (7 cards + chart + calendar) and the depth chart are dashboards squeezed inline | Declare `["inline", "fullscreen"]`, lay out by `hostContext.containerDimensions`, add an expand button; set `preferredDisplayMode: "fullscreen"` on the economy and depth resources so they open in the side panel |
| Skeletons while loading, not spinners or text | "Loading…" text | Skeleton rows and a skeleton chart in the shell |
| App icon: an inline `data:image/png;base64` 64–128 px, under 10 KB, in `serverInfo.icons` (Claude ignores URL icons) | `https://…/icon.png` URLs only | Add a 96 px inline PNG first in the list; keep the URLs after it for other clients |

Visible to every user of every chart, and it is what a Verified reviewer would compare against.

### 2. An entry point for the economy dashboard (connector; done in 1.8.0, 17 Nov 2026)

Mark `economy_snapshot` (all arguments optional) with `_meta["openai/ui"].entrypoints: [{ "type": "global" }]`. Claude then lists "ATLAS Explain: the economy at a glance" on the Artifacts page, openable and pinnable without a conversation. It works now for the owner's custom connector, and for everyone once the listing is Verified. Harmless where unavailable.

### 3. One clear front door on the website (site; half a day; partly done 18 Nov 2026: the home page now shows what people can ask, with the views)

A fresh read of the landing page found: two competing calls to action (Get started vs Add to your AI assistant) with no guidance; "no account" in the hero next to a Get started that leads to Sign in; "connector", "address" and "Gemini Nano" never explained; "official sources" never named; trust claims with no evidence beyond the repo link; the disclaimer three times; no list of which assistants are supported.

Fix: hero CTA **Add to your AI assistant** (MCP first), secondary **Open the web app (free account)**; one line explaining a connector; name the sources (US Treasury, BLS, Federal Reserve, ECB, Bank of Canada, SEC, Kraken) with a link to the data index; list the assistants (Claude web, desktop and mobile; ChatGPT; Cursor; VS Code; Claude Code); show one live, timestamped number and one real chart; one disclaimer in the footer.

### 4. The profile people like, taken further (app and connector; 2–3 days)

What finance-education users consistently like: bite-sized lessons, a check at the end, visible progress, and learning tied to something real. We have the pieces: a learning path with on-device progress, a `learn_next` prompt that ends with a question, and live data.

- **Sync learning progress to the account** (the web app's history already syncs), so "7 of 23 terms" follows the person to every device and into the connector.
- **"Check yourself"**: three questions per topic drawn from the glossary, answered on-device; the result marks the topic done. Also a connector tool, `learning_progress`, so Claude can say "you're on Rates; here's the next term".
- **Your account** shows topics done, terms learned, and the next topic, next to the plan card.
- **What's notable today** (descriptive signals, never predictions): "the yield curve is inverted", "Bitcoin moved more than usual this week", "a Fed decision is in 3 days", each with its source and a one-line explanation. A section in Today and a connector tool. ATLAS model leans stay withheld unless `clearedForPublic`. **Connector tool done in 1.10.0 (18 Nov 2026): `notable_today`, with each item's rule stated; the Today section in the web app is still to do.**

### 5. Later, bigger

- **Practice simulator** (`docs/PLATFORM_PLAN.md`, phase B): learning tied to real prices with pretend money. Needs the owner's wording decision first.
- **Live updates in the chat** through the 2026-07-28 spec's subscribe-and-notify pattern: a price card that ticks. Wait until Claude supports it for connectors.
- **Premium connector tools behind a sign-in** (`docs/PRICING.md`): after items 1–4, which are what make people want more.

## Not worth doing

- Chasing more tools: the review checklist says tool count is not a criterion.
- Elicitation (`input_required`): Claude already asks the user for a missing coin or asset.
- Logos for data sources and AI assistants: government seals and brand marks need permission; text credits are correct.

## Suggested order

Batch 1 = items 1 and 2 (connector), then item 3 (site), then item 4 (profile). Each batch ships on its own: release:check, merge, deploy, registry publish, and a directory "Sync from server" for new tools.

## Round 2: helping people use the connector at its best (researched 17 Nov 2026)

Sources: Claude's MCP Apps guides on sending messages, app tools and instance supersession; "Build plugins for Claude" and the directory publishing docs; tool-description research (an arXiv study of MCP tool descriptions, Merge's guide). The theme: today each tool answers well on its own, but people have to know what to ask next. These tweaks let the views and Claude carry the conversation forward.

### 6. "Ask Claude" buttons inside the views (connector; done in 1.9.0, 17 Nov 2026)

An MCP App can send Claude a message when the user clicks (`ui/message`, `app.sendMessage`): Claude either asks to allow it or puts the text in the message box, so the user stays in control. Limits: text only, under 8,000 characters, sent on a click, never on a timer.

- Economy card: "What does US inflation at 3.74% mean, and how has it changed this year?"
- Coin row or chart: "Show me what's in the news about Bitcoin" and "Explain Bitcoin's 7-day move with ATLAS Explain's evidence brief"
- Depth chart: "Explain this spread and slippage in plain language"
- Yield curve: "Explain what this yield curve's shape means"

One or two buttons per view (the inline-card rule is at most 2 actions), worded as questions, never as trade prompts.

### 7. Tell Claude what is on screen (connector; done in 1.9.0, 17 Nov 2026)

`ui/update-model-context` lets a view tell Claude what the user is looking at, for the next turn. When someone switches the chart to 30 days, picks a coin on the board or a card on the dashboard, Claude knows, so "what about Ethereum?" or "why did it drop on the 15th?" are grounded in what the user sees. One short line per change.

### 8. Package ATLAS Explain as a Claude plugin with skills (repo + submission; 1–2 days)

The directory now takes plugin bundles: a GitHub repository with the connector reference and Agent Skills. Skills teach Claude how to use the tools well, which is exactly the "use it at its best" problem:

- **Learn a term properly**: explain_term, a real example from live data, then one check question
- **Today's market brief**: todays_headlines + crypto_prices + economy_snapshot + economic_calendar, each fact sourced, no calls
- **Explain a market move**: evidence_brief + price_history + headlines, both sides, "what this doesn't tell you"
- **Understand trading costs**: market_depth with a worked slippage example

One listing then installs the connector and the know-how together. The owner submits it in the same portal.

### 9. Sharper tool descriptions and more ready-made prompts (connector; done in 1.9.0, 17 Nov 2026)

- Claude lists tools by name plus the first line of each description (up to 200 characters), so every first line must stand alone and say when to use the tool. Add the natural next step where it helps ("for how it moved, price_history").
- Prompts show up as one-click starters in many clients. Add "Evidence brief on an asset", "The economy today", "Quiz me on a topic" next to the three we have.

### 10. Let Claude change an open view (connector; 1 day; limited availability)

App tools let Claude act on a view that's open: "switch the chart to 30 days", "show Ethereum on the board". Only some organizations have them today, and the view keeps working without them, so this can wait until 6 and 7 are in.

### 11. Only the newest copy stays live (connector; half a day)

Each tool call adds another live copy of a view. With 6 and 7 in place, older copies should grey out and stop sending messages or context ("superseded"), using a server-issued key in each result and a BroadcastChannel, per Claude's guide.

### Suggested order for round 2

6 + 7 + 9 together (one connector release), then 8 (plugin), then 11, then 10 when app tools reach more organizations.

## Round 3: after launch readiness (researched 18 Nov 2026)

Already shipped in 1.10.0: `notable_today`, the server card, `/health`, an installable web app, `llms.txt` and `security.txt`. What's new outside: on 10 Nov 2026 Claude began opening interactive connectors as full apps beside the chat or in full screen, and added more of the MCP Apps extension (app tools, embedded sites). The plugin directory has taken submissions (connectors plus Skills, from a GitHub repo) since 25 Sep 2026. The 2026-07-28 spec moved live updates to an opt-in `subscriptions/listen` stream.

### 12. A view for `notable_today` (connector; half a day; done in 1.11.0, 18 Nov 2026)

The one data tool without a view. Each item as a card with its rule and source, the "checked, nothing unusual" list below, and two Ask Claude buttons ("Explain the first item", "Teach me the term"). Inline, not the side panel.

### 13. A learning hub that opens beside the chat (connector; 1–2 days)

One MCP App, opened from an entry point, that runs as a full app in the side panel: the learning path, a term's card with a live example from the data, "Check yourself" questions, and today's notable items. Uses app-only tools (`_meta.ui.visibility: ["app"]`) for its own plumbing (next question, mark a topic done), so Claude's tool list stays short. Progress lives in the view's own storage on the device; nothing about the person is sent anywhere. The entry point only shows on the Artifacts page once the listing is Verified, but the app works from a tool call before that.

### 14. Review terms just before they're forgotten (web app, then connector; 2 days)

Retrieval practice on a spaced schedule (1, 3, 7, 21 days) for terms a person has looked up or got wrong. Research on finance-learning apps: streaks bring people back but don't make knowledge last, and confidence can rise faster than knowledge. So: short checks, no streak pressure, no badges, and a plain score of what was right. Stored with the person's own history (already synced for signed-in users); the connector gets a `review_due` tool only after OAuth (PRICING.md), since it never stores anything today.

### 15. Countries compared (connector and data; 2 days; done in 1.12.0, 18 Nov 2026, from the World Bank only: IMF DataMapper mixes in projections)

`compare_countries`: inflation, GDP growth, unemployment and policy rates for the G20, with source and year, from keyless official sources (World Bank Indicators, CC BY 4.0; IMF DataMapper; OECD SDMX). Captured by a new daily cron into `world.json` on the data site; licences checked first and recorded in DATA_SOURCES.md. Today the economy covers only the US, the euro area and Canada.

### 16. The Claude plugin, submitted (repo + portal; 1 day; built 18 Nov 2026 in `plugins/atlas-explain`, submission is the owner's step)

Item 8, now that the portal is open: this repo (or a small one) with `.claude-plugin`, the connector and four Skills (learn a term properly, today's market brief, explain a market move, understand trading costs). Submitted at claude.ai/directory/manage → Submit new → Plugin.

### 17. The Today section in the web app (web app; 1 day; done 18 Nov 2026, with Coming up countdowns and "if this happens")

The other half of item 4: `notable_today`'s items in Today, from the same rules, with the term each one teaches linked to the glossary.

### Later

- **Live prices in the chat** through `subscriptions/listen`: when Claude supports it for connectors.
- **Tasks extension:** not needed; every tool answers in well under a second.
- **Practice simulator:** needs the owner's wording decision (PLATFORM_PLAN.md phase B).

## Round 4: risk, fraud and more central banks (researched 18 Nov 2026; batch 1 done in 1.13.0)

A 2026 FINRA Foundation and Stanford study found only 18% of US investors show advanced investment literacy, mostly for lack of risk knowledge; a July 2026 FINRA report tied literacy to recognising fraud. So batch 1 teaches risk and fraud, and adds the central banks people asked about.

- **Done (1.13.0):** `money_maths` with an interactive view (compound growth, fees, inflation, diversification); `scam_red_flags` (SEC and FINRA warning signs, where to check and report, recent official fraud actions); Bank of England Bank Rate and MPC dates, and the ECB deposit rate, in `economy_snapshot` and `economic_calendar`; `treasury_auctions` from TreasuryDirect; prompts `check_an_offer` and `money_lesson`.
- **Done since:** the Today section (17), countdowns and scenarios (1.14.0), keyless energy prices from the EIA's history pages, the partner sandbox (REST and keyed MCP, `docs/PARTNER_API.md`) with its page, OpenAPI spec and samples, and structured answers from every tool (1.15.0).
- **Batch 2:** the learning hub and spaced review (13, 14), weekly futures positioning from the CFTC (keyless, CC0; descriptive only), euro-area unemployment from Eurostat (keyless), supersession and view control (11, 10).
- **Not now:** DefiLlama stablecoins (terms to read first), stock prices (no free display licence). Fiscal Data's `upcoming_auctions` lagged a month on 18 Nov 2026, so auctions come from TreasuryDirect; the SEC's investor-alerts feed refuses automated readers, so recent fraud actions come from the official releases already captured.

## Where things stand (23 Nov 2026)

**Live:** connector 1.28.2 (views checked against Claude's MCP Apps design guidelines: 44 px touch targets, safe-area insets, a compact inline learning hub, and long lists cut to about five items inline with "Show all" in the side panel) with 25 tools (plus `learning_check`, which only a view calls), 11 prompts and 15 views (1.28.0 added the learning hub with spaced review; 1.24.0 to 1.27.0 added Canada's posted rates, `debt_payoff`, rates people pay in the US, UK and euro area, and chart views for the inflation and debt calculators), published to the MCP Registry. Since 1.19.0: Canada, UK and euro-area inflation and jobs from Statistics Canada, the ONS and Eurostat (1.21.0); `inflation_calculator` on each country's official yearly price index (1.22.0); `whats_changed` (1.23.0, v2 phase 3), with `economy.json` recording when each monthly figure first appears. The owner dashboard is at /admin (docs/ADMIN.md), with connector usage counted since 22 Nov 2026. A sweep on 23 Nov 2026 called every tool, prompt and view, the partner API's public routes and every site link: no errors, nothing slower than 1.5 s.

**Next to build, in order:**
1. Rates people actually pay: Canada's posted prime, mortgage and GIC rates from the Bank of Canada (free with credit), beside `rate_change_impact`; the US 30-year mortgage rate from Freddie Mac only after its terms are confirmed for an API (they allow automatically updated PMMS data on a website).
2. ~~A debt payoff calculator~~: built 23 Nov 2026 as `debt_payoff` (1.25.0). Rates people pay: Canada's posted rates built the same day (1.24.0).
3. ~~Learning hub beside the chat, then spaced review (13, 14)~~: built 23 Nov 2026 as `learning_hub` (1.28.0), with a "Due for review" card in the web app.
4. CFTC weekly positioning (descriptive only), once the dataset's licence is confirmed.

## Round 5: what institutions want from a data connector (researched 18 Nov 2026)

The big vendors now ship MCP servers (FactSet, LSEG, S&P Global, MSCI), all entitlement-gated, selling licensed prices, fundamentals, estimates and indices. ATLAS Explain can't and shouldn't compete there: it has no licence for prices. What it can sell is what they don't do well, built only from public data:

1. **Exact event times for rule enforcement.** Prop firms commonly bar trading in a window around high-impact releases (some 2 minutes either side). `upcoming_events` already has exact times for BLS releases, FOMC, ECB, BoE, BoC and Treasury auctions; next: a `/calendar?format=windows` view with start and end of each window, as a schedule only.
2. **Plain-language explanation as a service.** Banks' customer apps need explanations people understand (UK Consumer Duty, FINRA's literacy findings): `/terms`, `/brief` and the "if this happens" text, white-labelled.
3. **Fraud warning signs.** UK APP-fraud reimbursement (since Oct 2024) gives banks a reason to check messages customers paste in: `/scam-check`.
4. **Official series with licences attached.** `data_series` / `/series`: every row carries its source and licence, which compliance teams ask for.
5. **Next to build from public data:** what changed between one central-bank statement and the last (public domain text, a popular paid product elsewhere); point-in-time copies of each release as first published (revisions matter to analysts); CFTC weekly positioning (CC0); 8-K filing events from EDGAR.

Not offered: crypto and stock prices (no redistribution licence), anything that rates, ranks or forecasts.

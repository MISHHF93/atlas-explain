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

### 3. One clear front door on the website (site; half a day)

A fresh read of the landing page found: two competing calls to action (Get started vs Add to your AI assistant) with no guidance; "no account" in the hero next to a Get started that leads to Sign in; "connector", "address" and "Gemini Nano" never explained; "official sources" never named; trust claims with no evidence beyond the repo link; the disclaimer three times; no list of which assistants are supported.

Fix: hero CTA **Add to your AI assistant** (MCP first), secondary **Open the web app (free account)**; one line explaining a connector; name the sources (US Treasury, BLS, Federal Reserve, ECB, Bank of Canada, SEC, Kraken) with a link to the data index; list the assistants (Claude web, desktop and mobile; ChatGPT; Cursor; VS Code; Claude Code); show one live, timestamped number and one real chart; one disclaimer in the footer.

### 4. The profile people like, taken further (app and connector; 2–3 days)

What finance-education users consistently like: bite-sized lessons, a check at the end, visible progress, and learning tied to something real. We have the pieces: a learning path with on-device progress, a `learn_next` prompt that ends with a question, and live data.

- **Sync learning progress to the account** (the web app's history already syncs), so "7 of 23 terms" follows the person to every device and into the connector.
- **"Check yourself"**: three questions per topic drawn from the glossary, answered on-device; the result marks the topic done. Also a connector tool, `learning_progress`, so Claude can say "you're on Rates; here's the next term".
- **Your account** shows topics done, terms learned, and the next topic, next to the plan card.
- **What's notable today** (descriptive signals, never predictions): "the yield curve is inverted", "Bitcoin moved more than usual this week", "a Fed decision is in 3 days", each with its source and a one-line explanation. A section in Today and a connector tool. ATLAS model leans stay withheld unless `clearedForPublic`.

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

### 6. "Ask Claude" buttons inside the views (connector; 1 day) — highest value

An MCP App can send Claude a message when the user clicks (`ui/message`, `app.sendMessage`): Claude either asks to allow it or puts the text in the message box, so the user stays in control. Limits: text only, under 8,000 characters, sent on a click, never on a timer.

- Economy card: "What does US inflation at 3.74% mean, and how has it changed this year?"
- Coin row or chart: "Show me what's in the news about Bitcoin" and "Explain Bitcoin's 7-day move with ATLAS Explain's evidence brief"
- Depth chart: "Explain this spread and slippage in plain language"
- Yield curve: "Explain what this yield curve's shape means"

One or two buttons per view (the inline-card rule is at most 2 actions), worded as questions, never as trade prompts.

### 7. Tell Claude what is on screen (connector; half a day)

`ui/update-model-context` lets a view tell Claude what the user is looking at, for the next turn. When someone switches the chart to 30 days, picks a coin on the board or a card on the dashboard, Claude knows, so "what about Ethereum?" or "why did it drop on the 15th?" are grounded in what the user sees. One short line per change.

### 8. Package ATLAS Explain as a Claude plugin with skills (repo + submission; 1–2 days)

The directory now takes plugin bundles: a GitHub repository with the connector reference and Agent Skills. Skills teach Claude how to use the tools well, which is exactly the "use it at its best" problem:

- **Learn a term properly**: explain_term, a real example from live data, then one check question
- **Today's market brief**: todays_headlines + crypto_prices + economy_snapshot + economic_calendar, each fact sourced, no calls
- **Explain a market move**: evidence_brief + price_history + headlines, both sides, "what this doesn't tell you"
- **Understand trading costs**: market_depth with a worked slippage example

One listing then installs the connector and the know-how together. The owner submits it in the same portal.

### 9. Sharper tool descriptions and more ready-made prompts (connector; half a day)

- Claude lists tools by name plus the first line of each description (up to 200 characters), so every first line must stand alone and say when to use the tool. Add the natural next step where it helps ("for how it moved, price_history").
- Prompts show up as one-click starters in many clients. Add "Evidence brief on an asset", "The economy today", "Quiz me on a topic" next to the three we have.

### 10. Let Claude change an open view (connector; 1 day; limited availability)

App tools let Claude act on a view that's open: "switch the chart to 30 days", "show Ethereum on the board". Only some organizations have them today, and the view keeps working without them, so this can wait until 6 and 7 are in.

### 11. Only the newest copy stays live (connector; half a day)

Each tool call adds another live copy of a view. With 6 and 7 in place, older copies should grey out and stop sending messages or context ("superseded"), using a server-issued key in each result and a BroadcastChannel, per Claude's guide.

### Suggested order for round 2

6 + 7 + 9 together (one connector release), then 8 (plugin), then 11, then 10 when app tools reach more organizations.

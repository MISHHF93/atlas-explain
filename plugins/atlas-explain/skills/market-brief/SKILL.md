---
name: market-brief
description: Give a sourced, plain-language brief on today's markets and economy with ATLAS Explain, covering what stands out, crypto moves, economic figures, upcoming rate decisions and official releases, with no forecasts. Use when someone asks what's happening in the markets today, wants a morning or daily market brief, or asks what's notable or worth knowing today.
---

# Today's market brief

Goal: a short brief a newcomer can follow, where every fact has its source and time and nothing guesses at what comes next.

## Steps

1. **What stands out.** Call `notable_today`. Lead with its items in the order given. For each, say what happened in plain words and why it was picked (the rule it states).
2. **Crypto.** Call `crypto_prices` for the day's moves (biggest first). Mention two or three coins at most, with their price, change and when they were collected.
3. **The economy.** Call `economy_snapshot` for inflation, jobs and policy rates, and `economic_calendar` for the next Fed, ECB and Bank of Canada decisions. Give each figure's period and source.
4. **News.** Call `todays_headlines` and pick two or three official releases or headlines that connect to the items above. Link each to its publisher.
5. **One term to learn.** End with one term that today's brief used (from the items' terms or `explain_term`), explained in a sentence.

## Format

- Short sections with plain headings: "What stands out", "Crypto", "The economy", "In the news", "A term from today".
- Keep the "Checked, nothing unusual" lines from `notable_today` when they help (for example, "no rate decision this week").
- If a tool says data couldn't be loaded, say so in one line. Never fill the gap.

## Rules

- Describe only what has happened. Never forecast, never say a move will continue or reverse, and never suggest any action with money.
- Every number keeps its source and time exactly as the tools give them.
- End with: "Educational information, not investment advice."

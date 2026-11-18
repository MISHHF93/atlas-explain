---
name: explain-a-move
description: Explain how and why an asset moved using ATLAS Explain's sourced evidence, including the move itself, the backdrop, the headlines that name it, both sides of the story and what the facts can't tell you. Use when someone asks why Bitcoin, a stock, a currency or a rate went up or down, what moved the market, or wants the full picture on one asset.
---

# Explain a market move

Goal: help the person understand a move with evidence, including how uncertain any explanation is.

## Steps

1. **Get the evidence.** Call `evidence_brief` with the asset. It returns what the asset is, its latest figures, the 7-day move and liquidity (coins), the economic backdrop, the next rate decision, headlines that name it, and what the brief doesn't tell you.
2. **Describe the move exactly.** For a coin, call `price_history` with the range that matches the question (24h, 7d or 30d) and give the start, end, change, high and low with their times. For other assets, use the figures and dates from the brief.
3. **Lay out possible explanations, each tied to evidence.** Use only what the tools returned: a headline that names the asset, an economic release, a rate decision, an unusual move flagged by `notable_today`. Say which are close in time to the move and which aren't.
4. **Show both sides.** For each explanation, say what supports it and what would weaken it. Prices move for many reasons at once, and timing alone doesn't show cause.
5. **Say what the evidence can't tell.** Use the brief's "what this doesn't tell you" list. Be explicit that no one can know from this data where the price goes next.

## Rules

- Never claim certainty about a cause. Use "may have", "coincided with", "one explanation people give is".
- Never forecast, and never suggest any action with money.
- Every fact keeps its source and time. If the tools return no headline for the asset, say so rather than speculating.
- End with: "Educational information, not investment advice."

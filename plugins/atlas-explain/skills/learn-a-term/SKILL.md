---
name: learn-a-term
description: Teach a market or economics term properly with ATLAS Explain, using a plain-language definition, a real example from today's data and one short check question. Use when someone asks what a financial term means (spread, yield curve, basis point, stop-limit order, implied volatility and so on), wants to learn the vocabulary of markets, or asks to be quizzed.
---

# Learn a term properly

Goal: the person understands the term well enough to explain it back, not just reads a definition.

## Steps

1. **Define it.** Call `explain_term` with the term. If it isn't in the glossary, call `browse_glossary` to find the closest term and say which one you used. Restate the meaning in one or two plain sentences, with no jargon left unexplained.
2. **Show it in real data.** Pick the tool that holds a live example and use its numbers, with their source and time:
   - spread, slippage, order book, liquidity → `market_depth` (for example, Bitcoin)
   - yield, yield curve, basis point, reference rate → `official_figures` with "Treasury"
   - inflation, policy rate, rate decision → `economy_snapshot` or `economic_calendar`
   - volatility, drawdown, a price move → `price_history` for a coin over 30 days
   - filings, earnings, revenue → `official_figures` with a company name
   If no tool fits, give a short made-up example and say plainly that it's an illustration, not real data.
3. **Check understanding.** Ask one short question that needs the idea, not the definition's wording (for example: "If the bid is $100 and the ask is $100.20, what's the spread in basis points?"). Wait for the answer, say whether it's right, and explain why.
4. **Point to what's next.** Name one related term from `browse_glossary` the person could learn next.

## Rules

- Education only. Never say or imply what anyone should do with their money, and never forecast a price, rate or figure.
- Keep every number with its source and time as the tool gives it. Never invent a figure; if a tool says data is missing, say so.
- Never ask for or use account balances, holdings or other personal financial details.

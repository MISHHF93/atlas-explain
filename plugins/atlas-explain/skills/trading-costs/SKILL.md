---
name: trading-costs
description: Explain what trading actually costs (the bid-ask spread, order-book depth and slippage) with ATLAS Explain's live order-book data and a worked example. Use when someone asks what a spread is, why the price they get differs from the price they see, what slippage or liquidity means, or how order size affects the price.
---

# Understand trading costs

Goal: the person can see, with real numbers, why the price shown isn't always the price paid, and why size matters.

## Steps

1. **Get a live book.** Call `market_depth` for the coin the person names, or Bitcoin if none. It returns the best bid and ask, the spread in dollars and basis points, depth near the middle price and the slippage of filling $1,000, $10,000 and $100,000.
2. **Explain the spread with these numbers.** The ask is the lowest price sellers are asking now; the bid is the highest price buyers are offering. Show the spread in dollars, as a percentage and in basis points, and explain basis points (1 bp = 0.01%) with `explain_term` if the person seems new to it.
3. **Work through one example.** Using the tool's own rows, walk through filling $10,000 against the asks: the average price, how far it is from the best ask, and why (each price level holds only so much). Then compare it with $100,000 to show how size changes the cost.
4. **Compare liquidity.** If useful, call `market_depth` for a second coin and compare spreads and depth in a sentence or two. Thinner books mean larger costs for the same size.
5. **Name the other costs the data doesn't show.** Exchange fees, the price moving while an order fills, and different prices on other venues. Say plainly that these numbers are from one exchange's public data at one moment.

## Rules

- This explains how markets work. Never suggest whether, when or how to place an order, and never forecast prices.
- Use the tool's numbers and time exactly. If the order book isn't available, say so and explain with the spread alone.
- End with: "Educational information, not investment advice."

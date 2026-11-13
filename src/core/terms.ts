import { GLOSSARY, type GlossaryEntry } from "./glossary";

/**
 * Plain-language trading terms for the wallet Glossary tab. Descriptive only:
 * no trade instructions, no balances, no accounts.
 */
export interface TermEntry extends GlossaryEntry {
  group: "atlas" | "orders" | "market" | "risk";
}

export const TRADING_TERMS: readonly TermEntry[] = [
  {
    id: "stop_limit",
    group: "orders",
    title: "Stop-limit order",
    summary:
      "An order with two prices. The stop price activates it; the limit price caps the worst fill accepted. In a fast market it can stay unfilled.",
  },
  {
    id: "market_order",
    group: "orders",
    title: "Market order",
    summary:
      "An order that fills at the best price available right now. It favours speed over price, so the fill can differ from the last quote.",
  },
  {
    id: "spread",
    group: "market",
    title: "Bid-ask spread",
    summary:
      "The gap between the highest bid and the lowest ask. A wide spread usually means thinner trading and a higher cost to get in and out.",
  },
  {
    id: "volume",
    group: "market",
    title: "Volume",
    summary:
      "How many shares or contracts changed hands in a period. A move on heavy volume is often read as broader participation than the same move on light volume.",
  },
  {
    id: "gap",
    group: "market",
    title: "Gap",
    summary:
      "When a price opens well above or below the prior close with no trading in between, often after news outside market hours.",
  },
  {
    id: "implied_volatility",
    group: "risk",
    title: "Implied volatility (IV)",
    summary:
      "The size of future moves that option prices are pricing in. High IV means the market expects bigger swings, not which direction they will go.",
  },
  {
    id: "margin",
    group: "risk",
    title: "Margin",
    summary:
      "Borrowed money used to hold a larger position than cash alone allows. It magnifies gains and losses, and a falling price can trigger a margin call.",
  },
  {
    id: "drawdown",
    group: "risk",
    title: "Drawdown",
    summary:
      "The fall from a peak to a later low, usually shown as a percent. It describes how deep a decline went, not whether it will recover.",
  },
  {
    id: "hit_rate",
    group: "risk",
    title: "Hit rate",
    summary:
      "The share of resolved predictions that turned out right. On its own it says little: sample size and the size of wins and misses matter too.",
  },
];

export const ALL_TERMS: readonly TermEntry[] = [
  ...GLOSSARY.map((entry) => ({ ...entry, group: "atlas" as const })),
  ...TRADING_TERMS,
];

export const TERM_GROUP_LABEL: Record<TermEntry["group"], string> = {
  atlas: "ATLAS",
  orders: "Orders",
  market: "Market",
  risk: "Risk",
};

export function searchTerms(query: string, entries: readonly TermEntry[] = ALL_TERMS): TermEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  return entries.filter((entry) => `${entry.title} ${entry.summary}`.toLowerCase().includes(q));
}

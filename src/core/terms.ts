import { GLOSSARY, type GlossaryEntry } from "./glossary";

/**
 * Plain-language trading terms for the wallet Glossary tab. Descriptive only:
 * no trade instructions, no balances, no accounts.
 */
export interface TermEntry extends GlossaryEntry {
  group: "atlas" | "orders" | "market" | "risk" | "economy" | "ai";
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
  {
    id: "market_hours",
    group: "market",
    title: "Market hours",
    summary:
      "The times an exchange is open for regular trading. US stock exchanges open 9:30 am to 4 pm New York time on weekdays. Crypto trades around the clock, and currencies trade around the clock on weekdays.",
  },
  {
    id: "index",
    group: "market",
    title: "Index",
    summary:
      "A number that tracks a group of investments to describe a market, such as the S&P 500 for large US companies. An index is a measurement, not something you can own directly; funds can be built to follow it.",
  },
  {
    id: "etf",
    group: "market",
    title: "ETF (exchange-traded fund)",
    summary:
      "A fund that holds a basket of investments, such as the stocks in an index or a set of bonds, and trades on an exchange like a single stock. Its price follows the value of what it holds.",
  },
  {
    id: "filings",
    group: "market",
    title: "10-K, 10-Q and 8-K",
    summary:
      "Reports US public companies must file with the SEC. A 10-K is the audited annual report, a 10-Q the quarterly report, and an 8-K a notice of a major event such as results, a merger or a leadership change.",
  },
  {
    id: "futures_contract",
    group: "market",
    title: "Futures contract",
    summary:
      "An agreement to exchange a set amount of something, such as oil, gold or an index's value, at a price fixed today for a date in the future. Each contract has a standard size, a smallest price step and an expiry.",
  },
  {
    id: "expiry",
    group: "market",
    title: "Expiry",
    summary:
      "The date a futures or options contract ends. After it, the contract is settled by delivering the underlying item or paying the difference in cash, and it no longer trades.",
  },
  {
    id: "strike",
    group: "market",
    title: "Strike price",
    summary:
      "The fixed price written into an option contract: the price at which the holder may purchase (for a call) or hand over (for a put) the underlying asset.",
  },
  {
    id: "call_put",
    group: "market",
    title: "Call and put options",
    summary:
      "A call gives its holder the right, not the obligation, to purchase an asset at the strike price before expiry. A put gives the right to hand it over at the strike price. The writer of the option takes the other side.",
  },
  {
    id: "greeks",
    group: "risk",
    title: "The Greeks",
    summary:
      "Measures of how an option's value reacts to change. Delta: to the asset's price. Gamma: how fast delta itself changes. Theta: to the passing of time. Vega: to changes in expected volatility.",
  },
  {
    id: "yield",
    group: "market",
    title: "Bond yield",
    summary:
      "The yearly return a bond pays, as a percentage of its price. When a bond's price falls, its yield rises, and the other way round. Government yields show what it costs a government to borrow.",
  },
  {
    id: "yield_curve",
    group: "market",
    title: "Yield curve",
    summary:
      "A line joining the yields of government bonds from short terms (one month) to long terms (30 years). It usually slopes up. When short-term yields are higher than long-term ones, the curve is called inverted.",
  },
  {
    id: "basis_point",
    group: "market",
    title: "Basis point",
    summary:
      "One hundredth of a percentage point (0.01%). A yield moving from 4.20% to 4.25% has risen 5 basis points. Rate changes are often quoted this way, or in percentage points (pt).",
  },
  {
    id: "pip",
    group: "market",
    title: "Pip",
    summary:
      "The smallest usual step in a currency rate: 0.0001 for most pairs, and 0.01 for pairs quoted in Japanese yen. A move in EUR/USD from 1.1050 to 1.1060 is 10 pips.",
  },
  {
    id: "reference_rate",
    group: "market",
    title: "Reference rate",
    summary:
      "An exchange rate published once a day by a central bank, such as the European Central Bank or the Bank of Canada, from market prices at a set time. It is for information, not a price anyone can trade at.",
  },
  {
    id: "inflation",
    group: "economy",
    title: "Inflation",
    summary:
      "How fast prices rise on average, usually given as the change over 12 months. 3% inflation means a basket of everyday goods and services costs about 3% more than a year earlier, so the same money goes a little less far.",
  },
  {
    id: "cpi",
    group: "economy",
    title: "Consumer price index (CPI)",
    summary:
      "An index that tracks the price of a fixed basket of goods and services households pay for. Its change over 12 months is the most quoted inflation figure. In the US it comes from the Bureau of Labor Statistics; the euro area's version is called HICP.",
  },
  {
    id: "policy_rate",
    group: "economy",
    title: "Policy interest rate",
    summary:
      "The short-term rate a central bank sets, such as the Federal Reserve's federal funds target, the ECB's deposit rate or the Bank of Canada's overnight rate. Raising it makes borrowing dearer across the economy; cutting it makes borrowing cheaper.",
  },
  {
    id: "central_bank",
    group: "economy",
    title: "Central bank",
    summary:
      "The public institution that runs a country's or region's money: it sets the policy interest rate, aims to keep inflation low and stable, and supervises banks. Examples are the Federal Reserve, the European Central Bank and the Bank of Canada.",
  },
  {
    id: "gdp",
    group: "economy",
    title: "GDP (gross domestic product)",
    summary:
      "The value of everything an economy produces in a period. GDP growth is its change after removing inflation (real growth), usually quoted per year or per quarter. GDP per person divides it by the population.",
  },
  {
    id: "recession",
    group: "economy",
    title: "Recession",
    summary:
      "A broad fall in economic activity lasting more than a few months, seen in output, jobs, income and spending. A common shorthand is two quarters in a row of falling real GDP, though official bodies weigh more measures than that.",
  },
  {
    id: "unemployment_rate",
    group: "economy",
    title: "Unemployment rate",
    summary:
      "The share of people who want a job and are looking for one but don't have one, out of everyone working or looking. People not looking for work aren't counted, so the rate can fall when people give up searching.",
  },
  {
    id: "bond",
    group: "market",
    title: "Bond",
    summary:
      "A loan to a government or company that pays interest and returns the amount lent on a set date. Its price and its yield move in opposite directions: when the price falls, the yield to a new holder rises.",
  },
  {
    id: "dividend",
    group: "market",
    title: "Dividend",
    summary:
      "A payment a company makes to its shareholders from its profits, usually a fixed amount per share several times a year. Companies can raise, cut or stop dividends; many pay none.",
  },
  {
    id: "market_cap",
    group: "market",
    title: "Market capitalisation",
    summary:
      "A company's share price times the number of its shares outstanding: what the market values the whole company at, at that moment. It changes with every move in the share price.",
  },
  {
    id: "pe_ratio",
    group: "market",
    title: "Price-to-earnings ratio (P/E)",
    summary:
      "A share price divided by the company's earnings per share over a year. It shows how many years of current earnings the price equals. It says nothing on its own about whether a share is cheap or dear: growth, debt and the industry matter.",
  },
  {
    id: "liquidity",
    group: "market",
    title: "Liquidity",
    summary:
      "How easily something can be traded quickly without moving its price much. A liquid market has many orders close to the current price and narrow spreads; an illiquid one has few, so larger orders move the price.",
  },
  {
    id: "order_book",
    group: "orders",
    title: "Order book",
    summary:
      "The list of waiting orders for an asset on an exchange: bids (what buyers offer) below the current price and asks (what sellers ask) above it, each with a price and a quantity. The gap between the best bid and the best ask is the spread.",
  },
  {
    id: "slippage",
    group: "orders",
    title: "Slippage",
    summary:
      "The difference between the price expected when an order is placed and the average price it actually fills at. A large order can use up the best prices in the order book and fill partly at worse ones.",
  },
];

/** ATLAS research vocabulary. Kept for desk deep links; never listed in the public glossary. */
export const ATLAS_TERMS: readonly TermEntry[] = GLOSSARY
  .filter((entry) => entry.id !== "hybrid_inference")
  .map((entry) => ({ ...entry, group: "atlas" as const }));

/** The public glossary: trading terms plus how answers are made. */
export const ALL_TERMS: readonly TermEntry[] = [
  ...TRADING_TERMS,
  ...GLOSSARY.filter((entry) => entry.id === "hybrid_inference").map((entry) => ({ ...entry, group: "ai" as const })),
];

export const TERM_GROUP_LABEL: Record<TermEntry["group"], string> = {
  atlas: "ATLAS",
  orders: "Orders",
  market: "Market",
  risk: "Risk",
  economy: "Economy",
  ai: "How it works",
};

/**
 * Terms matching a query, best first: the term itself (its id or title, or the title without its
 * bracketed abbreviation), then titles that contain the query, then terms that only mention it.
 */
export function searchTerms(query: string, entries: readonly TermEntry[] = ALL_TERMS): TermEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...entries];
  const key = q.replace(/[\s-]+/g, "_");
  const rank = (e: TermEntry): number => {
    const title = e.title.toLowerCase();
    const short = /\(([^)]+)\)/.exec(title)?.[1];
    if (e.id === key || title === q || title.replace(/\s*\([^)]*\)/, "") === q || short === q) return 0;
    if (title.includes(q)) return 1;
    return e.summary.toLowerCase().includes(q) ? 2 : 3;
  };
  return entries.map((e) => [e, rank(e)] as const).filter(([, r]) => r < 3).sort((a, b) => a[1] - b[1]).map(([e]) => e);
}

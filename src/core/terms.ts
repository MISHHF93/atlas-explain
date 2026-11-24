import { GLOSSARY, type GlossaryEntry } from "./glossary";

/**
 * Plain-language trading terms for the wallet Glossary tab. Descriptive only:
 * no trade instructions, no balances, no accounts.
 */
export interface TermEntry extends GlossaryEntry {
  group: "atlas" | "orders" | "market" | "risk" | "economy" | "saving" | "household" | "ai";
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
  {
    id: "index_fund",
    group: "saving",
    title: "Index fund",
    summary:
      "A fund that holds everything in a market index, such as the S&P 500, in the same proportions, instead of a manager choosing. Because nobody is choosing, its yearly fee is usually low. It comes as a mutual fund or an ETF.",
  },
  {
    id: "mutual_fund",
    group: "saving",
    title: "Mutual fund",
    summary:
      "A pool of money from many people, invested together in stocks, bonds or both. Its price is set once a day, after markets close, from the value of what it holds. It may follow an index or be run by a manager.",
  },
  {
    id: "expense_ratio",
    group: "saving",
    title: "Expense ratio (fund fee)",
    summary:
      "What a fund charges each year, as a share of the money in it. 0.2% means $2 a year for every $1,000. It comes out of the fund's value, so it's easy to miss, and over decades it adds up because the fee also stops that money from growing.",
  },
  {
    id: "compound_growth",
    group: "saving",
    title: "Compound growth",
    summary:
      "Growth on earlier growth. If $1,000 grows 6% to $1,060, the next 6% is on $1,060, not $1,000. Over long periods most of the end balance can come from this, which is why time matters as much as the amount.",
  },
  {
    id: "diversification",
    group: "saving",
    title: "Diversification",
    summary:
      "Spreading money across many investments that don't all move together, so one doing badly hurts less. It lowers how much the whole mix swings; it can't remove the risk that a whole market falls.",
  },
  {
    id: "asset_allocation",
    group: "saving",
    title: "Asset allocation",
    summary:
      "How money is split between kinds of investment, such as stocks, bonds and cash. The split sets most of how much the total can swing and grow, more than which single investments are chosen.",
  },
  {
    id: "rebalancing",
    group: "saving",
    title: "Rebalancing",
    summary:
      "Moving money between investments to bring a mix back to its chosen split after some parts have grown faster than others. It keeps the level of risk where it was meant to be.",
  },
  {
    id: "dollar_cost_averaging",
    group: "saving",
    title: "Dollar-cost averaging",
    summary:
      "Putting the same amount in on a regular schedule, such as $200 a month, whatever the price. More units are acquired when prices are low and fewer when they are high. It spreads out timing; it doesn't guarantee a gain.",
  },
  {
    id: "risk_tolerance",
    group: "saving",
    title: "Risk tolerance",
    summary:
      "How much a person can stand to see their money fall in value, both in money (can they afford it) and in nerves (will they stay calm). It depends on goals, income and how soon the money is needed.",
  },
  {
    id: "time_horizon",
    group: "saving",
    title: "Time horizon",
    summary:
      "How long until the money is needed. Money needed in a year or two has little time to recover from a fall; money for 20 years from now has much more.",
  },
  {
    id: "emergency_fund",
    group: "saving",
    title: "Emergency fund",
    summary:
      "Cash kept aside for surprises, often a few months of essential costs, in an account that's easy to reach and doesn't swing in value. It means a bad month doesn't force someone to cash out investments at a low point.",
  },
  {
    id: "tax_advantaged_account",
    group: "saving",
    title: "Tax-sheltered accounts (TFSA, RRSP, 401(k), IRA, ISA)",
    summary:
      "Accounts where investment growth is taxed less or not at all, within yearly limits: the TFSA and RRSP in Canada, the 401(k) and IRA in the US, the ISA in the UK. The rules differ by country and by account.",
  },
  {
    id: "brokerage_account",
    group: "saving",
    title: "Brokerage account",
    summary:
      "An account at a firm licensed to hold stocks, funds and bonds for a client and to carry out their orders. The investments inside it belong to the client, not the firm.",
  },
  {
    id: "capital_gain",
    group: "saving",
    title: "Capital gain",
    summary:
      "The rise in value between what was paid for an investment and what it is worth when it is cashed in. Many countries tax it, often only once it is realised, and usually at a different rate from income.",
  },
  {
    id: "bull_market",
    group: "saving",
    title: "Bull market",
    summary:
      "A long stretch when prices in a market are generally rising, often described as a rise of 20% or more from a low.",
  },
  {
    id: "bear_market",
    group: "saving",
    title: "Bear market",
    summary:
      "A long stretch when prices in a market are generally falling, often described as a fall of 20% or more from a high.",
  },
  {
    id: "real_return",
    group: "economy",
    title: "Real return",
    summary:
      "A return after inflation. If an investment grows 6% in a year when prices rise 3%, the real return is about 3%: that's how much more it can actually pay for.",
  },
  {
    id: "apr_apy",
    group: "saving",
    title: "APR and APY",
    summary:
      "Two ways to state a yearly rate. APR is the simple yearly rate; APY (or AER) includes the effect of interest on interest within the year, so it is a little higher when interest is added often. Compare like with like.",
  },
  {
    id: "drawdown",
    group: "risk",
    title: "Drawdown",
    summary:
      "How far an investment has fallen from its highest point before recovering, for example from $10,000 to $7,000 is a 30% drawdown. It shows how bad the fall felt, which an average return hides.",
  },
  // Borrowing and saving at home (24 Nov 2026): the ideas behind rate_change_impact, debt_payoff and the posted rates.
  {
    id: "credit_score",
    group: "household",
    title: "Credit score",
    summary:
      "A number that sums up how someone has handled credit: paying on time, how much of their limits they use, how long they have had credit and how often they apply for more. Lenders use it to decide whether to lend and at what rate. US scores usually run from 300 to 850 and Canadian ones from 300 to 900; in the UK each credit agency uses its own scale.",
  },
  {
    id: "credit_utilization",
    group: "household",
    title: "Credit utilization",
    summary:
      "How much of the credit available on cards and lines is in use, as a share: $1,500 owed on a $5,000 limit is 30%. It is one of the larger parts of a credit score, and a lower share usually counts in the borrower's favour.",
  },
  {
    id: "principal",
    group: "household",
    title: "Principal",
    summary:
      "The amount borrowed, or what is still owed of it, as opposed to the interest charged on it. A loan payment usually covers the interest due first; the rest reduces the principal.",
  },
  {
    id: "amortization",
    group: "household",
    title: "Amortization",
    summary:
      "Paying off a loan in regular payments that cover the interest and part of the amount borrowed, so the balance reaches zero at the end. Early payments are mostly interest and later ones mostly principal. In Canada the amortization period is the whole time to pay a mortgage off, often 25 years.",
  },
  {
    id: "mortgage_term",
    group: "household",
    title: "Mortgage term",
    summary:
      "In Canada, the length of the current mortgage contract, often 5 years, after which the rate and conditions are renewed; the amortization is the full payoff period. In the US the term is usually the whole life of the loan, such as 30 years. In the UK a fixed-rate deal usually lasts 2 or 5 years before the rate changes.",
  },
  {
    id: "fixed_variable_rate",
    group: "household",
    title: "Fixed and variable rates",
    summary:
      "A fixed rate stays the same for an agreed period, so the payments are known in advance. A variable (or floating) rate moves with a reference rate such as the prime rate or a central bank's rate, so the interest cost changes whenever that rate does.",
  },
  {
    id: "prime_rate",
    group: "household",
    title: "Prime rate",
    summary:
      "The rate a bank uses as the base for many variable loans, such as variable mortgages and lines of credit, which are priced at prime plus or minus a margin. Banks set it themselves, and it usually moves when the central bank changes its policy rate.",
  },
  {
    id: "home_equity",
    group: "household",
    title: "Home equity",
    summary:
      "The part of a home's value the owner holds outright: its market value minus what is still owed on loans against it. A $500,000 home with a $300,000 mortgage has $200,000 of equity.",
  },
  {
    id: "heloc",
    group: "household",
    title: "Home equity line of credit (HELOC)",
    summary:
      "A line of credit secured by the borrower's home, up to a share of its value minus what is still owed on the mortgage. Interest is usually variable and charged only on the amount drawn; because the home is the security, it can be at risk if payments are missed.",
  },
  {
    id: "down_payment",
    group: "household",
    title: "Down payment",
    summary:
      "The part of a home's price paid upfront; the rest is borrowed. A larger down payment means a smaller loan. In Canada a down payment under 20% requires mortgage default insurance, and in the US a conventional loan with under 20% down usually comes with private mortgage insurance.",
  },
  {
    id: "refinancing",
    group: "household",
    title: "Refinancing",
    summary:
      "Replacing an existing loan with a new one, often to change the rate, the length or the amount owed. It can lower the payments or the total interest, but it usually has costs, such as fees or a penalty for ending a fixed rate early.",
  },
  {
    id: "minimum_payment",
    group: "household",
    title: "Minimum payment",
    summary:
      "The least a credit card or loan requires each month to stay in good standing. Paying only the minimum keeps the account current, but it can take years to clear the balance and cost far more interest, because much of each payment goes to interest.",
  },
  {
    id: "debt_avalanche_snowball",
    group: "household",
    title: "Avalanche and snowball",
    summary:
      "Two ways to order extra payments across several debts while paying every minimum. The avalanche puts the extra money on the highest interest rate first, which usually costs the least interest; the snowball clears the smallest balance first, for quicker visible progress.",
  },
  {
    id: "gic_cd",
    group: "household",
    title: "GIC and CD (term deposits)",
    summary:
      "Money left with a bank for a fixed time, such as 1 or 5 years, at a rate set at the start. It is called a GIC (guaranteed investment certificate) in Canada and a CD (certificate of deposit) in the US. Taking the money out early may not be allowed, or may cost some of the interest.",
  },
  {
    id: "deposit_insurance",
    group: "household",
    title: "Deposit insurance",
    summary:
      "Government-backed protection for bank deposits if the bank fails, up to a limit: $250,000 per depositor, per bank, for each ownership category in the US (FDIC); $100,000 per eligible category in Canada (CDIC); and £120,000 per person, per banking group in the UK (FSCS, since 1 December 2025).",
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
  saving: "Saving and investing",
  household: "Borrowing and saving",
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

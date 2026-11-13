/**
 * Recognises what kind of site a highlight came from, using only the site
 * name and the page title. It never reads the page itself, so numbers,
 * balances and account details outside the highlight are never seen.
 */
export type PageKind = "atlas_desk" | "charting" | "broker" | "crypto_exchange" | "market_news" | "general";

export interface PageKindView {
  kind: PageKind;
  /** Short label for the explanation card, for example "Charting site". */
  label: string;
  /** One line for the prompt so the model reads the highlight in the right frame. */
  hint: string;
}

const RULES: readonly { kind: Exclude<PageKind, "general" | "atlas_desk">; hosts: readonly string[] }[] = [
  {
    kind: "charting",
    hosts: ["tradingview.com", "stockcharts.com", "finviz.com", "barchart.com", "koyfin.com", "tradingeconomics.com"],
  },
  {
    kind: "broker",
    hosts: [
      "robinhood.com", "schwab.com", "fidelity.com", "interactivebrokers.com", "interactivebrokers.ca", "ibkr.com",
      "webull.com", "etrade.com", "tdameritrade.com", "questrade.com", "wealthsimple.com", "vanguard.com",
      "merrilledge.com", "tastytrade.com", "thinkorswim.com", "public.com", "moomoo.com", "trading212.com",
      "etoro.com", "degiro.com", "saxotrader.com", "qtrade.ca", "td.com",
    ],
  },
  {
    kind: "crypto_exchange",
    hosts: ["kraken.com", "coinbase.com", "binance.com", "binance.us", "bitstamp.net", "gemini.com", "okx.com", "bybit.com", "crypto.com", "bitget.com"],
  },
  {
    kind: "market_news",
    hosts: [
      "finance.yahoo.com", "investing.com", "marketwatch.com", "bloomberg.com", "reuters.com", "cnbc.com", "wsj.com",
      "ft.com", "seekingalpha.com", "barrons.com", "morningstar.com", "nasdaq.com", "coindesk.com",
    ],
  },
];

const TITLE_HINTS: readonly { kind: Exclude<PageKind, "general" | "atlas_desk">; pattern: RegExp }[] = [
  { kind: "charting", pattern: /\b(chart|charts|candlestick|indicator|RSI|MACD|bollinger)\b/i },
  { kind: "broker", pattern: /\b(order entry|trade ticket|positions|portfolio|brokerage|option chain)\b/i },
];

const VIEW: Record<PageKind, Omit<PageKindView, "kind">> = {
  atlas_desk: {
    label: "ATLAS desk",
    hint: "The text comes from the ATLAS paper-only research desk. Explain research terms such as shadow metrics or chart layers; nothing there is a live order.",
  },
  charting: {
    label: "Charting site",
    hint: "The text comes from a charting site. It likely names an indicator, a drawing tool, or a chart pattern; explain how it is read and what it cannot tell you.",
  },
  broker: {
    label: "Broker site",
    hint: "The text comes from a broker's site. It likely names an order type, a fee, or an account rule; explain what it means and what can go wrong, without suggesting any order.",
  },
  crypto_exchange: {
    label: "Crypto exchange",
    hint: "The text comes from a crypto exchange. Explain the term in plain language, including how 24/7 trading and thinner books can change it.",
  },
  market_news: {
    label: "Market news",
    hint: "The text comes from market news. Explain the terms and how different readers might interpret the same report.",
  },
  general: {
    label: "Web page",
    hint: "The text comes from a general web page. Explain any market or trading terms in it.",
  },
};

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function detectPageKind(input: { host: string; title?: string }): PageKindView {
  const host = input.host.toLowerCase().replace(/^www\./, "");
  const bare = host.replace(/:\d+$/, "");
  if ((bare === "localhost" || bare === "127.0.0.1") && host.endsWith(":3000")) {
    return { kind: "atlas_desk", ...VIEW.atlas_desk };
  }
  // Longer domains first, so finance.yahoo.com wins over a shorter brand match.
  const ordered = RULES.flatMap((rule) => rule.hosts.map((domain) => ({ kind: rule.kind, domain })))
    .sort((a, b) => b.domain.length - a.domain.length);
  const hit = ordered.find((entry) => hostMatches(bare, entry.domain));
  if (hit) return { kind: hit.kind, ...VIEW[hit.kind] };
  const title = input.title ?? "";
  for (const rule of TITLE_HINTS) {
    if (rule.pattern.test(title)) return { kind: rule.kind, ...VIEW[rule.kind] };
  }
  return { kind: "general", ...VIEW.general };
}

/** "Charting site · tradingview.com", or just the label when the host is unknown. */
export function pageKindLine(view: PageKindView, host: string): string {
  const clean = host.replace(/^www\./, "");
  return clean ? `${view.label} · ${clean}` : view.label;
}

import type { MoveCard } from "./types";

export interface SampleSource {
  label: string;
  url: string;
}

export interface SampleMove {
  id: string;
  title: string;
  kind: "historical" | "hypothetical";
  summary: string;
  sources: SampleSource[];
  card: MoveCard;
}

const nvdaDeepseek: MoveCard = {
  symbol: "NVDA",
  asOf: "2025-01-27",
  movePct: -17,
  marketLabel: "Nasdaq Composite",
  marketMovePct: -3.1,
  sector: "Semiconductors",
  peerMoves: [{ symbol: "AVGO", movePct: -17 }],
  volatilityNote:
    "Contemporaneous reports described a sharp, AI-led selloff. This sample rounds published closes and does not include a volume or volatility multiple.",
  sourceNote:
    "Illustrative sample from public reports, not a market-data feed. NVDA is rounded to about -17% (Reuters: just under 17%; BBC: -16.9%). Nasdaq -3.1% (Reuters). Broadcom is rounded to about -17% (CNBC; BBC reported -17.4%). Reuters also reported the S&P 500 down about 1.5% that day; that print is not a separate field here.",
  upcomingEvents: [
    "DeepSeek's low-cost AI assistant had just become a major news story, including reports that it reached the top of the U.S. free app chart.",
  ],
  headlines: [
    {
      text: "A low-cost Chinese AI model raised doubts about how much would be spent on the chips used to train and run larger models.",
      source: "Paraphrase of 27 Jan 2025 coverage",
    },
    {
      text: "Semiconductor shares fell together as investors reassessed the AI build-out.",
      source: "Paraphrase of 27 Jan 2025 coverage",
    },
  ],
  watchlist: [],
};

const aaplTariffs: MoveCard = {
  symbol: "AAPL",
  asOf: "2025-04-03",
  movePct: -9.2,
  marketLabel: "S&P 500",
  marketMovePct: -4.8,
  sector: "Mega-cap technology",
  peerMoves: [],
  volatilityNote:
    "Reports called it the worst day for major U.S. indexes since 2020. No implied-volatility figure is included.",
  sourceNote:
    "Illustrative sample from public reports, not a market-data feed. Apple -9.2% on 3 Apr 2025 (Reuters). S&P 500 rounded to about -4.8% (AP reported -4.8%; a CNBC recap cited -4.84%). The Nasdaq fall of about 6% (Reuters reported -5.97%) is only in a headline.",
  upcomingEvents: [
    "Broad U.S. tariffs had just been announced. This card is the 3 April cash session, not a forecast.",
  ],
  headlines: [
    {
      text: "Apple fell harder than the S&P 500 as new tariffs drew attention to China-linked supply chains.",
      source: "Paraphrase of 3 Apr 2025 coverage",
    },
    {
      text: "The Nasdaq fell about 6 percent in the same session as recession worries spread beyond any one company.",
      source: "Paraphrase; Reuters reported -5.97%",
    },
  ],
  watchlist: [],
};

const spxSecondDay: MoveCard = {
  symbol: "SPX",
  asOf: "2025-04-04",
  movePct: -6,
  marketLabel: "S&P 500",
  marketMovePct: -6,
  sector: "Broad U.S. market",
  peerMoves: [],
  volatilityNote:
    "Reuters described the two-day loss as the largest since March 2020. No VIX level is included. SPX here means the index, not an ETF.",
  sourceNote:
    "Illustrative sample from public reports, not a market-data feed. Rounded to about -6%. Reuters reported the S&P 500 down 5.97% and the Nasdaq down 5.82% on 4 Apr 2025. Reuters also reported two-day declines of about 10.5% for the S&P 500 and 11.4% for the Nasdaq.",
  upcomingEvents: [
    "Second session after the tariff announcement, with reports of a response from China. Same-day coverage included Federal Reserve comments on tariffs and inflation.",
  ],
  headlines: [
    {
      text: "Stocks fell for a second day after China responded to U.S. tariffs, and recession fears deepened.",
      source: "Paraphrase of 4 Apr 2025 coverage",
    },
    {
      text: "The Nasdaq's decline from its record was deep enough that reports described a bear market.",
      source: "Paraphrase; Reuters said a bear market was confirmed",
    },
  ],
  watchlist: [],
};

const hypotheticalDip: MoveCard = {
  symbol: "NVDA",
  movePct: -6,
  marketLabel: "Replace with the index you watched",
  volatilityNote: "PLACEHOLDER. The -6% figure is an example for the core use case, not a historical session. Replace every field before you treat the card as real.",
  sourceNote: "Not a market record. Enter your own numbers. Do not cite this card as fact.",
  upcomingEvents: ["Replace with events you are allowed to mention, or delete this line."],
  headlines: [
    {
      text: "Replace this with a headline you are allowed to use.",
      source: "your note",
    },
  ],
  peerMoves: [],
  watchlist: [],
};

export const SAMPLE_MOVES: readonly SampleMove[] = [
  {
    id: "nvda-2025-01-27-deepseek",
    title: "NVDA · 27 Jan 2025 · DeepSeek",
    kind: "historical",
    summary:
      "Illustrative sample. NVIDIA fell about 17% as DeepSeek's low-cost model reset expectations for AI chip spending. Figures are rounded from contemporaneous news reports.",
    sources: [
      {
        label: "Reuters, 27 Jan 2025",
        url: "https://www.reuters.com/technology/chinas-deepseek-sets-off-ai-market-rout-2025-01-27/",
      },
      {
        label: "Reuters markets, 27 Jan 2025",
        url: "https://www.reuters.com/markets/us/nasdaq-futures-tumble-chinas-ai-push-rattles-big-tech-2025-01-27/",
      },
      {
        label: "BBC",
        url: "https://www.bbc.com/news/articles/c0qw7z2v1pgo",
      },
      {
        label: "CNBC",
        url: "https://www.cnbc.com/2025/01/27/nvidia-sheds-almost-600-billion-in-market-cap-biggest-drop-ever.html",
      },
    ],
    card: nvdaDeepseek,
  },
  {
    id: "aapl-2025-04-03-tariffs",
    title: "AAPL · 3 Apr 2025 · tariff selloff",
    kind: "historical",
    summary:
      "Illustrative sample. Apple fell 9.2% on the first full session after broad U.S. tariffs were announced, while the S&P 500 fell about 4.8%.",
    sources: [
      {
        label: "Reuters, 3 Apr 2025",
        url: "https://www.reuters.com/markets/global-markets-pix-2025-04-03/",
      },
      {
        label: "AP, 3 Apr 2025",
        url: "https://apnews.com/article/stocks-markets-rates-tariffs-52dbb020a4c41122e31669c2da236d67",
      },
    ],
    card: aaplTariffs,
  },
  {
    id: "spx-2025-04-04-tariffs",
    title: "S&P 500 · 4 Apr 2025 · second day",
    kind: "historical",
    summary:
      "Illustrative sample. The S&P 500 fell about 6% on the second day of the tariff selloff. This card is the index, not a fund, and not a vendor print.",
    sources: [
      {
        label: "Reuters, 4 Apr 2025",
        url: "https://www.reuters.com/markets/us/wall-street-futures-lose-ground-after-china-retaliates-against-us-tariffs-2025-04-04/",
      },
    ],
    card: spxSecondDay,
  },
  {
    id: "hypothetical-dip",
    title: "Blank dip · not historical",
    kind: "hypothetical",
    summary:
      "A blank NVDA −6% card for the core use case. Every figure is a placeholder. Replace it with numbers you entered yourself.",
    sources: [],
    card: hypotheticalDip,
  },
];

export function sampleById(id: string): SampleMove | undefined {
  return SAMPLE_MOVES.find((sample) => sample.id === id);
}

/**
 * The index of ATLAS Explain's published data, served at /data/v1/ (and /data/v1/index.json) for
 * people and tools that read the files directly (docs/DATA_API.md, docs/PLATFORM_PLAN.md phase A).
 * It says what each file holds, how often it is refreshed, where every value comes from and what
 * each source permits, and that the data is for information and education, not for transactions.
 */
import { EXPLAIN_WEB_URL } from "../core/links";
import { CRYPTO_SCHEMA } from "../data/crypto";
import { ECONOMY_SCHEMA } from "../data/economy";
import { WORLD_SCHEMA } from "../data/world";
import { MARKET_SCHEMA } from "../data/market-sources";
import { NEWS_SCHEMA } from "../core/news";

export const DATA_INDEX_SCHEMA = "atlas-explain-data-index-v1";

/** "open": reuse with credit; "review": terms under legal review, do not republish commercially. */
type Licence = "open" | "review";

interface SourceNote {
  name: string;
  licence: Licence;
  note: string;
}

interface FileEntry {
  file: string;
  schema: string;
  holds: string;
  refresh: string;
  sources: SourceNote[];
}

const OFFICIAL = (name: string, note = "Public official data; reuse with the source credited."): SourceNote => ({ name, licence: "open", note });

export const DATA_FILES_INDEX: readonly FileEntry[] = [
  {
    file: "market.json",
    schema: MARKET_SCHEMA,
    holds: "Official figures: US Treasury yields, ECB and Bank of Canada rates and FX, EIA energy prices, SEC-filed company figures.",
    refresh: "Hourly on a visit, every 6 hours by schedule; SEC filings every few days.",
    sources: [
      OFFICIAL("U.S. Department of the Treasury"),
      OFFICIAL("European Central Bank", "Reference rates are for information only, not for transactions; reuse with the ECB cited."),
      OFFICIAL("Bank of Canada"),
      OFFICIAL("U.S. Energy Information Administration"),
      OFFICIAL("SEC EDGAR"),
    ],
  },
  {
    file: "crypto.json",
    schema: CRYPTO_SCHEMA,
    holds: "Ten coins: price, change, best bid and ask; 30 days of hourly closes; the best order-book levels.",
    refresh: "Prices every few minutes on a visit; history and order books every 10 minutes.",
    sources: [
      { name: "Kraken public market data", licence: "review", note: "Terms under legal review: do not republish commercially or feed automated trading from this copy." },
      { name: "CoinGecko (backup)", licence: "review", note: "Terms under legal review; CoinGecko requires attribution and a paid plan for commercial use." },
    ],
  },
  {
    file: "news.json",
    schema: NEWS_SCHEMA,
    holds: "Headline, link, publisher and time of recent market news and official press releases. Titles and links only.",
    refresh: "Every 15 minutes on a visit; GDELT every 3 hours.",
    sources: [
      OFFICIAL("Federal Reserve, SEC, CFTC, ECB, Bank of Canada, Bank of England press releases", "Official releases; titles and links only, the publisher credited."),
      { name: "The GDELT Project", licence: "open", note: "Open index of news; headlines link to their publishers, who own them." },
    ],
  },
  {
    file: "economy.json",
    schema: ECONOMY_SCHEMA,
    holds: "US CPI and unemployment, fed funds and SOFR, euro-area HICP, Canada's policy rate, US public debt (about a year each), and upcoming Fed, ECB and Bank of Canada rate decisions.",
    refresh: "Every 6 hours by schedule.",
    sources: [
      OFFICIAL("U.S. Bureau of Labor Statistics"),
      OFFICIAL("Federal Reserve Bank of New York"),
      OFFICIAL("European Central Bank"),
      OFFICIAL("Bank of Canada"),
      OFFICIAL("U.S. Department of the Treasury, Fiscal Data"),
      OFFICIAL("Federal Reserve, ECB and Bank of Canada calendars", "Public schedules; dates and titles only."),
    ],
  },
  {
    file: "world.json",
    schema: WORLD_SCHEMA,
    holds: "GDP growth, inflation, unemployment and GDP per person for the G20, about eight years each, actual published values only.",
    refresh: "Once a day by schedule.",
    sources: [{ name: "World Bank, World Development Indicators (Data360)", licence: "open", note: "CC BY 4.0; reuse with the World Bank credited." }],
  },
];

/** The index document, with each file's address and, when known, its last capture time. */
export function dataIndex(origin: string, capturedAt: Record<string, string | null>): Record<string, unknown> {
  return {
    schema: DATA_INDEX_SCHEMA,
    publisher: "ATLAS Explain",
    about: `${EXPLAIN_WEB_URL}/how-its-built`,
    use: "For information and education only. Not for transactions or trading decisions. Every value carries its source and time; credit the original source when you reuse it, and check each source's own terms below.",
    docs: "https://github.com/MISHHF93/atlas-explain/blob/main/docs/DATA_API.md",
    files: DATA_FILES_INDEX.map((f) => ({ ...f, url: `${origin}/data/v1/${f.file}`, capturedAt: capturedAt[f.file] ?? null })),
  };
}

/**
 * Coin logos served from this site (public/coins), from the cryptocurrency-icons package
 * (CC0 1.0, github.com/atomiclabs/cryptocurrency-icons; licence in public/coins/LICENSE.md).
 * Every listed coin has its logo whichever price source answered. Coins newer than the set
 * (APT, ARB, SUI, TON and others) keep their letters. Kept tiny: the web app loads it on first paint.
 */
export const LOCAL_COIN_LOGOS: Readonly<Record<string, string>> = Object.fromEntries(
  ["BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "LTC", "DOT", "LINK", "AVAX", "AAVE", "ALGO", "ATOM", "BCH", "BNB", "ETC", "FIL", "ICP", "UNI", "XLM"].map((s) => [s, `/coins/${s.toLowerCase()}.svg`]),
);

/**
 * Light types for crypto prices in the web app. Prices come only from the file ATLAS Explain's data
 * job captures (price-provider.ts); this file holds what the first load needs without the network code.
 */
import type { CatalogView } from "./assets";

/** Where captured prices came from: Kraken, or CoinGecko when the data job had to fall back. */
export type PriceSourceId = "kraken" | "coingecko";

export interface PriceFeedOptions {
  /** Optional Logo.dev publishable key (pk_…) from Remote Config: turns on company logos, with credit. */
  logoDevToken?: string;
}

export const DEFAULT_PRICE_FEED: PriceFeedOptions = {};

export function isLivePriceSource(source: CatalogView["source"] | undefined): source is PriceSourceId {
  return source === "kraken" || source === "coingecko";
}

/** Visible attribution CoinGecko requires, and a matching label for Kraken. */
export function priceAttribution(source: CatalogView["source"] | undefined): { text: string; href: string } | null {
  if (source === "coingecko") return { text: "Prices by CoinGecko", href: "https://www.coingecko.com" };
  if (source === "kraken") return { text: "Prices: Kraken", href: "https://www.kraken.com" };
  return null;
}

export function priceFeedFromRemoteValues(values: Record<string, string>): PriceFeedOptions {
  return { logoDevToken: readLogoDevToken(values.logo_dev_token) };
}

/** Logo.dev publishable keys start with pk_ and are meant to be used in the browser. */
export function readLogoDevToken(raw: string | undefined): string | undefined {
  const value = raw?.trim() ?? "";
  return /^pk_[A-Za-z0-9_-]{8,120}$/.test(value) ? value : undefined;
}

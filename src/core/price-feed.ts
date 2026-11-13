/**
 * Light types and Remote Config parsing for the public live-price feed.
 * Heavy network clients live in price-provider.ts and are loaded on demand
 * so the extension popup stays under the bundle budget.
 */
import type { CatalogView } from "./assets";

export const PRICE_PROVIDER_IDS = ["kraken", "coingecko"] as const;
export type PriceProviderId = (typeof PRICE_PROVIDER_IDS)[number];
export const DEFAULT_PRICE_PROVIDER: PriceProviderId = "kraken";

export interface PriceFeedOptions {
  provider: PriceProviderId;
  /** Optional CoinGecko Demo API key from Remote Config. Never committed. */
  coinGeckoDemoKey?: string;
}

export const DEFAULT_PRICE_FEED: PriceFeedOptions = { provider: DEFAULT_PRICE_PROVIDER };

export function parsePriceProvider(raw: string | undefined): PriceProviderId {
  const value = raw?.trim().toLowerCase();
  return value === "coingecko" || value === "kraken" ? value : DEFAULT_PRICE_PROVIDER;
}

export function isLivePriceSource(source: CatalogView["source"] | undefined): source is PriceProviderId {
  return source === "kraken" || source === "coingecko";
}

/** Visible attribution CoinGecko requires, and a matching label for Kraken. */
export function priceAttribution(source: CatalogView["source"] | undefined): { text: string; href: string } | null {
  if (source === "coingecko") return { text: "Prices by CoinGecko", href: "https://www.coingecko.com" };
  if (source === "kraken") return { text: "Prices: Kraken", href: "https://www.kraken.com" };
  return null;
}

export function readCoinGeckoDemoKey(raw: string | undefined): string | undefined {
  const value = raw?.trim() ?? "";
  if (!value) return undefined;
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(value)) return undefined;
  return value;
}

export function priceFeedFromRemoteValues(values: Record<string, string>): PriceFeedOptions {
  return {
    provider: parsePriceProvider(values.price_provider),
    coinGeckoDemoKey: readCoinGeckoDemoKey(values.coingecko_demo_api_key),
  };
}

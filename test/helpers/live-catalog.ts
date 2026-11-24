import { capturedCatalog } from "../../src/core/captured-prices";
import type { CatalogView } from "../../src/core/assets";
import type { CryptoFile } from "../../src/data/crypto";

/** A catalog as the web app builds it from the captured price file (its only price source), for tests. */
export function liveCatalog(
  rows: { symbol: string; name: string; priceUsd: number; changePct: number | null }[],
  at: string,
  source: "kraken" | "coingecko" = "coingecko",
): CatalogView {
  const file = {
    schema: "atlas-explain-crypto-v1",
    generatedAt: at,
    prices: { source, asOf: at, coins: rows.map((r) => ({ ...r, changeWindow: "over 24 hours" })) },
    history: { source, asOf: at, interval: "1h", series: {} },
  } as unknown as CryptoFile;
  const catalog = capturedCatalog(file, Date.parse(at) + 60_000);
  if (!catalog) throw new Error("liveCatalog: no assets");
  return catalog;
}

import { changeWindowText, formatChange, formatPrice, type AssetView, type CatalogView } from "./assets";
import { priceAttribution } from "./price-feed";

/**
 * "Crypto right now" for the Today screen when ATLAS is not on this computer but a public
 * live-price provider answered. Only live quotes with a real change count. No leans, no
 * forecasts: just breadth and the biggest moves either way, with the source and the time.
 */
export interface LiveSnapshot {
  counted: number;
  total: number;
  up: number;
  down: number;
  flat: number;
  window: string;
  movers: { symbol: string; name: string; price: string; change: string; tone: "up" | "down" | "flat" }[];
  asOf: string | null;
  source: { text: string; href: string };
}

export function liveSnapshot(catalog: CatalogView | null, moverCount = 3): LiveSnapshot | null {
  if (!catalog) return null;
  const source = priceAttribution(catalog.source);
  if (!source) return null;
  const live = catalog.assets.filter((a): a is AssetView & { quote: { changePct: number } } => a.quote.freshness === "live" && a.quote.changePct != null && a.quote.price != null);
  if (live.length === 0) return null;
  const up = live.filter((a) => a.quote.changePct > 0).length;
  const down = live.filter((a) => a.quote.changePct < 0).length;
  const movers = [...live]
    .sort((a, b) => Math.abs(b.quote.changePct) - Math.abs(a.quote.changePct) || a.symbol.localeCompare(b.symbol))
    .slice(0, moverCount)
    .map((a) => {
      const ch = formatChange(a.quote.changePct);
      return { symbol: a.symbol, name: a.name, price: formatPrice(a.quote.price), change: ch.text, tone: ch.tone };
    });
  const times = live.map((a) => a.quote.asOf).filter((t): t is string => !!t).sort();
  return {
    counted: live.length,
    total: catalog.assets.length,
    up,
    down,
    flat: live.length - up - down,
    window: changeWindowText(live[0]!.quote),
    movers,
    asOf: times.at(-1) ?? catalog.asOf,
    source,
  };
}

/** "7 down, 3 up of 10 live coins, over 24h". */
export function snapshotBreadth(s: Pick<LiveSnapshot, "counted" | "up" | "down" | "flat" | "window">): string {
  const parts = [
    s.down ? `${s.down} down` : "",
    s.up ? `${s.up} up` : "",
    s.flat ? `${s.flat} flat` : "",
  ].filter(Boolean);
  if (parts.length === 1) {
    const dir = s.down ? "down" : s.up ? "up" : "flat";
    return `All ${s.counted} live coins ${dir}, ${s.window}`;
  }
  return `${parts.join(", ")} of ${s.counted} live coins, ${s.window}`;
}

/** "6:42 PM" in the visitor's own time zone, or "time not reported". */
export function snapshotTime(asOf: string | null, locale?: string): string {
  if (!asOf || Number.isNaN(Date.parse(asOf))) return "time not reported";
  return new Date(asOf).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
}

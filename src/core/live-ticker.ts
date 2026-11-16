/**
 * Real-time crypto prices in the web app: while the page is open and visible, it subscribes to
 * Kraken's public ticker stream (wss://ws.kraken.com/v2, keyless) and lays each new trade price
 * over the captured prices (captured-prices.ts), which come from the same source. So the app moves
 * tick by tick, and still starts from, and agrees with, what the connector reports.
 *
 * The change is always measured from the captured file's own baseline ("since 00:00 UTC"), not
 * Kraken's rolling 24 hours, so the window never silently changes. Nothing is sent to Kraken but
 * the list of coins; the stream closes when the page is hidden. Where WebSocket isn't available
 * (tests, old browsers) it simply does nothing and the captured prices show as before.
 */
import { CRYPTO_COINS } from "../data/crypto";
import type { CatalogView } from "./assets";

export const KRAKEN_STREAM_URL = "wss://ws.kraken.com/v2";
/** Kraken's v2 names for the ten coins (DOGE is "DOGE/USD" here, XDG in the REST API). */
export const STREAM_SYMBOLS: Readonly<Record<string, string>> = Object.fromEntries(CRYPTO_COINS.map((c) => [`${c.symbol}/USD`, c.symbol]));
/** A tick older than this no longer counts as live (the stream may have stalled). */
export const TICK_FRESH_MS = 2 * 60_000;
/** Redraws are grouped: at most one this often, however fast the ticks arrive. */
export const NOTIFY_EVERY_MS = 1_000;

export interface Tick {
  price: number;
  at: number;
}

const ticks = new Map<string, Tick>();
const listeners = new Set<() => void>();
let socket: WebSocket | null = null;
let retry = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let notifyTimer: ReturnType<typeof setTimeout> | undefined;
let watchingVisibility = false;

/** Reads one stream message into ticks. Pure apart from the shared map; returns how many it took. */
export function readStreamMessage(raw: string, now: number = Date.now(), into: Map<string, Tick> = ticks): number {
  let msg: { channel?: string; data?: Array<Record<string, unknown>> };
  try {
    msg = JSON.parse(raw) as typeof msg;
  } catch {
    return 0;
  }
  if (msg.channel !== "ticker" || !Array.isArray(msg.data)) return 0;
  let taken = 0;
  for (const d of msg.data) {
    const symbol = typeof d.symbol === "string" ? STREAM_SYMBOLS[d.symbol] : undefined;
    const price = typeof d.last === "number" && Number.isFinite(d.last) && d.last > 0 ? d.last : null;
    if (!symbol || price == null) continue;
    into.set(symbol, { price, at: now });
    taken += 1;
  }
  return taken;
}

/**
 * The captured catalog with live ticks laid over it. The change keeps the captured window: the
 * baseline is recovered from the captured price and change, then compared with the live price.
 */
export function withTicks(catalog: CatalogView, now: number = Date.now(), from: Map<string, Tick> = ticks): CatalogView {
  let newest = 0;
  const assets = catalog.assets.map((a) => {
    const tick = from.get(a.symbol);
    const base = a.quote.price;
    if (!tick || now - tick.at > TICK_FRESH_MS || base == null) return a;
    const pct = a.quote.changePct;
    const open = pct == null ? null : base / (1 + pct / 100);
    newest = Math.max(newest, tick.at);
    return {
      ...a,
      badge: "Live" as const,
      quote: {
        ...a.quote,
        price: tick.price,
        changePct: open ? Math.round(((tick.price - open) / open) * 10_000) / 100 : null,
        asOf: new Date(tick.at).toISOString(),
        freshness: "live" as const,
        freshnessLabel: "Live from Kraken, updating as it trades",
      },
    };
  });
  return newest ? { ...catalog, assets, asOf: new Date(newest).toISOString() } : catalog;
}

/** Call `fn` (at most once a second) when new ticks arrive. Returns a function that stops it. */
export function onTicks(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  if (notifyTimer) return;
  notifyTimer = setTimeout(() => {
    notifyTimer = undefined;
    for (const fn of listeners) fn();
  }, NOTIFY_EVERY_MS);
}

function visible(): boolean {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

function close(): void {
  clearTimeout(retryTimer);
  const s = socket;
  socket = null;
  if (s && (s.readyState === 0 || s.readyState === 1)) s.close();
}

/** Opens the stream if it isn't open (and the page is visible). Safe to call on every refresh. */
export function startTicker(): void {
  // Browsers only: Node also has WebSocket, and tests and builds must never open a stream.
  if (typeof WebSocket === "undefined" || typeof document === "undefined") return;
  // Watch visibility first, so a page opened in a background tab starts streaming once it is shown.
  if (!watchingVisibility) {
    watchingVisibility = true;
    // A hidden page needs no live prices: close, and reopen when it is shown again.
    document.addEventListener("visibilitychange", () => (visible() ? startTicker() : close()));
  }
  if (socket || !visible()) return;
  const s = new WebSocket(KRAKEN_STREAM_URL);
  socket = s;
  s.onopen = () => {
    retry = 0;
    s.send(JSON.stringify({ method: "subscribe", params: { channel: "ticker", symbol: Object.keys(STREAM_SYMBOLS) } }));
  };
  s.onmessage = (event) => {
    if (typeof event.data === "string" && readStreamMessage(event.data) > 0) notify();
  };
  s.onclose = () => {
    if (socket !== s) return;
    socket = null;
    // Reconnect with a growing pause (2 s up to 1 min) while the page stays visible.
    retry = Math.min(retry + 1, 6);
    if (visible()) retryTimer = setTimeout(startTicker, Math.min(60_000, 1_000 * 2 ** retry));
  };
  s.onerror = () => s.close();
}

/** For tests: forget every tick and listener, and close the stream. */
export function resetTickerForTests(): void {
  close();
  ticks.clear();
  listeners.clear();
  retry = 0;
}

import {
  CONNECT_ATLAS,
  LEANS_DOWN,
  LEANS_UP,
  MIN_HIT_RATE,
  MIN_SAMPLE_SIZE,
  type SignalView,
} from "./signal";

/** Words and states for the wallet popup. Education only: never trade instructions. */

export type ConnectionState = "desk" | "local" | "live" | "hosted" | "none" | "offline";

export interface SignalCopy {
  headline: string;
  detail: string;
  gate: string;
  icon: "up" | "down" | "flat" | "plug";
}

export const ATLAS_DESK_URL = "http://localhost:3000/markets";
export const EXPLAIN_WEB_URL = "https://atlas-explain.web.app";
/** Chrome Web Store listing. Null until the listing is published (owner step); then every install link uses it. */
export const CHROME_STORE_URL: string | null = null;
/** Where every "Add to Chrome" link points. */
export const INSTALL_URL = CHROME_STORE_URL ?? `${EXPLAIN_WEB_URL}/how-it-works#install`;

export function signalCopy(view: SignalView): SignalCopy {
  if (!view.connected || view.reason === CONNECT_ATLAS) {
    return {
      headline: "No desk in this tab",
      detail: "The light reads the ATLAS Markets desk when it is open in this tab. Until then it stays grey.",
      gate: "Desk not open",
      icon: "plug",
    };
  }
  if (view.colour === "green" && view.reason === LEANS_UP) {
    return {
      headline: "Model leans up",
      detail: "ATLAS shadow models lean up here and have cleared the evidence gate. It is a model read on paper, not an instruction.",
      gate: "Evidence gate cleared",
      icon: "up",
    };
  }
  if (view.colour === "red" && view.reason === LEANS_DOWN) {
    return {
      headline: "Model leans down",
      detail: "ATLAS shadow models lean down here and have cleared the evidence gate. It is a model read on paper, not an instruction.",
      gate: "Evidence gate cleared",
      icon: "down",
    };
  }
  return {
    headline: "Not enough evidence",
    detail: `The light turns green or red only after at least ${MIN_SAMPLE_SIZE} resolved paper samples and a ${Math.round(MIN_HIT_RATE * 100)}% hit rate. ATLAS shadow models have not cleared that yet, so grey is the honest answer.`,
    gate: "Below evidence gate",
    icon: "flat",
  };
}

/**
 * Header chip. Public visitors only ever see "Live prices" or "Offline"; the ATLAS states
 * appear only for someone running ATLAS. "hosted" and "none" have no chip at all.
 */
export function connectionCopy(state: ConnectionState): { label: string; title: string } {
  if (state === "offline") {
    return { label: "Offline", title: "You're offline. Answers on this device still work if your browser supports them." };
  }
  if (state === "local") {
    return { label: "ATLAS connected", title: "ATLAS research software is running on this computer." };
  }
  if (state === "desk") {
    return { label: "ATLAS desk", title: "This tab is the ATLAS Markets desk. Only its public paper signal is read." };
  }
  if (state === "live") {
    return { label: "Live prices", title: "Crypto prices are live. The source is named next to the prices." };
  }
  return { label: "", title: "" };
}

/** True when the header chip has something worth saying. */
export function showsConnectionChip(state: ConnectionState): boolean {
  return connectionCopy(state).label !== "";
}

export function whyQuestion(view: SignalView): string {
  const copy = signalCopy(view);
  return `Why would an educational signal light show "${copy.headline}"? Explain hit rate, sample size, and why a model can lack evidence. Do not recommend a trade.`;
}

export const EMPTY_TITLE = "Highlight anything you don't understand";
export const EMPTY_BODY =
  "Select a term on any page, then press Explain. You can also right-click and choose Explain with ATLAS.";
export const SHORTCUT_HINT = "Alt+Shift+E opens this popup.";

export const STEP_READ = "Reading your highlight";
export const STEP_DEVICE = "Trying your device first";
export const STEP_CLOUD = "Asking the cloud model";

export const OFFLINE_ANSWER =
  "You're offline, and this browser can't answer on the device. Reconnect and try again.";

/** Preview explanation for store screenshots and the no-Chrome preview page. Not a market call. */
export const SAMPLE_EXPLANATION = {
  selection: "stop-limit order",
  text:
    "A stop-limit order has two prices. The stop price wakes the order up; the limit price caps the worst fill you will accept.\n\nIf the market jumps past your limit, the order can sit unfilled. That is the trade-off: price control in exchange for no guarantee of a fill.\n\nEducational information, not investment advice.",
};

export function shortSelection(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

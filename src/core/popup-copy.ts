import {
  CONNECT_ATLAS,
  LEANS_DOWN,
  LEANS_UP,
  MIN_HIT_RATE,
  MIN_SAMPLE_SIZE,
  type SignalView,
} from "./signal";

/** Words and states for the wallet popup. Education only: never trade instructions. */

export type ConnectionState = "desk" | "local" | "none" | "offline";

export interface SignalCopy {
  headline: string;
  detail: string;
  gate: string;
  icon: "up" | "down" | "flat" | "plug";
}

export const ATLAS_DESK_URL = "http://localhost:3000/markets";
export const EXPLAIN_WEB_URL = "https://atlas-explain.web.app";

export function signalCopy(view: SignalView): SignalCopy {
  if (!view.connected || view.reason === CONNECT_ATLAS) {
    return {
      headline: "Connect ATLAS",
      detail: "Open the ATLAS Markets desk in this tab to read its public paper signal. Until then the light stays grey.",
      gate: "No desk in this tab",
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

export function connectionCopy(state: ConnectionState): { label: string; title: string } {
  if (state === "offline") {
    return { label: "Offline", title: "You are offline. On-device explanations still work when Chrome has Gemini Nano." };
  }
  if (state === "local") {
    return { label: "ATLAS local", title: "ATLAS is running on this computer. The Assets tab reads its public prices and paper stats." };
  }
  if (state === "desk") {
    return { label: "ATLAS desk", title: "This tab is the ATLAS Markets desk. Only its public paper signal is read." };
  }
  return { label: "Not connected", title: "Open the ATLAS Markets desk in this tab to connect." };
}

export function whyQuestion(view: SignalView): string {
  const copy = signalCopy(view);
  return `Why would an educational signal light show "${copy.headline}"? Explain hit rate, sample size, and why a model can lack evidence. Do not recommend a trade.`;
}

export const EMPTY_TITLE = "Highlight anything you don't understand";
export const EMPTY_BODY =
  "Select a term on any page, then press Explain. You can also right-click and choose Explain with ATLAS.";
export const SHORTCUT_HINT = "Alt+Shift+E opens this popup.";

export const STEP_READ = "Reading the highlight, title, and site name";
export const STEP_DEVICE = "Trying Gemini Nano on this device";
export const STEP_CLOUD = "Asking Firebase AI Logic in the cloud";

export const OFFLINE_ANSWER =
  "You are offline and Chrome's on-device model is not available here. Reconnect to use the cloud fallback.";

export const BILLING_NOTE = "Free during beta. Billing is built in and switched off.";

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

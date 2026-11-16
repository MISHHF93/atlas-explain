import {
  CONNECT_ATLAS,
  LEANS_DOWN,
  LEANS_UP,
  MIN_HIT_RATE,
  MIN_SAMPLE_SIZE,
  type SignalView,
} from "./signal";

/** Words and states for the web app. Education only: never trade instructions. */

export type ConnectionState = "desk" | "local" | "live" | "hosted" | "none" | "offline";

/**
 * Which status the header pill shows. One rule:
 * offline beats everything; the ATLAS desk beats the rest; then ATLAS on this computer,
 * then live public prices. `hosted` is the public website, which never looks for ATLAS.
 */
export function connectionFor(input: { online: boolean; deskConnected: boolean; atlasLocal: boolean; livePrices: boolean; hosted?: boolean }): ConnectionState {
  if (!input.online) return "offline";
  if (input.deskConnected) return "desk";
  if (input.hosted) return input.livePrices ? "live" : "hosted";
  return input.atlasLocal ? "local" : input.livePrices ? "live" : "none";
}

export interface SignalCopy {
  headline: string;
  detail: string;
  gate: string;
  icon: "up" | "down" | "flat" | "plug";
}

export const ATLAS_DESK_URL = "http://localhost:3000/markets";

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

/** The sample explained by "Try a sample now" in onboarding: the fastest path to a first answer. */
export const SAMPLE_TERM = "Stop-limit order";

export const EMPTY_TITLE = "Type anything you don't understand";
export const EMPTY_BODY =
  "Type or paste a term or a sentence, then press Explain.";

export const STEP_READ = "Reading your question";
export const STEP_DEVICE = "Trying your device first";
export const STEP_CLOUD = "Asking the cloud model";

export const OFFLINE_ANSWER =
  "You're offline, and this browser can't answer on the device. Reconnect and try again.";


export function shortSelection(text: string, max = 90): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

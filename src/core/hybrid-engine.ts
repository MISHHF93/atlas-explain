/**
 * Hybrid inference status for the Explain tab: which route the next answer will take.
 * Reads Chrome's Prompt API availability only. It never creates a session and never
 * starts a model download, so opening the popup stays instant and free.
 */

export type EngineState = "checking" | "ready" | "downloadable" | "downloading" | "cloud" | "offline";
export type EngineRoute = "device" | "cloud" | "none";

export interface EngineCopy {
  label: string;
  detail: string;
  /** The route the next answer is expected to take. */
  route: EngineRoute;
}

interface AvailabilityApi {
  availability: (options?: unknown) => Promise<string>;
}

const STATES: readonly EngineState[] = ["checking", "ready", "downloadable", "downloading", "cloud", "offline"];

export function isEngineState(value: unknown): value is EngineState {
  return typeof value === "string" && (STATES as readonly string[]).includes(value);
}

/** Maps a Prompt API availability string (old and new spellings) to an engine state. */
export function mapAvailability(value: string | null | undefined): Exclude<EngineState, "checking" | "offline"> {
  switch ((value ?? "").toLowerCase()) {
    case "available":
    case "readily":
      return "ready";
    case "downloadable":
    case "after-download":
      return "downloadable";
    case "downloading":
      return "downloading";
    default:
      return "cloud";
  }
}

/** Reads the on-device model state from `globalThis.LanguageModel` without side effects. */
export async function readEngineState(
  scope: { LanguageModel?: AvailabilityApi } = globalThis as { LanguageModel?: AvailabilityApi },
  online = typeof navigator === "undefined" ? true : navigator.onLine,
): Promise<EngineState> {
  let state: Exclude<EngineState, "checking" | "offline"> = "cloud";
  const api = scope.LanguageModel;
  if (api && typeof api.availability === "function") {
    try {
      state = mapAvailability(await api.availability());
    } catch {
      state = "cloud";
    }
  }
  if (!online && state !== "ready") return "offline";
  return state;
}

export function engineCopy(state: EngineState): EngineCopy {
  switch (state) {
    case "checking":
      return { label: "Checking your browser", detail: "Checking whether this browser can answer on your device. Nothing is sent.", route: "none" };
    case "ready":
      return {
        label: "On-device ready",
        detail: "Answers run on this device first. The cloud stays on standby and is used only if the on-device model cannot answer.",
        route: "device",
      };
    case "downloadable":
      return {
        label: "Cloud for now",
        detail: "Chrome can download Gemini Nano to answer on your device. Until it does, Gemini answers in the cloud.",
        route: "cloud",
      };
    case "downloading":
      return {
        label: "Cloud for now",
        detail: "Chrome is downloading Gemini Nano. Until it finishes, Gemini answers in the cloud.",
        route: "cloud",
      };
    case "offline":
      return {
        label: "Offline",
        detail: "You are offline and this browser has no on-device model ready. Reconnect for cloud answers.",
        route: "none",
      };
    default:
      return {
        label: "Cloud answers",
        detail: "This browser can't answer on your device, so Gemini answers in the cloud. Each answer is labelled.",
        route: "cloud",
      };
  }
}

/** Short line for the answer that actually ran, shown on the strip after an explanation. */
export function lastRunLine(source: "on_device" | "in_cloud" | "unknown"): string {
  if (source === "on_device") return "Last answer ran on this device.";
  if (source === "in_cloud") return "Last answer ran in the cloud.";
  return "The last answer did not report where it ran.";
}

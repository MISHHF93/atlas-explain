/**
 * The cloud bridge lets the Chrome extension use Firebase AI Logic with App Check.
 * reCAPTCHA Enterprise cannot attest chrome-extension:// pages, so the extension embeds
 * https://atlas-explain.web.app/bridge.html in a hidden iframe. The bridge runs on the
 * real web origin, passes App Check, and answers only our own extension.
 *
 * The bridge never accepts a system prompt or model from the caller: it uses the
 * fixed extension prompt, so it cannot be used as a general-purpose model proxy.
 */
export const BRIDGE_ORIGIN = "https://atlas-explain.web.app";
export const BRIDGE_URL = `${BRIDGE_ORIGIN}/bridge.html`;

/**
 * Extension ids allowed to talk to the bridge. The first is pinned by the public key
 * in extension/manifest.json (unpacked installs). Add the Chrome Web Store id after publishing.
 */
export const ALLOWED_EXTENSION_IDS: readonly string[] = ["ppobolmelmhmaofinpcihihlnhokiomm"];

export const BRIDGE_VERSION = 1;
export const MAX_PROMPT_CHARS = 16_000;

export type BridgeRequest =
  | { v: 1; id: string; type: "settings" }
  | { v: 1; id: string; type: "account" }
  | { v: 1; id: string; type: "explain"; prompt: string };

export type BridgeResponse =
  | { v: 1; id: string; type: "result"; ok: true; data: unknown }
  | { v: 1; id: string; type: "result"; ok: false; error: string; code?: string };

export interface BridgeReady {
  v: 1;
  type: "ready";
}

export function isAllowedExtensionOrigin(origin: string): boolean {
  return ALLOWED_EXTENSION_IDS.some((id) => origin === `chrome-extension://${id}`);
}

const ID = /^[a-z0-9-]{4,64}$/i;

/** Parse an incoming request. Anything unexpected is dropped, never coerced. */
export function readBridgeRequest(raw: unknown): BridgeRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== BRIDGE_VERSION || typeof r.id !== "string" || !ID.test(r.id)) return null;
  if (r.type === "settings" || r.type === "account") return { v: 1, id: r.id, type: r.type };
  if (r.type === "explain" && typeof r.prompt === "string") {
    const prompt = r.prompt.trim();
    if (!prompt || prompt.length > MAX_PROMPT_CHARS) return null;
    return { v: 1, id: r.id, type: "explain", prompt };
  }
  return null;
}

export function readBridgeResponse(raw: unknown): BridgeResponse | BridgeReady | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== BRIDGE_VERSION) return null;
  if (r.type === "ready") return { v: 1, type: "ready" };
  if (r.type !== "result" || typeof r.id !== "string") return null;
  if (r.ok === true) return { v: 1, id: r.id, type: "result", ok: true, data: r.data };
  if (r.ok === false && typeof r.error === "string") {
    return { v: 1, id: r.id, type: "result", ok: false, error: r.error.slice(0, 300), ...(typeof r.code === "string" ? { code: r.code.slice(0, 80) } : {}) };
  }
  return null;
}

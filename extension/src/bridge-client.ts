import { BRIDGE_ORIGIN, BRIDGE_URL, readBridgeResponse, type BridgeRequest } from "../../src/bridge/protocol";

/**
 * Talks to https://atlas-explain.web.app/bridge.html in a hidden iframe. Only messages
 * from that exact origin are read. Every request has a deadline.
 */
const READY_TIMEOUT_MS = 12_000;

let frame: HTMLIFrameElement | null = null;
let ready: Promise<void> | null = null;
let counter = 0;

function ensureBridge(): Promise<void> {
  if (ready) return ready;
  ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      ready = null;
      frame?.remove();
      frame = null;
      reject(new Error("The cloud connection did not start. Check your connection and try again."));
    }, READY_TIMEOUT_MS);
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== BRIDGE_ORIGIN || event.source !== frame?.contentWindow) return;
      if (readBridgeResponse(event.data)?.type === "ready") {
        clearTimeout(timer);
        window.removeEventListener("message", onMessage);
        resolve();
      }
    };
    window.addEventListener("message", onMessage);
    frame = document.createElement("iframe");
    frame.src = BRIDGE_URL;
    frame.title = "ATLAS Explain cloud connection";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none";
    document.body.append(frame);
  });
  return ready;
}

type Body<T> = T extends { v: 1; id: string } ? Omit<T, "v" | "id"> : never;

export class BridgeError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "BridgeError";
  }
}

export async function askBridge(body: Body<BridgeRequest>, timeoutMs: number): Promise<unknown> {
  await ensureBridge();
  const id = `r${Date.now().toString(36)}${(counter++).toString(36)}`;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new BridgeError("The answer took too long."));
    }, timeoutMs);
    function onMessage(event: MessageEvent) {
      if (event.origin !== BRIDGE_ORIGIN || event.source !== frame?.contentWindow) return;
      const res = readBridgeResponse(event.data);
      if (!res || res.type !== "result" || res.id !== id) return;
      clearTimeout(timer);
      window.removeEventListener("message", onMessage);
      if (res.ok) resolve(res.data);
      else reject(new BridgeError(res.error, res.code));
    }
    window.addEventListener("message", onMessage);
    frame?.contentWindow?.postMessage({ v: 1, id, ...body }, BRIDGE_ORIGIN);
  });
}

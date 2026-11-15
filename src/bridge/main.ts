import { accountView } from "../core/account";
import { parseRemoteSettings } from "../core/settings";
import { classifyCloudError, report } from "../core/monitor";
import { readPublicEnv } from "../platform/web/env";
import { createExplainService, createUserId, readRemoteValues, startFirebase } from "../platform/web/explain-service";
import { lazyExplainer } from "../platform/web/lazy";
import { BRIDGE_VERSION, isAllowedExtensionOrigin, readBridgeRequest, type BridgeRequest, type BridgeResponse } from "./protocol";

/**
 * Hidden page the extension embeds. Runs on atlas-explain.web.app so reCAPTCHA
 * Enterprise (App Check) can attest it. Answers only allowed extension origins.
 */
const parentOrigin = location.ancestorOrigins?.[0] ?? "";
const framed = window.parent !== window;

if (!framed || !isAllowedExtensionOrigin(parentOrigin)) {
  document.body.textContent = "This page is used by the ATLAS Explain Chrome extension. Open https://atlas-explain.web.app instead.";
} else {
  start();
}

function start(): void {
  const env = readPublicEnv(import.meta.env as Record<string, string | boolean | undefined>, { allowDebugToken: import.meta.env.DEV });
  if (!env.firebaseOptions || !env.recaptchaEnterpriseSiteKey) return;
  // The same back end as the web app: Firebase, settings, limits and the model call all come
  // from explain-service.ts. The bridge only checks who is asking and passes the request on.
  const { app, auth, remoteConfig } = startFirebase(env);
  const service = createExplainService({
    explainer: lazyExplainer(app),
    db: async () => (await import("firebase/firestore")).getFirestore(app),
    userId: createUserId(auth),
  });

  const handle = async (req: BridgeRequest): Promise<unknown> => {
    if (req.type === "settings") return readRemoteValues(remoteConfig);
    if (req.type === "account") {
      await auth.authStateReady();
      return accountView(auth.currentUser);
    }
    const settings = parseRemoteSettings(await readRemoteValues(remoteConfig)).settings;
    const gate = await service.cloudGate(settings);
    if (!gate.allowed) {
      if (gate.allowByPlan) report("rate_limited", "bridge", "browser_limit");
      return { blocked: true, text: service.blockedMessage(gate) };
    }
    // The popup already tried Gemini Nano, so the bridge only ever answers from the cloud.
    const result = await service.answerText(settings, { prompt: req.prompt, mode: "only_in_cloud", gate });
    return { blocked: false, text: result.rawText };
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent || !isAllowedExtensionOrigin(event.origin)) return;
    const req = readBridgeRequest(event.data);
    if (!req) return;
    const reply = (message: BridgeResponse) => window.parent.postMessage(message, event.origin);
    void handle(req).then(
      (data) => reply({ v: 1, id: req.id, type: "result", ok: true, data }),
      (error: unknown) => {
        const code = error && typeof error === "object" && "code" in error ? String((error as { code: unknown }).code) : undefined;
        const message = error instanceof Error ? error.message : "The cloud model did not answer.";
        report(classifyCloudError(message), "bridge", code ?? "unknown");
        reply({ v: 1, id: req.id, type: "result", ok: false, error: message.slice(0, 300), ...(code ? { code } : {}) });
      },
    );
  });

  window.parent.postMessage({ v: BRIDGE_VERSION, type: "ready" }, parentOrigin);
}

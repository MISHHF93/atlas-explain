import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { fetchAndActivate, getRemoteConfig, getValue } from "firebase/remote-config";
import { accountView } from "../core/account";
import { allowCloudCall } from "../core/billing";
import { EXTENSION_SYSTEM } from "../core/extension-prompt";
import { DEFAULT_CLOUD_MODEL, REMOTE_CONFIG_KEYS, parseRemoteSettings, remoteConfigDefaults } from "../core/settings";
import { SETTINGS_FETCH_TIMEOUT_MS } from "../core/timeouts";
import { localRateStore, takeCloudSlot } from "../core/rate-limit";
import { classifyCloudError, report } from "../core/monitor";
import { readPublicEnv } from "../platform/web/env";
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
  const app = initializeApp(env.firebaseOptions);
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.recaptchaEnterpriseSiteKey), isTokenAutoRefreshEnabled: true });
  const auth = getAuth(app);
  const remoteConfig = getRemoteConfig(app);
  remoteConfig.defaultConfig = { ...remoteConfigDefaults() };
  remoteConfig.settings.minimumFetchIntervalMillis = 60_000;
  remoteConfig.settings.fetchTimeoutMillis = SETTINGS_FETCH_TIMEOUT_MS;

  const readSettings = async (): Promise<Record<string, string>> => {
    await fetchAndActivate(remoteConfig).catch(() => false);
    const values: Record<string, string> = {};
    for (const key of REMOTE_CONFIG_KEYS) values[key] = getValue(remoteConfig, key).asString();
    return values;
  };

  const handle = async (req: BridgeRequest): Promise<unknown> => {
    if (req.type === "settings") return readSettings();
    if (req.type === "account") {
      await auth.authStateReady();
      return accountView(auth.currentUser);
    }
    const settings = parseRemoteSettings(await readSettings()).settings;
    let uid: string | null = null;
    if (settings.billingEnabled) {
      // Metering only exists once billing is switched on. It ships off.
      const [{ signInAnonymously }, { getFirestore }, usage] = await Promise.all([
        import("firebase/auth"),
        import("firebase/firestore"),
        import("../platform/web/usage"),
      ]);
      await auth.authStateReady();
      uid = auth.currentUser?.uid ?? (await signInAnonymously(auth).then((c) => c.user.uid).catch(() => null));
      const used = uid ? await usage.readCloudCallsToday(getFirestore(app), uid).catch(() => 0) : 0;
      const allowed = uid ? allowCloudCall({ billingEnabled: true, plan: "free", freeCloudDailyLimit: settings.freeCloudDailyLimit, cloudCallsToday: used }) : false;
      if (!allowed) return { blocked: true, text: "Today's free cloud explanations are used up. Explanations that run on this device are still unlimited." };
    }
    const slot = takeCloudSlot(localRateStore());
    if (!slot.ok) {
      report("rate_limited", "bridge", "browser_limit");
      return { blocked: true, text: slot.reason };
    }
    const { GoogleAIBackend, InferenceMode, getAI, getGenerativeModel } = await import("firebase/ai");
    const ai = getAI(app, { backend: new GoogleAIBackend() });
    const model = getGenerativeModel(
      ai,
      {
        mode: InferenceMode.ONLY_IN_CLOUD,
        inCloudParams: {
          model: settings.cloudModel || DEFAULT_CLOUD_MODEL,
          systemInstruction: EXTENSION_SYSTEM,
          generationConfig: { maxOutputTokens: settings.maxOutputTokens, responseMimeType: "application/json" },
        },
      },
      { timeout: 45_000 },
    );
    const result = await model.generateContent(req.prompt);
    if (settings.billingEnabled && uid) {
      const [{ getFirestore }, usage] = await Promise.all([import("firebase/firestore"), import("../platform/web/usage")]);
      await usage.incrementCloudCalls(getFirestore(app), uid).catch(() => undefined);
    }
    return { blocked: false, text: result.response.text() };
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

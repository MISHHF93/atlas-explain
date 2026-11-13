import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";
import { allowCloudCall } from "../../src/core/billing";
import { EXTENSION_SYSTEM } from "../../src/core/extension-prompt";
import {
  DEFAULT_CLOUD_MODEL,
  REMOTE_CONFIG_KEYS,
  parseRemoteSettings,
  remoteConfigDefaults,
} from "../../src/core/settings";
import type { AppSettings } from "../../src/core/types";
import {
  PUBLIC_FIREBASE_CONFIG,
  PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY,
} from "../../src/platform/web/firebaseConfig";

export interface CloudAnswer {
  text: string;
  blocked: boolean;
}

declare global {
  interface Window {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
  }
}

let appPromise: Promise<FirebaseApp> | null = null;

async function firebaseApp(debugToken: string | null): Promise<FirebaseApp> {
  if (debugToken) {
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }
  appPromise ??= (async () => {
    const app = initializeApp(PUBLIC_FIREBASE_CONFIG, "atlas-explain-extension");
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY),
      isTokenAutoRefreshEnabled: true,
    });
    return app;
  })();
  return appPromise;
}

export async function loadExtensionSettings(debugToken: string | null): Promise<AppSettings> {
  try {
    const app = await firebaseApp(debugToken);
    const remoteConfig = getRemoteConfig(app);
    remoteConfig.defaultConfig = { ...remoteConfigDefaults() };
    remoteConfig.settings.minimumFetchIntervalMillis = 60_000;
    // A slow network must not leave the popup spinning for a minute.
    remoteConfig.settings.fetchTimeoutMillis = 6_000;
    try {
      await fetchAndActivate(remoteConfig);
    } catch {
      // Built-in defaults keep billing off.
    }
    const values: Record<string, string> = {};
    for (const key of REMOTE_CONFIG_KEYS) values[key] = getValue(remoteConfig, key).asString();
    return parseRemoteSettings(values).settings;
  } catch {
    return parseRemoteSettings({}).settings;
  }
}

/**
 * Cloud fallback through Firebase AI Logic, cloud only.
 * The extension already tried the Chrome Prompt API.
 */
export async function explainInCloud(prompt: string, debugToken: string | null): Promise<CloudAnswer> {
  const app = await firebaseApp(debugToken);
  const settings = await loadExtensionSettings(debugToken);
  const plan = "free" as const;
  let uid: string | null = null;
  let used = 0;
  // Auth and Firestore only load when billing is switched on (it ships off).
  const metering = settings.billingEnabled ? await loadMetering() : null;
  if (metering) {
    try {
      const credential = await metering.signInAnonymously(metering.getAuth(app));
      uid = credential.user.uid;
      used = await metering.readCloudCallsToday(metering.getFirestore(app), uid);
    } catch {
      uid = null;
    }
  }
  const allowed = uid || !settings.billingEnabled
    ? allowCloudCall({
        billingEnabled: settings.billingEnabled,
        plan,
        freeCloudDailyLimit: settings.freeCloudDailyLimit,
        cloudCallsToday: used,
      })
    : false;
  if (!allowed) {
    return {
      blocked: true,
      text: "Today's free cloud explanations are used up. Explanations that run on this device are still unlimited. Pro is coming after beta.",
    };
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
  const result = await model.generateContent(prompt);
  if (metering && uid) {
    await metering.incrementCloudCalls(metering.getFirestore(app), uid);
  }
  return { blocked: false, text: result.response.text() };
}

async function loadMetering() {
  const [auth, firestore, usage] = await Promise.all([
    import("firebase/auth"),
    import("firebase/firestore"),
    import("../../src/platform/web/usage"),
  ]);
  return {
    getAuth: auth.getAuth,
    signInAnonymously: auth.signInAnonymously,
    getFirestore: firestore.getFirestore,
    readCloudCallsToday: usage.readCloudCallsToday,
    incrementCloudCalls: usage.incrementCloudCalls,
  };
}

import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, signInAnonymously } from "firebase/auth";
import {
  GoogleAIBackend,
  InferenceMode,
  getAI,
  getGenerativeModel,
} from "firebase/ai";
import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";
import { getFirestore } from "firebase/firestore";
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
import { incrementCloudCalls, readCloudCallsToday } from "../../src/platform/web/usage";

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
  if (settings.billingEnabled) {
    try {
      const credential = await signInAnonymously(getAuth(app));
      uid = credential.user.uid;
      used = await readCloudCallsToday(getFirestore(app), uid);
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

  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(
    ai,
    {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: {
        model: settings.cloudModel || DEFAULT_CLOUD_MODEL,
        systemInstruction: EXTENSION_SYSTEM,
        generationConfig: { maxOutputTokens: settings.maxOutputTokens },
      },
    },
    { timeout: 45_000 },
  );
  const result = await model.generateContent(prompt);
  if (settings.billingEnabled && uid) {
    await incrementCloudCalls(getFirestore(app), uid);
  }
  return { blocked: false, text: result.response.text() };
}

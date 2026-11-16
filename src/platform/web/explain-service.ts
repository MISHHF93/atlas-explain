/**
 * The one back end for ATLAS Explain. The web app (backend.ts) starts Firebase here, reads
 * settings here and asks for an answer here, so limits, prompts, the model call and the usage
 * count live in one place.
 */
import { initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, signInAnonymously, type Auth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import { fetchAndActivate, getRemoteConfig, getValue, type RemoteConfig } from "firebase/remote-config";
import { CloudAllowanceUsed, allowCloudCall, type PlanId } from "../../core/billing";
import { EXPLAIN_SYSTEM } from "../../core/explain-prompt";
import { localRateStore, peekCloudSlot, recordCloudCall, type RateDecision } from "../../core/rate-limit";
import { REMOTE_CONFIG_KEYS, remoteConfigDefaults } from "../../core/settings";
import { SETTINGS_FETCH_TIMEOUT_MS } from "../../core/timeouts";
import type { AppSettings, ExplainHooks, HybridExplainResult, HybridExplainer, InferenceModeName } from "../../core/types";
import type { PublicEnvConfig } from "./env";

export interface FirebaseCore {
  app: FirebaseApp;
  auth: Auth;
  remoteConfig: RemoteConfig;
}

/** Starts Firebase with App Check and Remote Config defaults. Throws when the public config is incomplete. */
export function startFirebase(env: PublicEnvConfig, options: { minimumFetchIntervalMillis?: number } = {}): FirebaseCore {
  if (!env.firebaseOptions || !env.recaptchaEnterpriseSiteKey) {
    throw new Error("Firebase config is incomplete.");
  }
  if (env.appCheckDebugToken != null) {
    // Firebase reads this on `self` before App Check initializes.
    // Dev builds set it; production builds leave it unset.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = env.appCheckDebugToken;
  }
  const app = initializeApp(env.firebaseOptions);
  // App Check is required before AI Logic, Firestore, and Remote Config calls.
  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(env.recaptchaEnterpriseSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
  const remoteConfig = getRemoteConfig(app);
  remoteConfig.settings.minimumFetchIntervalMillis = options.minimumFetchIntervalMillis ?? 60_000;
  // A slow network must not hold the first explanation hostage; defaults stay active.
  remoteConfig.settings.fetchTimeoutMillis = SETTINGS_FETCH_TIMEOUT_MS;
  remoteConfig.defaultConfig = { ...remoteConfigDefaults() };
  return { app, auth: getAuth(app), remoteConfig };
}

/** Remote Config as plain strings. In-app defaults stay active when the fetch fails. */
export async function readRemoteValues(remoteConfig: RemoteConfig): Promise<Record<string, string>> {
  await fetchAndActivate(remoteConfig).catch(() => false);
  const values: Record<string, string> = {};
  for (const key of REMOTE_CONFIG_KEYS) values[key] = getValue(remoteConfig, key).asString();
  return values;
}

/**
 * The current account id. A signed-out visitor gets an anonymous id; a signed-in account
 * is never replaced by one. Concurrent callers share one sign-in.
 */
export function createUserId(auth: Auth): () => Promise<string | null> {
  let anonymous: Promise<string | null> | null = null;
  return async () => {
    await auth.authStateReady();
    if (auth.currentUser) return auth.currentUser.uid;
    anonymous ??= signInAnonymously(auth)
      .then((credential) => credential.user.uid)
      .catch(() => null)
      .finally(() => {
        anonymous = null;
      });
    return anonymous;
  };
}

/** Whether a cloud answer may be asked for right now, and on whose count it goes. */
export interface CloudGate {
  /** Set only when billing is on; that is the only time a cloud answer is counted against an account. */
  uid: string | null;
  plan: PlanId;
  /** The plan's daily cloud limit has room (always true while billing is off). */
  allowByPlan: boolean;
  /** The per-browser safety limit (a few a minute, a few hundred a day). */
  rate: RateDecision;
  allowed: boolean;
}

export interface ExplainService {
  cloudGate(settings: AppSettings): Promise<CloudGate>;
  /** The message to show when the gate is closed: the browser limit's own reason, or the plan limit. */
  blockedMessage(gate: CloudGate): string;
  /** Counts one cloud answer: against the browser limit always, against the account when billing is on. */
  recordCloudAnswer(settings: AppSettings, gate: CloudGate): Promise<void>;
  /**
   * The text/highlight answer (two sides, fixed system prompt). `mode` decides where it may run;
   * a cloud answer is counted before this returns.
   */
  answerText(settings: AppSettings, input: { prompt: string; mode: InferenceModeName; gate: CloudGate; hooks?: ExplainHooks }): Promise<HybridExplainResult>;
}

export function createExplainService(deps: {
  explainer: HybridExplainer;
  /** Firestore, opened on first need: only once billing is on. */
  db: () => Promise<Firestore>;
  userId: () => Promise<string | null>;
}): ExplainService {
  const service: ExplainService = {
    async cloudGate(settings) {
      const rate = peekCloudSlot(localRateStore());
      // Metering only exists once billing is switched on. It ships off.
      if (!settings.billingEnabled) return { uid: null, plan: "free", allowByPlan: true, rate, allowed: rate.ok };
      const uid = await deps.userId();
      if (!uid) return { uid: null, plan: "free", allowByPlan: false, rate, allowed: false };
      const [usage, db] = await Promise.all([import("./usage"), deps.db()]);
      const [cloudCallsToday, plan] = await Promise.all([usage.readCloudCallsToday(db, uid).catch(() => 0), usage.readPlan(db, uid)]);
      const allowByPlan = allowCloudCall({
        billingEnabled: true,
        plan,
        freeCloudDailyLimit: settings.freeCloudDailyLimit,
        proCloudDailyLimit: settings.proCloudDailyLimit,
        cloudCallsToday,
      });
      return { uid, plan, allowByPlan, rate, allowed: allowByPlan && rate.ok };
    },
    blockedMessage(gate) {
      return gate.allowByPlan && !gate.rate.ok ? gate.rate.reason : new CloudAllowanceUsed().message;
    },
    async recordCloudAnswer(settings, gate) {
      recordCloudCall(localRateStore());
      if (!settings.billingEnabled || !gate.uid) return;
      const [usage, db] = await Promise.all([import("./usage"), deps.db()]);
      await usage.incrementCloudCalls(db, gate.uid).catch(() => undefined);
    },
    async answerText(settings, input) {
      const result = await deps.explainer.explain(
        {
          mode: input.mode,
          prompt: input.prompt,
          cloudModel: settings.cloudModel,
          maxOutputTokens: settings.maxOutputTokens,
          topics: settings.topics.map((topic) => topic.id),
          systemInstruction: EXPLAIN_SYSTEM,
          shape: "two_sided",
        },
        input.hooks,
      );
      if (result.inferenceSource === "in_cloud") await service.recordCloudAnswer(settings, input.gate);
      return result;
    },
  };
  return service;
}

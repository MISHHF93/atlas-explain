import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, signInAnonymously } from "firebase/auth";
import { fetchAndActivate, getRemoteConfig, getValue } from "firebase/remote-config";
import {
  PRO_PRICE_ID,
  WatchlistAllowance,
  allowCloudCall,
  billingSnapshot,
  resolveEntitlements,
  watchlistFits,
  type BillingSnapshot,
  type PlanId,
} from "../../core/billing";
import { publicMoveCard } from "../../core/move-card";
import { runExplanation } from "../../core/run-explanation";
import { REMOTE_CONFIG_KEYS, parseRemoteSettings, remoteConfigDefaults } from "../../core/settings";
import type { AppSettings, ExplanationRun, MoveCard } from "../../core/types";
import type { PublicEnvConfig } from "./env";
import { lazyExplainer, lazyPayments } from "./lazy";
import type { WebStore } from "./store";

export interface HistoryEntry {
  id: string;
  createdAtLabel: string;
  symbol: string;
  movePct: number;
  question: string;
  inferenceSource: string;
  summary: string;
  cardJson: string;
}

export interface WebBackend {
  loadSettings(): Promise<{ settings: AppSettings; warnings: string[] }>;
  explain(
    card: MoveCard,
    question: string,
    hooks?: { onProgress?: (message: string) => void },
  ): Promise<ExplanationRun>;
  currentUserId(): Promise<string | null>;
  save(run: ExplanationRun, card: MoveCard, question: string): Promise<void>;
  list(): Promise<HistoryEntry[]>;
  loadBilling(): Promise<BillingSnapshot>;
  linkGoogle(): Promise<"linked" | "already">;
  /** Throws if billing is off. The pricing panel does not call this unless checkout is shown. */
  startCheckout(): Promise<void>;
}

export function startWebBackend(env: PublicEnvConfig): WebBackend {
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

  const auth = getAuth(app);
  let storePromise: Promise<WebStore> | null = null;
  const store = () => (storePromise ??= import("./store").then((mod) => mod.openStore(app)));
  const remoteConfig = getRemoteConfig(app);
  remoteConfig.settings.minimumFetchIntervalMillis = import.meta.env.DEV ? 0 : 60_000;
  remoteConfig.defaultConfig = { ...remoteConfigDefaults() };

  const explainer = lazyExplainer(app);
  const payments = lazyPayments(async () => (await store()).db);

  let userPromise: Promise<string | null> | null = null;
  const currentUserId = () => {
    userPromise ??= signInAnonymously(auth)
      .then((credential) => credential.user.uid)
      .catch(() => null);
    return userPromise;
  };

  const loadSettings = async () => {
    try {
      await fetchAndActivate(remoteConfig);
    } catch {
      // In-app defaults remain active when Remote Config cannot be fetched.
    }
    const values: Record<string, string> = {};
    for (const key of REMOTE_CONFIG_KEYS) {
      values[key] = getValue(remoteConfig, key).asString();
    }
    return parseRemoteSettings(values);
  };

  const loadPlan = async (settings: AppSettings, uid: string | null): Promise<PlanId> => {
    if (!settings.billingEnabled || !uid) return "free";
    return payments.currentPlan(uid);
  };

  const loadBilling = async (): Promise<BillingSnapshot> => {
    const { settings } = await loadSettings();
    const uid = await currentUserId();
    const plan = await loadPlan(settings, uid);
    const cloudCallsToday = uid ? await store().then((s) => s.cloudCallsToday(uid)).catch(() => 0) : 0;
    return billingSnapshot({
      billingEnabled: settings.billingEnabled,
      plan,
      freeCloudDailyLimit: settings.freeCloudDailyLimit,
      cloudCallsToday,
    });
  };

  return {
    loadSettings,
    loadBilling,
    currentUserId,
    async linkGoogle() {
      const { linkAnonymousWithGoogle } = await import("./account");
      return linkAnonymousWithGoogle(auth);
    },
    async startCheckout() {
      const { settings } = await loadSettings();
      if (!settings.billingEnabled) {
        throw new Error("Payments are switched off.");
      }
      const uid = await currentUserId();
      if (!uid) throw new Error("Anonymous sign-in has not finished yet.");
      await payments.startCheckout({
        uid,
        priceId: PRO_PRICE_ID,
        successUrl: window.location.origin,
        cancelUrl: window.location.origin,
      });
    },
    async explain(card, question, hooks) {
      const { settings } = await loadSettings();
      const uid = await currentUserId();
      const plan = await loadPlan(settings, uid);
      const entitlements = resolveEntitlements({
        billingEnabled: settings.billingEnabled,
        plan,
        freeCloudDailyLimit: settings.freeCloudDailyLimit,
      });
      if (!watchlistFits(card.watchlist.length, entitlements)) {
        const limit = entitlements.watchlistSize;
        throw new WatchlistAllowance(typeof limit === "number" ? limit : 0);
      }
      const cloudCallsToday = uid ? await store().then((s) => s.cloudCallsToday(uid)).catch(() => 0) : 0;
      const allowCloud = uid
        ? allowCloudCall({
            billingEnabled: settings.billingEnabled,
            plan,
            freeCloudDailyLimit: settings.freeCloudDailyLimit,
            cloudCallsToday,
          })
        : !settings.billingEnabled;
      hooks?.onProgress?.("Sending the move card through Firebase AI Logic…");
      return runExplanation({
        card,
        question,
        settings,
        explainer,
        meter: {
          allowCloud,
          onCloudInference: async () => {
            if (uid) await (await store()).addCloudCall(uid);
          },
        },
        hooks: {
          onDeviceDownloadProgress(ratio) {
            const percent = Math.round(ratio * 100);
            hooks?.onProgress?.(`Downloading the on-device model… ${percent}%`);
          },
        },
      });
    },
    async save(run, card, question) {
      const uid = await currentUserId();
      if (!uid) {
        throw new Error("Anonymous sign-in failed, so this explanation was not saved.");
      }
      const published = publicMoveCard(card);
      await (await store()).addExplanation(uid, {
        symbol: published.symbol,
        asOf: published.asOf ?? null,
        movePct: published.movePct,
        question: question.trim(),
        inferenceSource: run.inferenceSource,
        requestedMode: run.requestedMode,
        pathReason: run.pathReason,
        privateContextUsed: run.privateContextUsed,
        fellBackToCloud: run.fellBackToCloud,
        cloudModel: run.cloudModel,
        summary: run.explanation.summary,
        buyerReasons: [...run.explanation.buyerReasons],
        sellerReasons: [...run.explanation.sellerReasons],
        whatWouldChange: run.explanation.whatWouldChange,
        headlineTopics: run.explanation.headlineTopics.map((item) => ({
          headline: item.headline,
          topic: item.topic,
          note: item.note,
          coerced: item.coerced,
        })),
        cardJson: JSON.stringify(published),
      });
    },
    async list() {
      const uid = await currentUserId();
      if (!uid) {
        throw new Error(
          "Anonymous sign-in did not complete. Enable Authentication → Anonymous to save and reload explanations.",
        );
      }
      const docs = await (await store()).recentExplanations(uid, 20);
      return docs.map((doc) => {
        const data = doc.data;
        return {
          id: doc.id,
          createdAtLabel: formatTimestamp(data.createdAt),
          symbol: typeof data.symbol === "string" ? data.symbol : "",
          movePct: typeof data.movePct === "number" ? data.movePct : 0,
          question: typeof data.question === "string" ? data.question : "",
          inferenceSource: typeof data.inferenceSource === "string" ? data.inferenceSource : "unknown",
          summary: typeof data.summary === "string" ? data.summary : "",
          cardJson: typeof data.cardJson === "string" ? data.cardJson : "",
        };
      });
    },
  };
}

function formatTimestamp(value: unknown): string {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    const date = (value as { toDate: () => Date }).toDate();
    return date.toLocaleString();
  }
  return "";
}

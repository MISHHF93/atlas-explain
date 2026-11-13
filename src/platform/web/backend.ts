import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth, signInAnonymously } from "firebase/auth";
import type { AccountView } from "../../core/account";
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
import { SETTINGS_FETCH_TIMEOUT_MS } from "../../core/timeouts";
import { CloudRateLimited, localRateStore, peekCloudSlot, recordCloudCall } from "../../core/rate-limit";
import { CloudAllowanceUsed } from "../../core/billing";
import { type PriceFeedOptions, priceFeedFromRemoteValues } from "../../core/price-feed";
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

export interface UserPrefs {
  theme: "system" | "light" | "dark";
}

export interface WebBackend {
  loadSettings(): Promise<{ settings: AppSettings; warnings: string[]; priceFeed: PriceFeedOptions }>;
  explain(
    card: MoveCard,
    question: string,
    hooks?: { onProgress?: (message: string) => void },
  ): Promise<ExplanationRun>;
  currentUserId(): Promise<string | null>;
  save(run: ExplanationRun, card: MoveCard, question: string): Promise<void>;
  list(): Promise<HistoryEntry[]>;
  loadBilling(): Promise<BillingSnapshot>;
  /** Calls back with the current account now and on every change. Returns an unsubscribe. */
  watchAccount(onChange: (view: AccountView | null) => void): Promise<() => void>;
  signInWithGoogle(): Promise<"signed-in" | "redirecting">;
  sendEmailLink(email: string): Promise<void>;
  /** Finishes a Google redirect or an email link that returned to this page. */
  completeSignIn(askEmail: () => string | null): Promise<string | null>;
  signOut(): Promise<void>;
  loadPrefs(): Promise<UserPrefs | null>;
  savePrefs(prefs: UserPrefs): Promise<void>;
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
  // A slow network must not hold the first explanation hostage; defaults stay active.
  remoteConfig.settings.fetchTimeoutMillis = SETTINGS_FETCH_TIMEOUT_MS;
  remoteConfig.defaultConfig = { ...remoteConfigDefaults() };

  const explainer = lazyExplainer(app);
  const payments = lazyPayments(async () => (await store()).db);

  // Signed-out visitors get an anonymous id; a signed-in account is never replaced by one.
  let anonymous: Promise<string | null> | null = null;
  const currentUserId = async (): Promise<string | null> => {
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
  const accountFlows = () => import("./account");

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
    const parsed = parseRemoteSettings(values);
    return { ...parsed, priceFeed: priceFeedFromRemoteValues(values) };
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
    async watchAccount(onChange) {
      const { watchAccount } = await accountFlows();
      return watchAccount(auth, onChange);
    },
    async signInWithGoogle() {
      await currentUserId();
      return (await accountFlows()).signInWithGoogle(auth);
    },
    async sendEmailLink(email) {
      await currentUserId();
      const url = `${window.location.origin}/signin?signin=email`;
      return (await accountFlows()).sendEmailLink(auth, email, url);
    },
    async completeSignIn(askEmail) {
      await auth.authStateReady();
      return (await accountFlows()).completePendingSignIn(auth, window.location.href, askEmail);
    },
    async signOut() {
      return (await accountFlows()).signOutToAnonymous(auth);
    },
    async loadPrefs() {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) return null;
      return (await store()).readPrefs(user.uid);
    },
    async savePrefs(prefs) {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) return;
      await (await store()).writePrefs(user.uid, prefs);
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
      const rate = peekCloudSlot(localRateStore());
      const allowByPlan = uid
        ? allowCloudCall({
            billingEnabled: settings.billingEnabled,
            plan,
            freeCloudDailyLimit: settings.freeCloudDailyLimit,
            cloudCallsToday,
          })
        : !settings.billingEnabled;
      const allowCloud = allowByPlan && rate.ok;
      hooks?.onProgress?.("Sending the move card through Firebase AI Logic…");
      try {
        return await runExplanation({
          card,
          question,
          settings,
          explainer,
          meter: {
            allowCloud,
            onCloudInference: async () => {
              recordCloudCall(localRateStore());
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
      } catch (error) {
        // A blocked cloud path caused by the browser safety limit gets its own message, not the plan one.
        if (error instanceof CloudAllowanceUsed && allowByPlan && !rate.ok) throw new CloudRateLimited(rate.reason);
        throw error;
      }
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

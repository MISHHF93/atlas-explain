import type { AccountView, SignInOutcome } from "../../core/account";
import {
  WatchlistAllowance,
  billingSnapshot,
  resolveEntitlements,
  watchlistFits,
  type BillingSnapshot,
  type PlanId,
  type ProInterval,
} from "../../core/billing";
import { publicMoveCard } from "../../core/move-card";
import { runExplanation } from "../../core/run-explanation";
import { CloudRateLimited } from "../../core/rate-limit";
import { CloudAllowanceUsed } from "../../core/billing";
import { type PriceFeedOptions, priceFeedFromRemoteValues } from "../../core/price-feed";
import { parseRemoteSettings } from "../../core/settings";
import type { AnalyticsSink } from "../../core/analytics";
import type { AppSettings, ExplanationRun, InferenceSourceName, MoveCard } from "../../core/types";
import { buildExplainPrompt, toPageContext } from "../../core/explain-prompt";
import { parseTwoSided, type TwoSided } from "../../core/two-sided";
import type { PublicEnvConfig } from "./env";
import { createExplainService, createUserId, readRemoteValues, startFirebase } from "./explain-service";
import { lazyExplainer } from "./lazy";
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

/** An answer to pasted or typed text (the web app's Explain loop). */
export interface TextRun {
  /** Null when the model did not return the two-sided shape; `plain` then holds its text. */
  answer: TwoSided | null;
  plain: string;
  inferenceSource: InferenceSourceName;
  cloudModel: string;
  /** True when the cloud was off limits (rate or plan) and only on-device was tried. */
  cloudBlocked: boolean;
  refusedRecommendation: boolean;
}

export interface WebBackend {
  /** Explains a term, sentence or headline the visitor pasted or typed. Hybrid: on-device first. */
  explainText(text: string, question: string, hooks?: { onProgress?: (message: string) => void }): Promise<TextRun>;
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
  /**
   * Finishes a Google redirect or an email link that returned to this page. When the result
   * is "need-email" (link opened on another device), call again with the address the visitor types.
   */
  completeSignIn(typedEmail?: string): Promise<SignInOutcome>;
  signOut(): Promise<void>;
  loadPrefs(): Promise<UserPrefs | null>;
  savePrefs(prefs: UserPrefs): Promise<void>;
  /** The signed-in account's watchlist, or null when signed out (anonymous counts as signed out). */
  loadWatchlist(): Promise<string[] | null>;
  saveWatchlist(ids: string[]): Promise<void>;
  /** The account's own data for "Download my data"; null when signed out. */
  exportAccountData(): Promise<{ account: { uid: string; email: string | null; displayName: string | null; provider: string }; settings: { theme: string } | null; watchlist: string[]; savedExplanations: Array<Record<string, unknown>> } | null>;
  /** Deletes the account's data, then the sign-in account itself, then continues signed out. */
  deleteAccount(): Promise<{ status: "deleted" | "reauth-needed"; deleted: number; keptToday: boolean }>;
  /** Starts Firebase Analytics after consent; null when unsupported or blocked. Loaded on demand. */
  startAnalytics(): Promise<AnalyticsSink | null>;
  /** Opens the Stripe Payment Link for this account. Throws if billing is off, signed out, or the link is not set up. */
  startCheckout(interval: ProInterval): Promise<void>;
  /** Opens Stripe's customer portal, where a subscriber changes or cancels the plan. */
  openBillingPortal(): Promise<void>;
}

export function startWebBackend(env: PublicEnvConfig): WebBackend {
  // One back end: Firebase, settings, limits and the model call live in explain-service.ts.
  const { app, auth, remoteConfig } = startFirebase(env, { minimumFetchIntervalMillis: import.meta.env.DEV ? 0 : 60_000 });
  let storePromise: Promise<WebStore> | null = null;
  const store = () => (storePromise ??= import("./store").then((mod) => mod.openStore(app)));

  const explainer = lazyExplainer(app);
  // Signed-out visitors get an anonymous id; a signed-in account is never replaced by one.
  const currentUserId = createUserId(auth);
  const service = createExplainService({ explainer, db: async () => (await store()).db, userId: currentUserId });
  const accountFlows = () => import("./account");

  const loadSettings = async () => {
    const values = await readRemoteValues(remoteConfig);
    const parsed = parseRemoteSettings(values);
    return { ...parsed, priceFeed: priceFeedFromRemoteValues(values) };
  };

  const loadPlan = async (settings: AppSettings, uid: string | null): Promise<PlanId> => {
    if (!settings.billingEnabled || !uid) return "free";
    return store().then((s) => s.plan(uid)).catch(() => "free" as const);
  };

  /** Pro belongs to a real account, so a signed-out (anonymous) visitor has no checkout link. */
  const accountUid = (): string | null => (auth.currentUser && !auth.currentUser.isAnonymous ? auth.currentUser.uid : null);

  const loadBilling = async (): Promise<BillingSnapshot> => {
    const { settings } = await loadSettings();
    const uid = await currentUserId();
    const plan = await loadPlan(settings, uid);
    const cloudCallsToday = uid ? await store().then((s) => s.cloudCallsToday(uid)).catch(() => 0) : 0;
    return billingSnapshot({
      billingEnabled: settings.billingEnabled,
      plan,
      freeCloudDailyLimit: settings.freeCloudDailyLimit,
      proCloudDailyLimit: settings.proCloudDailyLimit,
      cloudCallsToday,
      links: settings,
      accountUid: accountUid(),
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
    async completeSignIn(typedEmail) {
      await auth.authStateReady();
      return (await accountFlows()).completePendingSignIn(auth, window.location.href, typedEmail);
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
    async loadWatchlist() {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) return null;
      return (await store()).readWatchlist(user.uid);
    },
    async saveWatchlist(ids) {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) return;
      await (await store()).writeWatchlist(user.uid, ids);
    },
    async startAnalytics() {
      try {
        const mod = await import("firebase/analytics");
        if (!(await mod.isSupported())) return null;
        mod.setConsent({ analytics_storage: "granted", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
        const analytics = mod.initializeAnalytics(app, { config: { allow_google_signals: false, allow_ad_personalization_signals: false, send_page_view: false } });
        return { log: (name, params) => mod.logEvent(analytics, name as string, params) };
      } catch {
        return null;
      }
    },
    async exportAccountData() {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) return null;
      const s = await store();
      const [settings, watchlist, savedExplanations] = await Promise.all([s.readPrefs(user.uid), s.readWatchlist(user.uid), s.allExplanations(user.uid)]);
      const provider = user.providerData[0]?.providerId === "google.com" ? "google" : "email link";
      return { account: { uid: user.uid, email: user.email, displayName: user.displayName, provider }, settings, watchlist, savedExplanations };
    },
    async deleteAccount() {
      const user = auth.currentUser;
      if (!user || user.isAnonymous) return { status: "deleted", deleted: 0, keptToday: false };
      const flows = await accountFlows();
      // Data first, while the user can still prove ownership to the rules; then the sign-in account.
      const result = await (await store()).deleteUserData(user.uid, Date.now());
      const status = await flows.deleteSignedInUser(auth);
      if (status === "deleted") await flows.signOutToAnonymous(auth);
      return { status, ...result };
    },
    async startCheckout(interval) {
      const snapshot = await loadBilling();
      if (!snapshot.billingEnabled) throw new Error("Payments are switched off.");
      if (!accountUid()) throw new Error("Sign in first, so Pro is added to your account.");
      const url = snapshot.checkout[interval];
      if (!url) throw new Error("Checkout isn't available right now. Nothing was charged.");
      window.location.assign(url);
    },
    async openBillingPortal() {
      const { portalUrl } = await loadBilling();
      if (!portalUrl) throw new Error("Plan management isn't available right now. Email support and we'll help.");
      window.location.assign(portalUrl);
    },
    async explainText(text, question, hooks) {
      const { settings } = await loadSettings();
      const context = toPageContext({ selection: text, title: "ATLAS Explain web app", url: window.location.origin });
      if (!context.selection) throw new Error("Paste or type something to explain first.");
      const built = buildExplainPrompt({ context, question });
      const gate = await service.cloudGate(settings);
      // With the cloud off limits, only the device is tried, so a limit can never spend a cloud call.
      const mode = gate.allowed ? settings.inferenceMode : "only_on_device";
      hooks?.onProgress?.(mode === "only_in_cloud" ? "Asking the cloud…" : "Trying your device first…");
      let result;
      try {
        result = await service.answerText(settings, {
          prompt: built.prompt,
          mode,
          gate,
          hooks: {
            onDeviceDownloadProgress(ratio) {
              hooks?.onProgress?.(`Downloading the on-device model… ${Math.round(ratio * 100)}%`);
            },
          },
        });
      } catch (error) {
        if (!gate.allowed && gate.allowByPlan) throw new CloudRateLimited(service.blockedMessage(gate));
        if (!gate.allowed) throw new CloudAllowanceUsed();
        throw error;
      }
      return {
        answer: parseTwoSided(result.rawText),
        plain: result.rawText.trim(),
        inferenceSource: result.inferenceSource,
        cloudModel: settings.cloudModel,
        cloudBlocked: !gate.allowed,
        refusedRecommendation: built.refusedRecommendation,
      };
    },
    async explain(card, question, hooks) {
      const { settings } = await loadSettings();
      const gate = await service.cloudGate(settings);
      const entitlements = resolveEntitlements({
        billingEnabled: settings.billingEnabled,
        plan: gate.plan,
        freeCloudDailyLimit: settings.freeCloudDailyLimit,
        proCloudDailyLimit: settings.proCloudDailyLimit,
      });
      if (!watchlistFits(card.watchlist.length, entitlements)) {
        const limit = entitlements.watchlistSize;
        throw new WatchlistAllowance(typeof limit === "number" ? limit : 0);
      }
      hooks?.onProgress?.("Working on it…");
      try {
        return await runExplanation({
          card,
          question,
          settings,
          explainer,
          meter: {
            allowCloud: gate.allowed,
            onCloudInference: () => service.recordCloudAnswer(settings, gate),
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
        if (error instanceof CloudAllowanceUsed && !gate.allowed && gate.allowByPlan) throw new CloudRateLimited(service.blockedMessage(gate));
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

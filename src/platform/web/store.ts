import type { FirebaseApp } from "firebase/app";
import {
  addDoc,
  collection,
  deleteDoc,
  writeBatch,
  getDoc,
  getDocs,
  doc,
  setDoc,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import { incrementCloudCalls, readCloudCallsToday, readPlan } from "./usage";
import type { PlanId } from "../../core/billing";
import { cleanIds } from "../../core/watchlist";
import { usageDeleteAllowed } from "../../core/account-data";

/**
 * Firestore is loaded on demand: the wallet shell, Remote Config and
 * anonymous sign-in do not need it, so first paint does not pay for it.
 */
export interface WebStore {
  readonly db: Firestore;
  plan(uid: string): Promise<PlanId>;
  cloudCallsToday(uid: string): Promise<number>;
  addCloudCall(uid: string): Promise<void>;
  addExplanation(uid: string, data: Record<string, unknown>): Promise<void>;
  recentExplanations(uid: string, max: number): Promise<Array<{ id: string; data: DocumentData }>>;
  readPrefs(uid: string): Promise<{ theme: "system" | "light" | "dark" } | null>;
  writePrefs(uid: string, prefs: { theme: "system" | "light" | "dark" }): Promise<void>;
  readWatchlist(uid: string): Promise<string[]>;
  writeWatchlist(uid: string, ids: string[]): Promise<void>;
  /** Every saved explanation, for "Download my data". */
  allExplanations(uid: string): Promise<Array<Record<string, unknown>>>;
  /** Deletes everything the rules let an owner delete. Returns what was removed and what was left. */
  deleteUserData(uid: string, nowMs: number): Promise<{ deleted: number; keptToday: boolean }>;
}

const THEMES = ["system", "light", "dark"] as const;

export function openStore(app: FirebaseApp): WebStore {
  const db = getFirestore(app);
  return {
    db,
    plan: (uid) => readPlan(db, uid),
    cloudCallsToday: (uid) => readCloudCallsToday(db, uid),
    addCloudCall: (uid) => incrementCloudCalls(db, uid),
    async addExplanation(uid, data) {
      await addDoc(collection(db, "users", uid, "explanations"), { createdAt: serverTimestamp(), ...data });
    },
    async recentExplanations(uid, max) {
      const snapshot = await getDocs(
        query(collection(db, "users", uid, "explanations"), orderBy("createdAt", "desc"), limit(max)),
      );
      return snapshot.docs.map((d) => ({ id: d.id, data: d.data() }));
    },
    async readPrefs(uid) {
      const snap = await getDoc(doc(db, "users", uid, "prefs", "app"));
      const theme = snap.exists() ? snap.data().theme : null;
      return THEMES.includes(theme) ? { theme } : null;
    },
    async writePrefs(uid, prefs) {
      await setDoc(doc(db, "users", uid, "prefs", "app"), { theme: prefs.theme, updatedAt: serverTimestamp() });
    },
    async readWatchlist(uid) {
      const snap = await getDoc(doc(db, "users", uid, "prefs", "watchlist"));
      return snap.exists() ? cleanIds(snap.data().ids) : [];
    },
    async writeWatchlist(uid, ids) {
      await setDoc(doc(db, "users", uid, "prefs", "watchlist"), { ids: cleanIds(ids), updatedAt: serverTimestamp() });
    },
    async allExplanations(uid) {
      const snapshot = await getDocs(query(collection(db, "users", uid, "explanations"), orderBy("createdAt", "desc")));
      return snapshot.docs.map((d) => {
        const data = d.data();
        const created = data.createdAt as { toDate?: () => Date } | undefined;
        return { id: d.id, ...data, createdAt: created?.toDate ? created.toDate().toISOString() : null };
      });
    },
    async deleteUserData(uid, nowMs) {
      let deleted = 0;
      // Saved explanations, in batches (Firestore allows up to 500 writes per batch).
      const explanations = await getDocs(collection(db, "users", uid, "explanations"));
      for (let i = 0; i < explanations.docs.length; i += 400) {
        const batch = writeBatch(db);
        for (const d of explanations.docs.slice(i, i + 400)) batch.delete(d.ref);
        await batch.commit();
      }
      deleted += explanations.size;
      for (const pref of ["app", "watchlist"]) {
        await deleteDoc(doc(db, "users", uid, "prefs", pref));
        deleted += 1;
      }
      // Usage counters: every past day. Today's stays (the rules refuse it on purpose).
      const usage = await getDocs(collection(db, "users", uid, "usage"));
      let keptToday = false;
      for (const d of usage.docs) {
        if (usageDeleteAllowed(d.id, nowMs)) {
          await deleteDoc(d.ref);
          deleted += 1;
        } else {
          keptToday = true;
        }
      }
      return { deleted, keptToday };
    },
  };
}

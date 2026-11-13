import type { FirebaseApp } from "firebase/app";
import {
  addDoc,
  collection,
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
import { incrementCloudCalls, readCloudCallsToday } from "./usage";

/**
 * Firestore is loaded on demand: the wallet shell, Remote Config and
 * anonymous sign-in do not need it, so first paint does not pay for it.
 */
export interface WebStore {
  readonly db: Firestore;
  cloudCallsToday(uid: string): Promise<number>;
  addCloudCall(uid: string): Promise<void>;
  addExplanation(uid: string, data: Record<string, unknown>): Promise<void>;
  recentExplanations(uid: string, max: number): Promise<Array<{ id: string; data: DocumentData }>>;
  readPrefs(uid: string): Promise<{ theme: "system" | "light" | "dark" } | null>;
  writePrefs(uid: string, prefs: { theme: "system" | "light" | "dark" }): Promise<void>;
}

const THEMES = ["system", "light", "dark"] as const;

export function openStore(app: FirebaseApp): WebStore {
  const db = getFirestore(app);
  return {
    db,
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
  };
}

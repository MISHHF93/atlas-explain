import { doc, getDoc, runTransaction, type Firestore } from "firebase/firestore";
import { usageDayId } from "../../core/billing";

export async function readCloudCallsToday(db: Firestore, uid: string, now = new Date()): Promise<number> {
  const snap = await getDoc(doc(db, "users", uid, "usage", usageDayId(now)));
  if (!snap.exists()) return 0;
  const value = snap.data().cloudCalls;
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 0;
}

/** Create the day's counter at 1, or add exactly 1. Rules reject any other write. */
export async function incrementCloudCalls(db: Firestore, uid: string, now = new Date()): Promise<void> {
  const day = usageDayId(now);
  const ref = doc(db, "users", uid, "usage", day);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      tx.set(ref, { cloudCalls: 1, date: day });
      return;
    }
    const current = snap.data().cloudCalls;
    const count = typeof current === "number" && Number.isInteger(current) ? current : 0;
    tx.update(ref, { cloudCalls: count + 1 });
  });
}

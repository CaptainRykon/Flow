// utils/points.ts
import { db } from "@/lib/firebase";
import { ref, get, update, set } from "firebase/database";

export async function getPoints(fid: string) {
    const userRef = ref(db, "users/" + fid + "/points");
    const snap = await get(userRef);

    if (!snap.exists()) {
        await set(userRef, { total: 0 });
        return 0;
    }

    return snap.val().total ?? 0;
}

export async function addPoints(fid: string, amount: number) {
    const userRef = ref(db, "users/" + fid + "/points");
    const snap = await get(userRef);

    let current = 0;
    if (snap.exists()) current = Number(snap.val().total) || 0;

    const updated = current + amount;

    await update(userRef, { total: updated });

    return updated;
}

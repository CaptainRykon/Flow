// src/utils/spins.ts
import { ref, get, update, set } from "firebase/database";
import { db } from "../lib/firebase";

export async function setSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid);
    await update(userRef, {
        dailyChancesLeft,
        lastResetTime
    });
}

export async function getSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);
    if (snapshot.exists()) return snapshot.val();
    return { dailyChancesLeft: 1, lastResetTime: new Date().toISOString() };
}

export async function saveSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    await set(userRef, { dailyChancesLeft, lastResetTime });
}

// ✅ New helper to update only the chance count
export async function updateDailyChances(fid: string, amount: number) {
    const userRef = ref(db, "users/" + fid);
    await update(userRef, {
        dailyChancesLeft: amount
    });
}

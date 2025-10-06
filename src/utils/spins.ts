// src/utils/spins.ts
import { ref, get, update } from "firebase/database";
import { db } from "../lib/firebase";

export async function setSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid);
    await update(userRef, {
        dailyChancesLeft,
        lastResetTime
    });
}

export async function getSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid);
    const snapshot = await get(userRef);
    if (snapshot.exists()) {
        const data = snapshot.val();
        return {
            dailyChancesLeft: data.dailyChancesLeft ?? 1,
            lastResetTime: data.lastResetTime ?? new Date().toISOString()
        };
    }
    return {
        dailyChancesLeft: 1,
        lastResetTime: new Date().toISOString()
    };
}

// ✅ New helper to update only the chance count
export async function updateDailyChances(fid: string, amount: number) {
    const userRef = ref(db, "users/" + fid);
    await update(userRef, {
        dailyChancesLeft: amount
    });
}

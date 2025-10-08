import { ref, get, update, set } from "firebase/database";
import { db } from "../lib/firebase";

/**
 * Create a new spin data entry ONLY for brand new players.
 */
export async function createNewSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const now = new Date().toISOString();
    await set(userRef, {
        dailyChancesLeft: 1,
        lastResetTime: now,
    });
    console.log(`🆕 Created new spin data for FID ${fid}`);
}

/**
 * Get spin data for an existing user.
 * Does NOT modify Firebase. Returns null if no record exists.
 */
export async function getSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        // ❌ Do NOT create anything here — return null instead
        console.log(`⚠️ No spin data found for FID ${fid}`);
        return null;
    }

    const data = snapshot.val();
    const dailyChancesLeft = Math.max(0, data.dailyChancesLeft ?? 0);
    const lastResetTime = data.lastResetTime ?? new Date().toISOString();
    return { dailyChancesLeft, lastResetTime };
}

/**
 * Save both dailyChancesLeft + lastResetTime.
 * Called when player uses their LAST free spin.
 */
export async function setSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const safeChances = Math.max(0, dailyChancesLeft);
    await update(userRef, {
        dailyChancesLeft: safeChances,
        lastResetTime,
    });
    console.log(`💾 Updated spin data → chances=${safeChances}, reset=${lastResetTime}`);
}

/**
 * Update only the number of daily chances left (without touching lastResetTime).
 */
export async function updateDailyChances(fid: string, amount: number) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        console.warn(`⚠️ Tried to update dailyChances for missing FID ${fid}`);
        return;
    }

    const safeChances = Math.max(0, amount);
    await update(userRef, { dailyChancesLeft: safeChances });
    console.log(`🔁 Updated dailyChancesLeft → ${safeChances}`);
}

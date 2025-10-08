import { ref, get, set, update } from "firebase/database";
import { db } from "../lib/firebase";

/**
 * Create a new spin data entry only for brand new users.
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
 * Fetch existing spin data. Returns null if user not found.
 */
export async function getSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        console.log(`⚠️ No spin data found for FID ${fid}`);
        return null;
    }

    const data = snapshot.val();
    return {
        dailyChancesLeft: Math.max(0, data.dailyChancesLeft ?? 0),
        lastResetTime: data.lastResetTime ?? new Date().toISOString(),
    };
}

/**
 * Update Firebase only when spins reset (not when used up).
 */
export async function setSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    if (dailyChancesLeft <= 0) {
        console.log(`🛑 Not saving spin data with 0 spins — skip update.`);
        return;
    }

    const userRef = ref(db, "users/" + fid + "/spin");
    await update(userRef, {
        dailyChancesLeft,
        lastResetTime,
    });
    console.log(`💾 Updated spin data → chances=${dailyChancesLeft}, reset=${lastResetTime}`);
}

/**
 * Used when Unity resets spins after 24h countdown.
 */
export async function resetDailySpin(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const now = new Date().toISOString();
    await update(userRef, {
        dailyChancesLeft: 1,
        lastResetTime: now,
    });
    console.log(`🌅 Daily spin reset for FID ${fid}`);
}

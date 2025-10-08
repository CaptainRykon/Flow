import { ref, get, update, set } from "firebase/database";
import { db } from "../lib/firebase";

/**
 * Create a new spin record only when a new FID joins.
 */
export async function createNewSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const now = new Date().toISOString();
    await set(userRef, {
        dailyChancesLeft: 1,
        lastResetTime: now,
    });
    console.log(`🆕 Created spin data for new FID: ${fid}`);
}

/**
 * Fetch spin data for a user. Returns null if user has no record.
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
 * Update Firebase only when the player uses their last spin.
 */
export async function setSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const safeChances = Math.max(0, dailyChancesLeft);
    await update(userRef, {
        dailyChancesLeft: safeChances,
        lastResetTime,
    });
    console.log(`💾 Updated spin data (after final spin): chances=${safeChances}, reset=${lastResetTime}`);
}

/**
 * Only modify chances manually (does not touch lastResetTime).
 */
export async function updateDailyChances(fid: string, amount: number) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);
    if (!snapshot.exists()) return;

    const safeChances = Math.max(0, amount);
    await update(userRef, { dailyChancesLeft: safeChances });
    console.log(`🔁 Updated only dailyChancesLeft → ${safeChances}`);
}

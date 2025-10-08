import { ref, get, set, update } from "firebase/database";
import { db } from "../lib/firebase";

/**
 * Create a new spin data entry only for brand new players.
 * Called only when no data exists.
 */
export async function createNewSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const now = new Date().toISOString();
    await set(userRef, {
        dailyChancesLeft: 1,
        lastResetTime: now,
    });
    console.log(`🆕 Created new spin data for new FID: ${fid}`);
}

/**
 * Get spin data safely without modifying it.
 * Returns null if player has no record.
 */
export async function getSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        console.log(`⚠️ No spin data found for FID ${fid}`);
        return null; // React will handle creation
    }

    const data = snapshot.val();
    const dailyChancesLeft = Math.max(0, data.dailyChancesLeft ?? 0);
    const lastResetTime = data.lastResetTime ?? new Date().toISOString();
    return { dailyChancesLeft, lastResetTime };
}

/**
 * Save both dailyChancesLeft and lastResetTime — called manually by Unity.
 */
export async function setSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const safeChances = Math.max(0, dailyChancesLeft);

    await update(userRef, {
        dailyChancesLeft: safeChances,
        lastResetTime,
    });

    console.log(`💾 setSpinData → FID=${fid} chances=${safeChances}, lastResetTime=${lastResetTime}`);
}

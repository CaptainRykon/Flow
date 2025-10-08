import { ref, get, set, update } from "firebase/database";
import { db } from "../lib/firebase";

/**
 * Create a new spin data entry for *brand new* players.
 * Starts with 0 spins — countdown begins immediately.
 */
export async function createNewSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const now = new Date().toISOString();
    await set(userRef, {
        dailyChancesLeft: 0,
        lastResetTime: now,
    });
    console.log(`🆕 Created new spin data for FID ${fid} → starts with 0 spins.`);
}

/**
 * Get spin data safely without modifying Firebase.
 */
export async function getSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        // Brand-new user: start from 0, do not assign 1
        const now = new Date().toISOString();
        await set(userRef, { dailyChancesLeft: 0, lastResetTime: now });
        console.log(`🆕 New user ${fid} created with 0 spins.`);
        return { dailyChancesLeft: 0, lastResetTime: now };
    }

    const data = snapshot.val();
    return {
        dailyChancesLeft: Math.max(0, data.dailyChancesLeft ?? 0),
        lastResetTime: data.lastResetTime ?? new Date().toISOString(),
    };
}


/**
 * Save updated spin data (called by Unity only when necessary).
 */
export async function setSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const safeChances = Math.max(0, dailyChancesLeft);

    await update(userRef, {
        dailyChancesLeft: safeChances,
        lastResetTime,
    });

    console.log(`💾 Saved spin data → FID=${fid}, chances=${safeChances}, reset=${lastResetTime}`);
}

import { ref, get, set, update } from "firebase/database";
import { db } from "../lib/firebase";

/**
 * Get spin data safely without modifying lastResetTime
 */
export async function getSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);

    // Create default entry only if user truly doesn't exist
    if (!snapshot.exists()) {
        const now = new Date().toISOString(); // UTC ISO
        await set(userRef, { dailyChancesLeft: 0, lastResetTime: now });
        console.log(`🆕 New user ${fid} created with 0 spins.`);
        return { dailyChancesLeft: 0, lastResetTime: now };
    }

    const data = snapshot.val();

    // ✅ Preserve original string exactly as stored in Firebase
    const storedTime = typeof data.lastResetTime === "string"
        ? data.lastResetTime
        : new Date().toISOString();

    return {
        dailyChancesLeft: Math.max(0, data.dailyChancesLeft ?? 0),
        lastResetTime: storedTime,
    };
}

/**
 * Save updated spin data (only called when last spin used or daily reset)
 */
export async function setSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const safeChances = Math.max(0, dailyChancesLeft);

    // ✅ Only write the given time string, do not alter it
    await update(userRef, {
        dailyChancesLeft: safeChances,
        lastResetTime,
    });

    console.log(`💾 Saved spin data → FID=${fid}, chances=${safeChances}, reset=${lastResetTime}`);
}

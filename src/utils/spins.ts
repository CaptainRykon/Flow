import { ref, get, set, update } from "firebase/database";
import { db } from "../lib/firebase";

/**
 * Get spin data safely without resetting Firebase.
 */
export async function getSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        // Only create once for brand new players
        const now = new Date().toISOString(); // UTC
        await set(userRef, { dailyChancesLeft: 0, lastResetTime: now });
        console.log(`🆕 New user ${fid} created with 0 spins.`);
        return { dailyChancesLeft: 0, lastResetTime: now };
    }

    const data = snapshot.val();

    // ✅ Always treat lastResetTime as UTC ISO string
    const storedTime = data.lastResetTime
        ? new Date(data.lastResetTime).toISOString()
        : new Date().toISOString();

    return {
        dailyChancesLeft: Math.max(0, data.dailyChancesLeft ?? 0),
        lastResetTime: storedTime,
    };
}

/**
 * Save updated spin data
 */
export async function setSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const safeChances = Math.max(0, dailyChancesLeft);

    // Force UTC time string
    const safeReset = new Date(lastResetTime).toISOString();

    await update(userRef, {
        dailyChancesLeft: safeChances,
        lastResetTime: safeReset,
    });

    console.log(`💾 Saved spin data → FID=${fid}, chances=${safeChances}, reset=${safeReset}`);
}

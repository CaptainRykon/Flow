import { ref, get, update, set } from "firebase/database";
import { db } from "../lib/firebase";

/**
 * Create a new spin data entry ONLY for brand new players.
 * Used when player opens game for the first time and no record exists.
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
 * Save both dailyChancesLeft + lastResetTime.
 * Called when player uses their LAST free spin.
 */
export async function setSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    // ✅ Never let dailyChancesLeft go negative
    const safeChances = Math.max(0, dailyChancesLeft);
    await update(userRef, {
        dailyChancesLeft: safeChances,
        lastResetTime,
    });
    console.log(`💾 Updated spin data → chances=${safeChances}, reset=${lastResetTime}`);
}

/**
 * Get spin data for a user.
 * If user is new (no data found), create an initial record.
 */
export async function getSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);

    if (snapshot.exists()) {
        const data = snapshot.val();
        // ✅ Ensure valid safe data
        const dailyChancesLeft = Math.max(0, data.dailyChancesLeft ?? 1);
        const lastResetTime = data.lastResetTime ?? new Date().toISOString();
        return { dailyChancesLeft, lastResetTime };
    }

    // 🆕 If user doesn't exist, create one fresh entry
    await createNewSpinData(fid);
    return { dailyChancesLeft: 1, lastResetTime: new Date().toISOString() };
}

/**
 * Save spin data (both values), used for forced overwrite from Unity.
 * Similar to setSpinData but without validation logic.
 */
export async function saveSpinData(fid: string, dailyChancesLeft: number, lastResetTime: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const safeChances = Math.max(0, dailyChancesLeft);
    await set(userRef, { dailyChancesLeft: safeChances, lastResetTime });
    console.log(`💾 Force saved spin data for FID ${fid}`);
}

/**
 * Update only the number of daily chances left.
 * Does NOT modify lastResetTime.
 */
export async function updateDailyChances(fid: string, amount: number) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        // 🆕 Create record if missing
        await createNewSpinData(fid);
        return;
    }

    //const data = snapshot.val();
    const safeChances = Math.max(0, amount);

    await update(userRef, { dailyChancesLeft: safeChances });
    console.log(`🔁 Updated dailyChancesLeft → ${safeChances}`);
}

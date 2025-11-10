import { ref, get, set, update } from "firebase/database";
import { db } from "../lib/firebase";

/**
 * Get spin data safely without modifying or resetting.
 */
export async function getSpinData(fid: string) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        const now = new Date().toISOString();
        await set(userRef, { dailyChancesLeft: 0, lastResetTime: now });
        console.log(`🆕 New user ${fid} created with 0 spins.`);
        return { dailyChancesLeft: 0, lastResetTime: now };
    }

    const data = snapshot.val();
    const storedTime =
        typeof data.lastResetTime === "string" && data.lastResetTime.trim() !== ""
            ? data.lastResetTime
            : new Date().toISOString();

    return {
        dailyChancesLeft: Math.max(0, data.dailyChancesLeft ?? 0),
        lastResetTime: storedTime,
    };
}

/**
 * Only save spin data when it *actually changes*.
 */
export async function setSpinData(
    fid: string,
    dailyChancesLeft: number,
    lastResetTime: string
) {
    const userRef = ref(db, "users/" + fid + "/spin");
    const snapshot = await get(userRef);
    const prev = snapshot.exists() ? snapshot.val() : {};

    // 🧠 Prevent overwriting lastResetTime unless spins reached 0 or reset
    if (
        prev.lastResetTime === lastResetTime &&
        prev.dailyChancesLeft === dailyChancesLeft
    ) {
        console.log("⚠️ Skipping redundant save — no change detected.");
        return;
    }

    await update(userRef, {
        dailyChancesLeft: Math.max(0, dailyChancesLeft),
        lastResetTime,
    });

    console.log(`💾 Saved spin data → ${fid} | spins=${dailyChancesLeft}, reset=${lastResetTime}`);
}

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




    export async function setSpinData(
        fid: string,
        dailyChancesLeft: number,
        lastResetTime: string
    ) {
        const userRef = ref(db, "users/" + fid + "/spin");
        const snapshot = await get(userRef);
        const prev = snapshot.exists() ? snapshot.val() : {};

        // 🧠 Block if the new timestamp is newer by < 10 minutes (prevents reopen overwrite)
        if (
            prev.lastResetTime &&
            new Date(lastResetTime).getTime() - new Date(prev.lastResetTime).getTime() < 10 * 60 * 1000 &&
            dailyChancesLeft === prev.dailyChancesLeft
        ) {
            console.log("🚫 Firebase blocked redundant or premature update of lastResetTime.");
            return;
        }

        await update(userRef, {
            dailyChancesLeft: Math.max(0, dailyChancesLeft),
            lastResetTime,
        });

        console.log(`💾 Firebase Saved spin data → ${fid} | spins=${dailyChancesLeft}, reset=${lastResetTime}`);
    }



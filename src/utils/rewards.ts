// src/utils/rewards.ts
import { ref, get, set, update } from "firebase/database";
import { db } from "../lib/firebase";

/**
 * Get reward data for a player
 */
export async function getDailyRewardData(fid: string) {
    const userRef = ref(db, `users/${fid}/dailyReward`);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        console.log("🆕 Creating new daily reward entry for", fid);
        const defaultData = {
            lastClaimTime: new Date().toISOString(),
            claimedToday: false,
        };
        await set(userRef, defaultData);
        return defaultData;
    }

    return snapshot.val();
}

/**
 * Save the claim time to Firebase when player collects daily reward
 */
export async function saveDailyRewardClaim(fid: string) {
    const userRef = ref(db, `users/${fid}/dailyReward`);
    const now = new Date().toISOString();

    await update(userRef, {
        lastClaimTime: now,
        claimedToday: true,
    });

    console.log("💾 Saved daily reward claim:", fid, now);
}

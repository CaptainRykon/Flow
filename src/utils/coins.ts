// src/utils/coins.ts
import { ref, set, get, update } from "firebase/database";
import { db } from "../lib/firebase";

/** Overwrite coins for a user */
export async function setCoins(fid: string, coins: number) {
    await set(ref(db, "users/" + fid), { coins });
}

/** Add coins (increment) */
export async function addCoins(fid: string, amount: number): Promise<number> {
    const userRef = ref(db, "users/" + fid);
    const snapshot = await get(userRef);

    let current = 0;
    if (snapshot.exists()) current = snapshot.val().coins || 0;

    const newTotal = current + amount;
    await update(userRef, { coins: newTotal });

    return newTotal;
}

/** Subtract coins (decrement if enough balance) */
export async function subtractCoins(fid: string, amount: number): Promise<number | null> {
    const userRef = ref(db, "users/" + fid);
    const snapshot = await get(userRef);

    let current = 0;
    if (snapshot.exists()) current = snapshot.val().coins || 0;
    if (current < amount) return null;

    const newTotal = current - amount;
    await update(userRef, { coins: newTotal });
    return newTotal;
}

/** Get coins (auto-create user with 100 if not exist) */
export async function getCoins(fid: string): Promise<number> {
    const userRef = ref(db, "users/" + fid);
    const snapshot = await get(userRef);

    if (!snapshot.exists()) {
        await set(userRef, { coins: 100, lastClaim: 0 }); // add lastClaim field
        return 100;
    }

    return snapshot.val().coins || 0;
}

/** Claim daily reward */
export async function claimDaily(fid: string): Promise<{ success: boolean; coins: number; message?: string }> {
    const userRef = ref(db, "users/" + fid);
    const snapshot = await get(userRef);
    const now = Date.now();

    let coins = 0;
    let lastClaim = 0;

    if (snapshot.exists()) {
        coins = snapshot.val().coins || 0;
        lastClaim = snapshot.val().lastClaim || 0;
    }

    if (now - lastClaim < 86400000) {
        return { success: false, coins, message: "Already claimed today" };
    }

    const reward = 50;
    const newTotal = coins + reward;

    await update(userRef, { coins: newTotal, lastClaim: now });

    return { success: true, coins: newTotal };
}

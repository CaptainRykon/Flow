// src/utils/passes.ts
import { ref, get, set, update } from "firebase/database";
import { db } from "../lib/firebase";

export type UserPass = {
    passType: "Free" | "Weekly" | "Monthly";
    expiry: string; // ISO string
};

// 🔹 Get the user’s current pass
export async function getPassData(fid: string): Promise<UserPass> {
    const snapshot = await get(ref(db, `passes/${fid}`));
    if (!snapshot.exists()) {
        console.log("🆕 New user, setting default Free pass");
        const defaultPass: UserPass = {
            passType: "Free",
            expiry: new Date(0).toISOString(),
        };
        await set(ref(db, `passes/${fid}`), defaultPass);
        return defaultPass;
    }
    return snapshot.val();
}

// 🔹 Save / update user’s pass
export async function savePassData(fid: string, passType: string, expiry: string) {
    await update(ref(db, `passes/${fid}`), { passType, expiry });
    console.log(`💾 Firebase: Saved ${passType} pass for ${fid}, expires ${expiry}`);
}

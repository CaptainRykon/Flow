import { db } from "@/lib/firebase";
import { ref, get, set, update } from "firebase/database";

export async function getGameLevel(fid: string, gameId: string) {
    const userRef = ref(db, `users/${fid}/gameProgress/${gameId}`);
    const snap = await get(userRef);

    if (!snap.exists()) {
        const defaultData = { level: 1, timestamp: new Date().toISOString() };
        await set(userRef, defaultData);   // <------- IMPORTANT
        return defaultData;
    }
    return snap.val();
}

export async function saveGameLevel(fid: string, gameId: string, level: number) {
    const userRef = ref(db, `users/${fid}/gameProgress/${gameId}`);
    await update(userRef, {
        level,
        timestamp: new Date().toISOString()
    });
}

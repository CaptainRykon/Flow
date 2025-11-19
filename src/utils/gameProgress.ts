import { db } from "@/lib/firebase";
import { ref, get, update } from "firebase/database";

export async function getGameLevel(fid: string, gameId: string) {
    const userRef = ref(db, `users/${fid}/gameProgress/${gameId}`);
    const snap = await get(userRef);

    if (!snap.exists()) {
        return { level: 1 };
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

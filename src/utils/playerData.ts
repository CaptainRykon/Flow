import { ref, get,set } from "firebase/database";
import { db } from "../lib/firebase";


export interface PlayerData {
    TotalLevelCrossed: Record<number, string>;
    LEVELUNLOCKED: Record<number, number>;
    NumberOfHints: number;
    CurrentLevel: number;
    // Add more fields here if needed
}

export async function setPlayerData(fid: string, data: PlayerData) {
    const userRef = ref(db, "playerdata/" + fid);
    await set(userRef, data);   // ✔ Overwrites or creates if missing
}

export async function getPlayerData(fid: string) {
    const userRef = ref(db, "playerdata/" + fid);
    const snapshot = await get(userRef);

    if (snapshot.exists()) return snapshot.val();

    // Return default if new player
    return {
        TotalLevelCrossed: {
            1: "0", 2: "0", 3: "0", 4: "0",
            5: "0", 6: "0", 7: "0", 8: "0",
            9: "0", 10: "0"
        },
        LEVELUNLOCKED: {
            1: 0, 2: 0, 3: 0, 4: 0, 5: 0,
            6: 0, 7: 0, 8: 0, 9: 0, 10: 0
        },
        NumberOfHints: 10,
        CurrentLevel: 1
    };
}

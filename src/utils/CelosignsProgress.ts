// utils/CeloSignsProgress.ts
import { db } from "@/lib/firebase";
import { ref, get, set, update } from "firebase/database";

/* ----------- DATA MODEL (matches Unity C# exactly) ----------- */
export interface CeloSignsProgress {
    currentLevel: number;
    numberOfHints: number;
    totalLevelCrossed: Record<string, string>;  // "1": "0,1,2"
    levelUnlocked: Record<string, number>;      // "1": 1
    lastUpdated?: string;
}

const DEFAULT_WORLD_COUNT = 10;

/* ----------- Helpers ----------- */
function makeDefaultTotalLevelCrossed(): Record<string, string> {
    const obj: Record<string, string> = {};
    for (let i = 1; i <= DEFAULT_WORLD_COUNT; i++) obj[String(i)] = "0";
    return obj;
}

function makeDefaultLevelUnlocked(): Record<string, number> {
    const obj: Record<string, number> = {};
    for (let i = 1; i <= DEFAULT_WORLD_COUNT; i++) obj[String(i)] = 0;
    return obj;
}

/* ----------- LOAD FROM FIREBASE ----------- */
export async function getCeloSignsProgress(fid: string): Promise<CeloSignsProgress> {
    const userRef = ref(db, `users/${fid}/gameProgress/celosigns`);
    const snap = await get(userRef);

    if (!snap.exists()) {
        const def: CeloSignsProgress = {
            currentLevel: 1,
            numberOfHints: 10,
            totalLevelCrossed: makeDefaultTotalLevelCrossed(),
            levelUnlocked: makeDefaultLevelUnlocked(),
            lastUpdated: new Date().toISOString(),
        };

        await set(userRef, def);
        return def;
    }

    const val = snap.val();

    return {
        currentLevel: val.currentLevel ?? 1,
        numberOfHints: val.numberOfHints ?? 10,
        totalLevelCrossed: val.totalLevelCrossed ?? makeDefaultTotalLevelCrossed(),
        levelUnlocked: val.levelUnlocked ?? makeDefaultLevelUnlocked(),
        lastUpdated: val.lastUpdated ?? new Date().toISOString(),
    };
}

/* ----------- SAVE TO FIREBASE ----------- */
export async function saveCeloSignsProgress(fid: string, data: CeloSignsProgress) {
    const userRef = ref(db, `users/${fid}/gameProgress/celosigns`);

    await update(userRef, {
        ...data,
        lastUpdated: new Date().toISOString(),
    });
}

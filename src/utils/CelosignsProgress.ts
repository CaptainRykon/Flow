// utils/CelosignsProgress.ts
import { db } from "@/lib/firebase";
import { ref, get, set, update } from "firebase/database";

export interface CeloSignsProgress {
    currentLevel: number;
    totalLevelCrossed: Record<string, string>; // e.g. { "1":"0,1,2", "2":"0" }
    levelUnlocked: Record<string, number>;     // e.g. { "1":1, "2":0 }
    numberOfHints: number;
    lastUpdated?: string;
}

const DEFAULT_WORLD_COUNT = 10;

function makeDefaultTotalLevelCrossed(): Record<string, string> {
    const r: Record<string, string> = {};
    for (let i = 1; i <= DEFAULT_WORLD_COUNT; i++) r[String(i)] = "0";
    return r;
}
function makeDefaultLevelUnlocked(): Record<string, number> {
    const r: Record<string, number> = {};
    for (let i = 1; i <= DEFAULT_WORLD_COUNT; i++) r[String(i)] = 0;
    return r;
}

export async function getCeloSignsProgress(fid: string): Promise<CeloSignsProgress> {
    const userRef = ref(db, `users/${fid}/gameProgress/celosigns`);
    const snap = await get(userRef);

    if (!snap.exists()) {
        const defaultData: CeloSignsProgress = {
            currentLevel: 1,
            totalLevelCrossed: makeDefaultTotalLevelCrossed(),
            levelUnlocked: makeDefaultLevelUnlocked(),
            numberOfHints: 10,
            lastUpdated: new Date().toISOString(),
        };
        await set(userRef, defaultData);
        return defaultData;
    }

    // Ensure shape correctness and fallbacks
    const val = snap.val();
    return {
        currentLevel: val.currentLevel ?? 1,
        totalLevelCrossed: val.totalLevelCrossed ?? makeDefaultTotalLevelCrossed(),
        levelUnlocked: val.levelUnlocked ?? makeDefaultLevelUnlocked(),
        numberOfHints: val.numberOfHints ?? 10,
        lastUpdated: val.lastUpdated ?? new Date().toISOString(),
    } as CeloSignsProgress;
}

export async function saveCeloSignsProgress(fid: string, data: CeloSignsProgress) {
    const userRef = ref(db, `users/${fid}/gameProgress/celosigns`);
    await update(userRef, {
        ...data,
        lastUpdated: new Date().toISOString(),
    });
}

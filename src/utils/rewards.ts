import { db } from "@/lib/firebase";
import { ref, get, set } from "firebase/database";

export async function getPoints(fid: string) {
    const userRef = ref(db, "users/" + fid + "/points");
    const snap = await get(userRef);

    if (!snap.exists()) {
        await set(userRef, { total: 0 });
        return 0;
    }

    return snap.val().total ?? 0;
}

export async function savePoints(fid: string, total: number) {
    const userRef = ref(db, "users/" + fid + "/points");
    await set(userRef, { total });
    return total;
}

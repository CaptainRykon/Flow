// src/utils/coins.ts
import { ref, set, get, update } from "firebase/database";
import { db } from "../lib/firebase";

// Save coins for a user (overwrite)
export async function setCoins(fid: string, coins: number) {
  await set(ref(db, "users/" + fid), {
    coins: coins
  });
}

// Add coins (increment)
export async function addCoins(fid: string, amount: number) {
  const userRef = ref(db, "users/" + fid);
  const snapshot = await get(userRef);
  let current = 0;
  if (snapshot.exists()) {
    current = snapshot.val().coins || 0;
  }
  await update(userRef, {
    coins: current + amount
  });
}

// Subtract coins (only if enough balance)
export async function subtractCoins(fid: string, amount: number): Promise<boolean> {
  const userRef = ref(db, "users/" + fid);
  const snapshot = await get(userRef);
  let current = 0;

  if (snapshot.exists()) {
    current = snapshot.val().coins || 0;
  }

  if (current < amount) {
    // Not enough coins
    return false;
  }

  await update(userRef, {
    coins: current - amount
  });

  return true; // Successfully subtracted
}

// Get coins
export async function getCoins(fid: string): Promise<number> {
  const snapshot = await get(ref(db, "users/" + fid));
  return snapshot.exists() ? snapshot.val().coins : 0;
}

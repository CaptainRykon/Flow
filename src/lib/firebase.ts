// src/lib/firebase.ts
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database"; // ✅ For Realtime DB

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBrn0OZiqKwQZy5rgSf4533zOBFq6Zg6YQ",
  authDomain: "flow-ea22e.firebaseapp.com",
  databaseURL: "https://flow-ea22e-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "flow-ea22e",
  storageBucket: "flow-ea22e.firebasestorage.app",
  messagingSenderId: "402723284558",
  appId: "1:402723284558:web:fbc54eada0713dfaf8c51f",
  measurementId: "G-QT78EN2X8B"
};

// Initialize Firebase once
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export { db };

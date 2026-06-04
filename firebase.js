import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey:            "AIzaSyDGGE_xEkZ15jSDhtnBUXPtzk_tYSg5WKY",
  authDomain:        "ccl-payroll.firebaseapp.com",
  projectId:         "ccl-payroll",
  storageBucket:     "ccl-payroll.firebasestorage.app",
  messagingSenderId: "956311516629",
  appId:             "1:956311516629:web:1eeb2a7232c3abb2b9795c",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyB73HAl7CIIZnGq6DkZRd4EEjfAoUBUoXw",
  authDomain: "sweatsquad-85edf.firebaseapp.com",
  databaseURL: "https://sweatsquad-85edf-default-rtdb.firebaseio.com",
  projectId: "sweatsquad-85edf",
  storageBucket: "sweatsquad-85edf.firebasestorage.app",
  messagingSenderId: "627088688122",
  appId: "1:627088688122:web:171c72ca6e512beed5da43",
  measurementId: "G-4ERMPVDYZ3"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const messaging = getMessaging(app);

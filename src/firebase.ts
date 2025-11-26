// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDcRNuLn1lG0FZUe7FWCF3DT_CTTWNGFnk",
  authDomain: "cpc357-6876b.firebaseapp.com",
  projectId: "cpc357-6876b",
  storageBucket: "cpc357-6876b.firebasestorage.app",
  messagingSenderId: "908692786546",
  appId: "1:908692786546:web:bf5763121f69cc6944a1eb",
  measurementId: "G-RMPRX0JYTM"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

export { app, db };

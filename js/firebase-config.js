import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyAlgQ4htdFcMyhM4oYmaY8rDG1moJj-sqo",
    authDomain: "tidal-anvil-479603-f1.firebaseapp.com",
    projectId: "tidal-anvil-479603-f1",
    storageBucket: "tidal-anvil-479603-f1.firebasestorage.app",
    messagingSenderId: "300721818638",
    appId: "1:300721818638:web:bac88aca593e21950c005f",
    measurementId: "G-WZ86FN4DH6"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

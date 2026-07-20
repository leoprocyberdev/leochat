import { auth, db } from './firebase-config.js';
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    updateProfile, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const subTitle = document.getElementById('subTitle');
const authForm = document.getElementById('authForm');
const usernameFieldGroup = document.getElementById('usernameFieldGroup');
const usernameInput = document.getElementById('usernameInput');
const emailInput = document.getElementById('emailInput');
const passwordInput = document.getElementById('passwordInput');
const submitBtn = document.getElementById('submitBtn');
const toggleText = document.getElementById('toggleText');
const toggleLink = document.getElementById('toggleLink');
const errorLog = document.getElementById('errorLog');

let isRegistering = false;
let isSubmittingForm = false; // NEW: Flag to prevent premature redirection

onAuthStateChanged(auth, (user) => {
    // ONLY auto-redirect if they load the page already logged in
    // DO NOT redirect if we are in the middle of submitting the form
    if (user && !isSubmittingForm) {
        window.location.href = 'dashboard.html';
    }
});

toggleLink.addEventListener('click', () => {
    isRegistering = !isRegistering;
    errorLog.style.display = "none";
    if (isRegistering) {
        subTitle.textContent = "Create an account to get started";
        usernameFieldGroup.classList.remove('hidden');
        usernameInput.required = true;
        submitBtn.textContent = "Sign Up";
        toggleText.textContent = "Already have an account?";
        toggleLink.textContent = "Login here";
    } else {
        subTitle.textContent = "Sign in to your account";
        usernameFieldGroup.classList.add('hidden');
        usernameInput.required = false;
        submitBtn.textContent = "Log In";
        toggleText.textContent = "Don't have an account?";
        toggleLink.textContent = "Register here";
    }
});

authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorLog.style.display = "none";
    
    // Lock the redirect listener
    isSubmittingForm = true; 
    
    console.log("Form submitted. Mode:", isRegistering ? "Register" : "Login");

    try {
        if (isRegistering) {
            console.log("Creating authentication account...");
            const res = await createUserWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
            
            console.log("Authentication successful. UID:", res.user.uid);
            console.log("Writing user document to Firestore...");

            await setDoc(doc(db, "users", res.user.uid), {
                username: usernameInput.value.trim(), 
                email: emailInput.value.trim(),
                status: "Hey there! I am using LeoChat.",
                createdAt: new Date().toISOString()
            });
            console.log("Firestore write completed successfully.");

            await updateProfile(res.user, { displayName: usernameInput.value.trim() });
        } else {
            await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
        }
        
        // Data is written safely. Now we manually redirect.
        window.location.href = 'dashboard.html';

    } catch (error) {
        console.error("Critical Error during signup:", error);
        errorLog.style.display = "block";
        errorLog.textContent = error.message;
        
        // Unlock the redirect listener if an error happens so they aren't stuck
        isSubmittingForm = false; 
    }
});

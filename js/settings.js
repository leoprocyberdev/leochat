import { auth, db } from './firebase-config.js';
import { uploadImageToImgBB } from './imgbb.js';
import { onAuthStateChanged, updateProfile } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const avatarDisplay = document.getElementById('avatarDisplay');
    const profileImageInput = document.getElementById('profileImageInput');

    // Click Avatar -> Open Image Picker
    if (avatarDisplay && profileImageInput) {
        avatarDisplay.addEventListener('click', () => profileImageInput.click());

        profileImageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                avatarDisplay.style.opacity = "0.5";

                const photoURL = await uploadImageToImgBB(file);
                const user = auth.currentUser;

                if (user) {
                    await updateDoc(doc(db, 'users', user.uid), { photoURL: photoURL });
                    await updateProfile(user, { photoURL: photoURL });
                    avatarDisplay.innerHTML = `<img src="${photoURL}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
                }
            } catch (err) {
                alert("Failed to update profile picture: " + err.message);
            } finally {
                avatarDisplay.style.opacity = "1";
            }
        });
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Step 1: Immediate instant UI render from Auth session
            applyAuthUserData(user);

            // Step 2: Fetch full profile details from Firestore database
            await loadUserProfile(user);
        } else {
            window.location.href = 'index.html';
        }
    });
});

// Immediate Auth Fallback (Prevents staying stuck on "Loading...")
function applyAuthUserData(user) {
    const displayNameEl = document.getElementById('displayName');
    const userHandleEl = document.getElementById('userHandle');
    const avatarEl = document.getElementById('avatarDisplay');

    const fallbackName = user.displayName || (user.email ? user.email.split('@')[0] : "User");
    
    if (displayNameEl && displayNameEl.textContent === 'Loading...') {
        displayNameEl.textContent = fallbackName;
    }
    if (userHandleEl && userHandleEl.textContent === '@loading') {
        userHandleEl.textContent = `@${fallbackName.toLowerCase().replace(/\s+/g, '')}`;
    }
    if (avatarEl && avatarEl.textContent === 'L' && !avatarEl.querySelector('img')) {
        avatarEl.textContent = fallbackName.charAt(0).toUpperCase();
    }
}

// Full Firestore Data Fetching
async function loadUserProfile(user) {
    const displayNameEl = document.getElementById('displayName');
    const userHandleEl = document.getElementById('userHandle');
    const avatarEl = document.getElementById('avatarDisplay');
    const statusBubbleEl = document.getElementById('userStatusBubble');

    try {
        const userDocRef = doc(db, 'users', user.uid);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Check all common name field variations
            const name = data.username || data.displayName || data.name || user.displayName || (user.email ? user.email.split('@')[0] : "User");
            const handle = data.handle || `@${name.toLowerCase().replace(/\s+/g, '')}`;

            if (displayNameEl) displayNameEl.textContent = name;
            if (userHandleEl) userHandleEl.textContent = handle.startsWith('@') ? handle : `@${handle}`;

            // Status Thought Bubble
            if (statusBubbleEl && data.status) {
                const span = statusBubbleEl.querySelector('span');
                if (span) span.textContent = data.status;
            }

            // Avatar / Profile Picture
            if (data.photoURL || user.photoURL) {
                const photo = data.photoURL || user.photoURL;
                if (avatarEl) {
                    avatarEl.innerHTML = `<img src="${photo}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
                }
            } else if (avatarEl) {
                avatarEl.textContent = name.charAt(0).toUpperCase();
            }
        }
    } catch (error) {
        console.error("Error fetching user settings profile:", error);
    }
}

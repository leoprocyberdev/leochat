import { db } from './firebase-config.js'; // Import shared db instance
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', async () => {
    const contactsContainer = document.getElementById('contactsContainer');
    const searchInput = document.getElementById('usernameSearchInput');
    const noResults = document.getElementById('noResultsMessage');
    const contactCountDisplay = document.getElementById('contactCount');

    let allContacts = []; 

    const avatarBackgrounds = ['bg-blue', 'bg-gray', 'bg-purple', 'bg-orange', 'bg-teal'];
    function getRandomBg() {
        return avatarBackgrounds[Math.floor(Math.random() * avatarBackgrounds.length)];
    }

    // 1. Setup Image Preview Modal
    const imageModal = document.createElement('div');
    imageModal.id = 'imagePreviewModal';
    imageModal.style.cssText = `
        display: none;
        position: fixed;
        z-index: 1000;
        top: 0; left: 0; width: 100%; height: 100%;
        background-color: rgba(0, 0, 0, 0.85);
        justify-content: center;
        align-items: center;
        cursor: pointer;
    `;
    imageModal.innerHTML = `
        <img id="modalImg" style="max-width: 90%; max-height: 80%; border-radius: 50%; object-fit: cover; box-shadow: 0 4px 15px rgba(0,0,0,0.5);" src="" alt="Profile View">
    `;
    document.body.appendChild(imageModal);

    imageModal.addEventListener('click', () => {
        imageModal.style.display = 'none';
    });

    const urlParams = new URLSearchParams(window.location.search);
    const passedQuery = urlParams.get('query');

    // 2. Fetch Users Collection using Modular Syntax
    try {
        const usersRef = collection(db, 'users');
        const querySnapshot = await getDocs(usersRef);
        
        if (contactsContainer) contactsContainer.innerHTML = ''; 
        allContacts = [];

        if (!querySnapshot.empty) {
            querySnapshot.forEach((doc) => {
                const userData = doc.data();
                
                allContacts.push({
                    id: doc.id,
                    username: userData.username || "Unknown User",
                    status: userData.status || "Hey there! I am using LeoChat.",
                    avatarLetter: (userData.username ? userData.username.charAt(0).toUpperCase() : "?"),
                    photoURL: userData.photoURL || userData.profilePic || null,
                    bgColor: getRandomBg()
                });
            });

            allContacts.sort((a, b) => a.username.localeCompare(b.username));

            if (passedQuery && searchInput) {
                searchInput.value = passedQuery;
                const filtered = allContacts.filter(contact => 
                    contact.username.toLowerCase().includes(passedQuery.toLowerCase())
                );
                renderContacts(filtered);
            } else {
                renderContacts(allContacts);
            }
        } else {
            if (contactCountDisplay) contactCountDisplay.textContent = "0 contacts";
            if (noResults) noResults.style.display = 'block';
        }
    } catch (error) {
        console.error("Firestore contacts retrieval failed: ", error);
        if (contactCountDisplay) contactCountDisplay.textContent = "Error loading contacts";
    }

    // 3. UI Rendering Loop with Tap-to-View Image Handler
    function renderContacts(contactsArray) {
        if (!contactsContainer) return;
        contactsContainer.innerHTML = '';
        
        if (contactsArray.length === 0) {
            if (noResults) noResults.style.display = 'block';
            if (contactCountDisplay) contactCountDisplay.textContent = "0 contacts";
            return;
        }

        if (noResults) noResults.style.display = 'none';
        if (contactCountDisplay) {
            contactCountDisplay.textContent = `${contactsArray.length} contact${contactsArray.length === 1 ? '' : 's'}`;
        }

        contactsArray.forEach(contact => {
            const contactItem = document.createElement('div');
            contactItem.className = 'chat-item';

            // Avatar / Profile Picture HTML
            let avatarElement;
            if (contact.photoURL) {
                avatarElement = document.createElement('img');
                avatarElement.src = contact.photoURL;
                avatarElement.alt = contact.username;
                avatarElement.className = 'avatar profile-clickable';
                avatarElement.style.cssText = 'object-fit: cover; cursor: pointer;';
                
                // Open image modal when tapping the profile icon
                avatarElement.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevents navigating to chat.html
                    document.getElementById('modalImg').src = contact.photoURL;
                    imageModal.style.display = 'flex';
                });
            } else {
                avatarElement = document.createElement('div');
                avatarElement.className = `avatar ${contact.bgColor}`;
                avatarElement.textContent = contact.avatarLetter;
            }

            // Info Section with Navigation Link to Chat
            const infoAnchor = document.createElement('a');
            infoAnchor.href = `chat.html?uid=${contact.id}&user=${encodeURIComponent(contact.username)}`;
            infoAnchor.className = 'chat-info';
            infoAnchor.style.cssText = 'flex-grow: 1; text-decoration: none; color: inherit;';
            infoAnchor.innerHTML = `
                <span class="chat-name">${escapeHTML(contact.username)}</span>
                <div class="chat-preview">${escapeHTML(contact.status)}</div>
            `;

            contactItem.appendChild(avatarElement);
            contactItem.appendChild(infoAnchor);
            contactsContainer.appendChild(contactItem);
        });
    }

    // 4. Dynamic Local Input Filter
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase().trim();
            const filtered = allContacts.filter(contact => 
                contact.username.toLowerCase().includes(searchTerm)
            );
            renderContacts(filtered);
        });
    }
});

function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

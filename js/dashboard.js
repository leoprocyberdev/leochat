import { signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, query, where, orderBy, onSnapshot, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';

let dynamicChatsCache = []; 
const usersCache = {}; // Cache to prevent repetitive database calls (stores { name, photoURL })

// 1. Authentication Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        initDashboard(user.uid);
    } else {
        window.location.href = 'index.html';
    }
});

function initDashboard(currentUserId) {
    initTabNavigation();
    initDropdownMenu();
    initNewChatFab();
    initDashboardSearch();
    
    streamActiveChats(currentUserId);
    streamLiveStatuses();
}

// 2. Helper to fetch the other participant's profile (name & photoURL)
async function resolveOtherUserProfile(uid) {
    if (usersCache[uid]) return usersCache[uid]; // Return cached profile if available
    
    try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) {
            const data = userSnap.data();
            const profile = {
                name: data.username || data.displayName || "Unknown User",
                photoURL: data.photoURL || null
            };
            usersCache[uid] = profile; // Cache profile object
            return profile;
        }
    } catch(e) {
        console.error("Failed to fetch user profile:", e);
    }
    return { name: "Unknown User", photoURL: null };
}

/* REAL-TIME CHAT STREAM */
function streamActiveChats(currentUserId) {
    const chatListContainer = document.querySelector('#panel-chats .list-scroll-view');
    if (!chatListContainer) return;

    const chatsRef = collection(db, 'chats'); 
    const q = query(
        chatsRef, 
        where('participantIds', 'array-contains', currentUserId), 
        orderBy('timestamp', 'desc')
    );

    onSnapshot(q, async (snapshot) => {
        const tempChats = [];
        snapshot.forEach((docSnap) => {
            tempChats.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Resolve real names and profile pictures for 1-on-1 chats
        for (let chat of tempChats) {
            if (!chat.isGroup && chat.participantIds) {
                // Find the ID that is NOT ours
                const otherUid = chat.participantIds.find(id => id !== currentUserId);
                if (otherUid) {
                    const profile = await resolveOtherUserProfile(otherUid);
                    chat.resolvedName = profile.name;
                    chat.photoURL = profile.photoURL;
                    chat.otherUid = otherUid;
                } else {
                    chat.resolvedName = "Just You";
                    chat.photoURL = null;
                }
            } else {
                chat.resolvedName = chat.chatName || 'Group Chat';
                chat.photoURL = chat.groupIcon || null;
            }
        }

        dynamicChatsCache = tempChats;
        renderChatsList(dynamicChatsCache);
    });
}

function renderChatsList(chatsArray) {
    const chatListContainer = document.querySelector('#panel-chats .list-scroll-view');
    if (!chatListContainer) return;

    // Preserve the archived banner if it exists
    const archivedBanner = chatListContainer.querySelector('.archived-banner');
    chatListContainer.innerHTML = '';
    if (archivedBanner) chatListContainer.appendChild(archivedBanner);

    chatsArray.forEach((chat) => {
        const displayName = chat.resolvedName || chat.chatName || 'Private Chat';
        const chatItem = document.createElement('a');
        
        let url = `chat.html?chatId=${chat.id}&user=${encodeURIComponent(displayName)}`;
        if (chat.otherUid) {
            url += `&uid=${chat.otherUid}`;
        }

        // Render Real Photo if available, else fall back to Initial Avatar
        const avatarHTML = chat.photoURL 
            ? `<div class="avatar" style="overflow: hidden;"><img src="${escapeHTML(chat.photoURL)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" /></div>`
            : `<div class="avatar bg-blue">${escapeHTML(displayName.charAt(0).toUpperCase())}</div>`;

        chatItem.href = url;
        chatItem.className = 'chat-item';
        chatItem.innerHTML = `
            ${avatarHTML}
            <div class="chat-info">
                <div class="chat-info-top">
                    <span class="chat-name">${escapeHTML(displayName)}</span>
                </div>
                <div class="chat-preview">${escapeHTML(chat.lastMessage || '')}</div>
            </div>
        `;
        chatListContainer.appendChild(chatItem);
    });
}

/* SEARCH & NAVIGATION ROUTERS */
function initDashboardSearch() {
    const searchField = document.getElementById('dashboardSearchField');
    if (!searchField) return;

    searchField.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = dynamicChatsCache.filter(c => 
            (c.resolvedName || c.chatName || '').toLowerCase().includes(query)
        );
        renderChatsList(filtered);
    });

    searchField.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            window.location.href = `select_contact.html?query=${encodeURIComponent(e.target.value.trim())}`;
        }
    });
}

function initNewChatFab() {
    const fab = document.getElementById('newChatFab');
    if (fab) {
        fab.addEventListener('click', () => {
            window.location.href = 'select_contact.html';
        });
    }
}

/* UTILITIES */
function streamLiveStatuses() {
    const statusStrip = document.querySelector('.status-horizontal-strip');
    if (statusStrip) {
        // Future implementation for status stream
    }
}

function initTabNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const panels = document.querySelectorAll('.tab-panel');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            navItems.forEach(i => i.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));
            item.classList.add('active');
            document.getElementById(`panel-${target}`).classList.add('active');
        });
    });
}

function initDropdownMenu() {
    const btn = document.getElementById('menuToggleBtn');
    const menu = document.getElementById('dropdownMenu');
    
    if (btn && menu) {
        btn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            menu.classList.toggle('show'); 
        });
        
        document.addEventListener('click', () => menu.classList.remove('show'));

        menu.addEventListener('click', async (e) => {
            const item = e.target.closest('.dropdown-item');
            if (!item) return;

            const action = item.getAttribute('data-action');
            
            if (action === 'settings') {
                window.location.href = 'settings.html';
            } else if (action === 'logout') {
                try {
                    await signOut(auth);
                    window.location.href = 'index.html'; 
                } catch (error) {
                    console.error("Logout failed:", error);
                }
            }

            menu.classList.remove('show');
        });
    }
}

function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

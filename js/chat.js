import { auth, db } from './firebase-config.js';
import { uploadImageToImgBB } from './imgbb.js';
import { uploadVoiceNoteToCloudinary } from './cloudinary.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, doc, getDocs, getDoc, setDoc, addDoc, onSnapshot, 
    query, where, orderBy, serverTimestamp, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let CURRENT_USER_ID = null;
let activeChatId = null;
let contactUid = null;

// Audio Recording & Web Audio API state
let mediaRecorder = null;
let audioChunks = [];
let audioContext = null;

// SVG Paths for dynamic FAB button
const micIconPath = "M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z";
const sendIconPath = "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z";
const stopIconPath = "M6 6h12v12H6z";

document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    activeChatId = urlParams.get('chatId'); 
    contactUid = urlParams.get('uid');
    const directUserName = urlParams.get('user');

    // DOM Elements matching chat.html
    const msgInput = document.getElementById('messageInput');
    const chatForm = document.getElementById('chatForm');
    const btnSvg = document.getElementById('btnSvg');
    const attachBtn = document.getElementById('attachBtn');
    const chatImageInput = document.getElementById('chatImageInput');

    // Initial placeholder text while profile loads from Firestore
    if (directUserName) {
        const nameEl = document.querySelector('.group-name');
        const avatarEl = document.querySelector('.group-avatar');
        const statusEl = document.querySelector('.group-status');
        
        if (nameEl) nameEl.textContent = directUserName;
        if (avatarEl) avatarEl.textContent = directUserName.charAt(0).toUpperCase();
        if (statusEl) statusEl.textContent = 'Online';
    }

    // Dynamic icon toggle: Change Mic to Send arrow when typing
    if (msgInput && btnSvg) {
        msgInput.addEventListener('input', () => {
            if (mediaRecorder && mediaRecorder.state === "recording") return;

            if (msgInput.value.trim().length > 0) {
                btnSvg.innerHTML = `<path d="${sendIconPath}"/>`;
            } else {
                btnSvg.innerHTML = `<path d="${micIconPath}"/>`;
            }
        });
    }

    // Attachment Button & ImgBB Upload Handler
    if (attachBtn && chatImageInput) {
        attachBtn.addEventListener('click', () => chatImageInput.click());

        chatImageInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            try {
                showStatusIndicator("Uploading Image...");
                const imageUrl = await uploadImageToImgBB(file);
                await sendImageMessage(imageUrl);
                chatImageInput.value = '';
            } catch (err) {
                alert("Failed to send image: " + err.message);
            } finally {
                hideStatusIndicator();
            }
        });
    }

    // 1. Await Authentication State
    onAuthStateChanged(auth, (user) => {
        if (user) {
            CURRENT_USER_ID = user.uid;
            
            if (contactUid) {
                loadHeaderProfile(contactUid);
            }

            if (activeChatId) {
                loadMessageStream();
                listenToChatDetails();
            } else if (contactUid) {
                resolveChatSessionId();
            }
        } else {
            window.location.href = 'index.html'; 
        }
    });

    // 2. Form submission handler (Sends text or toggles voice recording)
    if (chatForm) {
        chatForm.addEventListener('submit', (e) => {
            e.preventDefault(); 
            const text = msgInput ? msgInput.value.trim() : "";
            
            if (text.length > 0) {
                executeMessageSend(msgInput);
            } else {
                toggleVoiceRecording();
            }
        });
    }
});

/* ==========================================================================
   VOICE RECORDING & AUDIO AMPLIFICATION (3.0x Gain)
   ========================================================================== */
async function toggleVoiceRecording() {
    const actionBtn = document.getElementById('actionBtn');
    const btnSvg = document.getElementById('btnSvg');

    if (!mediaRecorder || mediaRecorder.state === "inactive") {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Web Audio API Amplification
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            const gainNode = audioContext.createGain();
            gainNode.gain.value = 3.0; // Boost mic volume by 3x

            const destination = audioContext.createMediaStreamDestination();
            source.connect(gainNode);
            gainNode.connect(destination);

            mediaRecorder = new MediaRecorder(destination.stream);
            audioChunks = [];

            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) audioChunks.push(e.data);
            };

            mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
                
                if (audioContext) {
                    audioContext.close();
                    audioContext = null;
                }

                showStatusIndicator("Uploading Voice Note...");
                try {
                    const audioUrl = await uploadVoiceNoteToCloudinary(audioBlob);
                    await sendVoiceNoteMessage(audioUrl);
                } catch (err) {
                    alert("Voice note failed to send: " + err.message);
                } finally {
                    hideStatusIndicator();
                }
            };

            mediaRecorder.start();
            if (actionBtn) actionBtn.classList.add('recording-pulse');
            if (btnSvg) btnSvg.innerHTML = `<path d="${stopIconPath}"/>`;
        } catch (err) {
            alert("Microphone access denied or not supported.");
        }
    } else {
        // Stop active recording session
        mediaRecorder.stop();
        if (actionBtn) actionBtn.classList.remove('recording-pulse');
        if (btnSvg) btnSvg.innerHTML = `<path d="${micIconPath}"/>`;
    }
}

/* ==========================================================================
   HEADER PROFILE RESOLUTION
   ========================================================================== */
async function loadHeaderProfile(uid) {
    if (!uid) return;
    try {
        const userSnap = await getDoc(doc(db, 'users', uid));
        if (userSnap.exists()) {
            const data = userSnap.data();
            const nameEl = document.querySelector('.group-name');
            const avatarEl = document.querySelector('.group-avatar');
            
            const name = data.username || data.displayName;
            if (name && nameEl) nameEl.textContent = name;
            
            if (avatarEl) {
                if (data.photoURL) {
                    avatarEl.innerHTML = `<img src="${escapeHTML(data.photoURL)}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;" />`;
                    avatarEl.style.overflow = 'hidden';
                } else if (name) {
                    avatarEl.textContent = name.charAt(0).toUpperCase();
                }
            }
        }
    } catch (err) {
        console.error("Failed to load header profile photo:", err);
    }
}

/* ==========================================================================
   1. RESOLVE P2P ROOM ID
   ========================================================================== */
async function resolveChatSessionId() {
    try {
        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participantIds', 'array-contains', CURRENT_USER_ID));
        const querySnapshot = await getDocs(q);
        
        let existingChatDoc = null;

        querySnapshot.forEach(docSnap => {
            const data = docSnap.data();
            if (data.participantIds.includes(contactUid) && !data.isGroup) {
                existingChatDoc = docSnap;
            }
        });

        if (existingChatDoc) {
            activeChatId = existingChatDoc.id;
        } else {
            const sortedIds = [CURRENT_USER_ID, contactUid].sort();
            activeChatId = `p2p_${sortedIds[0]}_${sortedIds[1]}`;
        }

        loadMessageStream();
        listenToChatDetails();
    } catch (err) {
        console.error("Error resolving chat channel: ", err);
    }
}

/* ==========================================================================
   2. STREAM REAL-TIME MESSAGES INTO CHAT WALL
   ========================================================================== */
function loadMessageStream() {
    const messagesBox = document.getElementById('messagesContainer');
    if (!activeChatId || !messagesBox) return;

    const messagesRef = collection(db, 'messages', activeChatId, 'msg_history');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    onSnapshot(q, (snapshot) => {
        messagesBox.innerHTML = ''; 

        snapshot.forEach((docSnap) => {
            const msg = docSnap.data();
            
            let timeStr = "";
            if (msg.timestamp) {
                const date = msg.timestamp.toDate ? msg.timestamp.toDate() : new Date();
                timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            }

            const wrapper = document.createElement('div');
            const isMe = (msg.senderId === CURRENT_USER_ID);
            
            wrapper.className = `message-wrapper ${isMe ? 'sender' : 'receiver'}`;
            
            let contentHTML = '';
            
            // Image Attachment
            if (msg.imageUrl) {
                contentHTML += `<img src="${msg.imageUrl}" class="chat-img-attachment" style="max-width: 220px; border-radius: 8px; display: block; margin-bottom: 4px;" />`;
            }
            
            // Audio / Voice Note Player
            if (msg.audioUrl) {
                const audioId = `audio-${docSnap.id}`;
                contentHTML += `
                    <div class="custom-audio-player" style="display: flex; align-items: center; gap: 8px; min-width: 180px; margin-bottom: 4px; padding: 4px 0;">
                        <button class="play-btn" onclick="window.toggleAudio('${msg.audioUrl}', '${audioId}')" id="btn-${audioId}" style="background: none; border: none; cursor: pointer; color: inherit; font-size: 16px;">▶</button>
                        <div class="audio-progress" style="flex: 1; height: 4px; background: rgba(255,255,255,0.3); border-radius: 2px; overflow: hidden; cursor: pointer;">
                            <div class="progress-fill" id="fill-${audioId}" style="width: 0%; height: 100%; background: currentColor;"></div>
                        </div>
                        <span class="audio-time" id="time-${audioId}" style="font-size: 11px;">0:00</span>
                    </div>
                    <audio id="${audioId}" src="${msg.audioUrl}" preload="metadata" style="display:none;"></audio>
                `;
            }

            // Text Message Body
            if (msg.text) {
                contentHTML += `<p class="msg-body">${escapeHTML(msg.text)}</p>`;
            }

            wrapper.innerHTML = `
                <div class="bubble">
                    ${contentHTML}
                    <span class="msg-time">${timeStr}</span>
                </div>
            `;
            
            messagesBox.appendChild(wrapper);
        });
        
        messagesBox.scrollTop = messagesBox.scrollHeight;
    }, (error) => {
        console.error("Messages stream broken: ", error);
    });
}

/* ==========================================================================
   3. LISTEN TO CHAT METADATA
   ========================================================================== */
function listenToChatDetails() {
    const pinnedBanner = document.querySelector('.pinned-banner');
    const pinnedText = document.querySelector('.pinned-text');

    if (!activeChatId) return;

    const chatDocRef = doc(db, 'chats', activeChatId);
    
    onSnapshot(chatDocRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            
            if (!contactUid && data.participantIds) {
                contactUid = data.participantIds.find(id => id !== CURRENT_USER_ID);
                if (contactUid) {
                    loadHeaderProfile(contactUid);
                }
            }

            if (pinnedBanner && pinnedText) {
                if (data.pinnedMessage) {
                    pinnedText.textContent = data.pinnedMessage;
                    pinnedBanner.style.display = 'flex'; 
                } else {
                    pinnedBanner.style.display = 'none'; 
                }
            }
        } else {
            if (pinnedBanner) pinnedBanner.style.display = 'none';
        }
    }, (error) => {
        console.error("Failed to load chat details: ", error);
        if (pinnedBanner) pinnedBanner.style.display = 'none';
    });
}

/* ==========================================================================
   4. COMMIT MESSAGES TO FIRESTORE
   ========================================================================== */
async function executeMessageSend(inputElement) {
    const text = inputElement.value.trim();
    if (!text || !activeChatId) return;

    const currentNameEl = document.querySelector('.group-name');
    const currentName = currentNameEl ? currentNameEl.textContent : "Private Chat";

    const payloadMessage = {
        senderId: CURRENT_USER_ID,
        text: text,
        timestamp: serverTimestamp()
    };

    inputElement.value = '';
    inputElement.dispatchEvent(new Event('input'));

    try {
        const messagesRef = collection(db, 'messages', activeChatId, 'msg_history');
        await addDoc(messagesRef, payloadMessage);

        const chatDocRef = doc(db, 'chats', activeChatId);
        await setDoc(chatDocRef, {
            lastMessage: text,
            timestamp: serverTimestamp(),
            participantIds: contactUid ? [CURRENT_USER_ID, contactUid] : arrayUnion(CURRENT_USER_ID),
            chatName: currentName,
            isGroup: false
        }, { merge: true });

    } catch (error) {
        console.error("Failed to commit message: ", error);
    }
}

async function sendImageMessage(imageUrl) {
    if (!activeChatId) return;

    const currentNameEl = document.querySelector('.group-name');
    const currentName = currentNameEl ? currentNameEl.textContent : "Private Chat";

    const payloadMessage = {
        senderId: CURRENT_USER_ID,
        imageUrl: imageUrl,
        text: "",
        timestamp: serverTimestamp()
    };

    try {
        const messagesRef = collection(db, 'messages', activeChatId, 'msg_history');
        await addDoc(messagesRef, payloadMessage);

        const chatDocRef = doc(db, 'chats', activeChatId);
        await setDoc(chatDocRef, {
            lastMessage: "📷 Photo",
            timestamp: serverTimestamp(),
            participantIds: contactUid ? [CURRENT_USER_ID, contactUid] : arrayUnion(CURRENT_USER_ID),
            chatName: currentName,
            isGroup: false
        }, { merge: true });

    } catch (error) {
        console.error("Failed to commit image message: ", error);
    }
}

async function sendVoiceNoteMessage(audioUrl) {
    if (!activeChatId) return;

    const currentNameEl = document.querySelector('.group-name');
    const currentName = currentNameEl ? currentNameEl.textContent : "Private Chat";

    const payloadMessage = {
        senderId: CURRENT_USER_ID,
        audioUrl: audioUrl,
        text: "",
        timestamp: serverTimestamp()
    };

    try {
        const messagesRef = collection(db, 'messages', activeChatId, 'msg_history');
        await addDoc(messagesRef, payloadMessage);

        const chatDocRef = doc(db, 'chats', activeChatId);
        await setDoc(chatDocRef, {
            lastMessage: "🎤 Voice note",
            timestamp: serverTimestamp(),
            participantIds: contactUid ? [CURRENT_USER_ID, contactUid] : arrayUnion(CURRENT_USER_ID),
            chatName: currentName,
            isGroup: false
        }, { merge: true });

    } catch (error) {
        console.error("Failed to commit voice note message: ", error);
    }
}

/* ==========================================================================
   GLOBAL AUDIO CONTROLLER
   ========================================================================== */
window.toggleAudio = (url, id) => {
    const audio = document.getElementById(id);
    const btn = document.getElementById(`btn-${id}`);
    const fill = document.getElementById(`fill-${id}`);
    const timeDisplay = document.getElementById(`time-${id}`);

    if (!audio) return;

    // Pause all other playing audio instances
    document.querySelectorAll('audio').forEach(a => {
        if (a.id !== id && !a.paused) {
            a.pause();
            const otherBtn = document.getElementById(`btn-${a.id}`);
            if (otherBtn) otherBtn.innerText = "▶";
        }
    });

    if (audio.paused) {
        audio.play();
        if (btn) btn.innerText = "⏸";
        
        audio.ontimeupdate = () => {
            if (audio.duration) {
                const pct = (audio.currentTime / audio.duration) * 100;
                if (fill) fill.style.width = pct + "%";
                const mins = Math.floor(audio.currentTime / 60);
                const secs = Math.floor(audio.currentTime % 60);
                if (timeDisplay) timeDisplay.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
            }
        };

        audio.onended = () => {
            if (btn) btn.innerText = "▶";
            if (fill) fill.style.width = "0%";
        };
    } else {
        audio.pause();
        if (btn) btn.innerText = "▶";
    }
};

/* ==========================================================================
   UTILITIES & TOASTS
   ========================================================================== */
function showStatusIndicator(msg) {
    let div = document.getElementById('status-toast');
    if (!div) {
        div = document.createElement('div');
        div.id = 'status-toast';
        div.style = "position:fixed; bottom:80px; left:50%; transform:translateX(-50%); background:#075211; color:white; padding:8px 16px; border-radius:20px; z-index:1000; font-size:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.3);";
        document.body.appendChild(div);
    }
    div.innerText = msg;
    div.style.display = 'block';
}

function hideStatusIndicator() {
    const div = document.getElementById('status-toast');
    if (div) div.style.display = 'none';
}

function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, 
        tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
}

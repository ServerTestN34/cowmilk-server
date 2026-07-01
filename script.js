document.addEventListener("DOMContentLoaded", () => {
    
    // 1. FIREBASE INITIALIZATION
    const firebaseConfig = {
        databaseURL: "https://cowmilk-chat-default-rtdb.firebaseio.com"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // Generate (or reuse) a persistent local profile signature so refreshing
    // the page doesn't spawn a brand new presence entry every time.
    function getOrCreatePersistentUid() {
        let storedUid = localStorage.getItem("cowmilk_session_uid");
        if (!storedUid) {
            storedUid = "user_" + Math.random().toString(36).substring(2, 9);
            localStorage.setItem("cowmilk_session_uid", storedUid);
        }
        return storedUid;
    }
    let mySessionUid = getOrCreatePersistentUid();
    
    let currentUser = { username: "Cowmilk", avatarUrl: "", status: "🎮 ROBLOX" };
    let currentChannel = "welcome-and-rules";
    let currentLiveListener = null;
    
    let activeReplyTargetId = null;
    let messageToForwardData = null;
    let localMuteRegistry = {};

    // Usernames (lowercase) allowed to run admin commands / open the admin panel.
    // Edit this list to whoever should have admin powers in your server.
    const ADMIN_USERNAMES = ["cowmilk"];

    const EMOJI_SHORTCODES = {
        ":sob:": "😭", ":smile:": "😀", ":joy:": "😂", ":fire:": "🔥", ":eyes:": "👀", ":100:": "💯", ":milk:": "🥛"
    };

    const REACTION_EMOJI_SET = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

    // --- CHANNEL UNREAD-TRACKING STATE ---
    let channelLastMessageTimestamps = {};
    let watchedUnreadChannels = new Set();

    // --- TYPING INDICATOR STATE ---
    let typingTimeout = null;
    let latestTypingSnapshotData = null;

    // 2. DOM ELEMENT TREE SELECTORS
    const channelHeaderTitle = document.getElementById("headerChannelName");
    const chatInput = document.getElementById("messageInputField");
    const chatMessagesContainer = document.querySelector(".chat-messages");
    const dynamicChannelContainerRail = document.getElementById("dynamicChannelContainerRail");
    const createNewChannelActionBtn = document.getElementById("createNewChannelActionBtn");
    
    const appContainer = document.getElementById("appContainer");
    const menuToggleBtn = document.getElementById("menuToggleBtn");
    const menuOverlay = document.getElementById("menuOverlay");

    const identityModal = document.getElementById("identityModal");
    const confirmProfileBtn = document.getElementById("confirmProfileBtn");
    const modalUsernameInput = document.getElementById("modalUsernameInput");
    const modalPinInput = document.getElementById("modalPinInput");
    const modalAvatarInput = document.getElementById("modalAvatarInput");
    const modalStatusInput = document.getElementById("modalStatusInput");
    const membersContainerList = document.getElementById("membersContainerList");

    const forwardModal = document.getElementById("forwardModal");
    const forwardChannelListContainer = document.getElementById("forwardChannelListContainer");
    const closeForwardModalBtn = document.getElementById("closeForwardModalBtn");

    const replyPreviewBar = document.getElementById("replyPreviewBar");
    const replyTargetUsername = document.getElementById("replyTargetUsername");
    const replyTargetSnippet = document.getElementById("replyTargetSnippet");
    const cancelReplyBtn = document.getElementById("cancelReplyBtn");

    const imageAttachmentFileInput = document.getElementById("imageAttachmentFileInput");
    const emojiMenuBtn = document.getElementById("emojiMenuBtn");
    const emojiPickerTray = document.getElementById("emojiPickerTray");

    const messageSearchInput = document.getElementById("messageSearchInput");
    const typingIndicatorBar = document.getElementById("typingIndicatorBar");

    const openAdminPanelBtn = document.getElementById("openAdminPanelBtn");
    const adminPanelModal = document.getElementById("adminPanelModal");
    const adminPurgeAmount = document.getElementById("adminPurgeAmount");
    const adminPurgeBtn = document.getElementById("adminPurgeBtn");
    const adminMutedList = document.getElementById("adminMutedList");
    const adminChannelDeleteList = document.getElementById("adminChannelDeleteList");
    const closeAdminPanelBtn = document.getElementById("closeAdminPanelBtn");

    // Remember the last username used on this browser so the modal is prefilled.
    const rememberedUsername = localStorage.getItem("cowmilk_last_username");
    if (rememberedUsername && modalUsernameInput) modalUsernameInput.value = rememberedUsername;

    // --- PIN HASHING (lightweight username-claim system, not real auth) ---
    async function hashPin(pin) {
        const rawString = pin + "::cowmilk_salt";
        if (window.crypto && window.crypto.subtle) {
            try {
                const enc = new TextEncoder();
                const data = enc.encode(rawString);
                const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
                return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
            } catch (e) {
                // fall through to the simple fallback below
            }
        }
        // Fallback for environments without Web Crypto - not cryptographically
        // secure, but still avoids storing the raw PIN in the database.
        let hash = 0;
        for (let i = 0; i < rawString.length; i++) {
            hash = ((hash << 5) - hash + rawString.charCodeAt(i)) | 0;
        }
        return "fallback_" + Math.abs(hash).toString(16);
    }

    // --- 3. THE PRESENCE HEARTBEAT SYSTEM ---
    function initializeUserPresence() {
        const myPresenceRef = database.ref(`presence/${mySessionUid}`);
        const connectedRef = database.ref(".info/connected");

        connectedRef.on("value", (snap) => {
            if (snap.val() === true) {
                myPresenceRef.onDisconnect().update({
                    state: "offline"
                });

                // Sweep out any stale/duplicate presence nodes that share this
                // username (leftovers from testing before persistent UIDs,
                // or from browsers where localStorage got cleared).
                database.ref("presence").once("value", (snapshot) => {
                    const staleUpdates = {};
                    snapshot.forEach(child => {
                        if (child.key === mySessionUid) return;
                        const entry = child.val();
                        if (entry && entry.username &&
                            entry.username.toLowerCase() === currentUser.username.toLowerCase()) {
                            staleUpdates[child.key] = null;
                        }
                    });
                    if (Object.keys(staleUpdates).length > 0) {
                        database.ref("presence").update(staleUpdates);
                    }

                    myPresenceRef.set({
                        username: currentUser.username,
                        avatarUrl: currentUser.avatarUrl,
                        status: currentUser.status,
                        state: "online"
                    });
                });
            }
        });
    }

    // Monitor users online status directory
    database.ref("presence").on("value", (snapshot) => {
        syncGlobalPresenceDirectory(snapshot.val());
    });

    database.ref("mutedUsers").on("value", (snapshot) => {
        localMuteRegistry = snapshot.val() || {};
    });

    function syncGlobalPresenceDirectory(presenceData) {
        if (!membersContainerList) return;
        membersContainerList.innerHTML = "";
        
        let onlineUsers = [];
        let offlineUsers = [
            { username: "🤖 Clyde-AI", avatarUrl: "", status: "⚙️ Core Matrix", state: "offline" }
        ];

        if (presenceData) {
            Object.keys(presenceData).forEach(uid => {
                const user = presenceData[uid];
                if (user.state === "online") {
                    onlineUsers.push(user);
                } else {
                    offlineUsers.push(user);
                }
            });
        }

        if (onlineUsers.length > 0) {
            const onlineTitle = document.createElement("div");
            onlineTitle.classList.add("member-group-title");
            onlineTitle.textContent = `ONLINE — ${onlineUsers.length}`;
            membersContainerList.appendChild(onlineTitle);

            onlineUsers.forEach(user => {
                membersContainerList.appendChild(createMemberCardNode(user, true));
            });
        }

        if (offlineUsers.length > 0) {
            const offlineTitle = document.createElement("div");
            offlineTitle.classList.add("member-group-title");
            offlineTitle.textContent = `OFFLINE — ${offlineUsers.length}`;
            membersContainerList.appendChild(offlineTitle);

            offlineUsers.forEach(user => {
                membersContainerList.appendChild(createMemberCardNode(user, false));
            });
        }
    }

    function createMemberCardNode(user, isOnline) {
        const card = document.createElement("div");
        card.classList.add("member-card");
        
        if (!isOnline) card.style.opacity = "0.45";

        const statusClass = isOnline ? "status-online" : "status-offline";
        const isUserMuted = localMuteRegistry[user.username.toLowerCase()] ? " (MUTED)" : "";
        
        let avatarHTML = (user.avatarUrl && user.avatarUrl !== "")
            ? `<img class="member-avatar-img" src="${escapeHTML(user.avatarUrl)}">`
            : `<div class="member-avatar-fallback" style="background-color: #5865f2;">${user.username.charAt(0).toUpperCase()}</div>`;

        card.innerHTML = `
            <div class="member-card-avatar-box">
                ${avatarHTML}
                <div class="status-bubble ${statusClass}"></div>
            </div>
            <div>
                <div class="member-name">${escapeHTML(user.username)}${isUserMuted}</div>
                <div class="member-game">${escapeHTML(user.status)}</div>
            </div>
        `;
        return card;
    }

    // --- 4. CHANNEL MANAGEMENT ENGINE ---
    function initializeChannelMetadataManager() {
        const channelsMetaRef = database.ref("serverMetadata/channels");

        channelsMetaRef.once("value", (snapshot) => {
            if (!snapshot.exists()) {
                channelsMetaRef.set({
                    "welcome-and-rules": true,
                    "announcements": true,
                    "resources": true,
                    "general-chat": true,
                    "ai-bot-test": true
                });
            }
        });

        channelsMetaRef.on("value", (snapshot) => {
            if (!dynamicChannelContainerRail) return;
            dynamicChannelContainerRail.innerHTML = "";
            if (!snapshot.exists()) return;

            snapshot.forEach(childCh => {
                const chKey = childCh.key;
                const chElement = document.createElement("div");
                chElement.classList.add("channel");
                if (chKey === currentChannel) chElement.classList.add("active");
                chElement.setAttribute("data-ch", chKey);

                chElement.innerHTML = `
                    <div class="channel-left-group">
                        <span class="hash-symbol">#</span>
                        <span>${escapeHTML(chKey)}</span>
                    </div>
                    <button class="delete-channel-trash" title="Delete Channel">🗑️</button>
                `;

                chElement.addEventListener("click", () => {
                    if (currentChannel === chKey) return;
                    currentChannel = chKey;
                    if (channelHeaderTitle) channelHeaderTitle.textContent = chKey;
                    if (chatInput) chatInput.placeholder = `Message #${chKey}`;
                    appContainer?.classList.remove("menu-open");
                    activeReplyTargetId = null;
                    if (replyPreviewBar) replyPreviewBar.style.display = "none";
                    if (messageSearchInput) messageSearchInput.value = "";
                    
                    document.querySelector(".channel.active")?.classList.remove("active");
                    chElement.classList.add("active");
                    
                    syncChannelMessages(currentChannel);
                    renderTypingIndicator();
                });

                chElement.querySelector(".delete-channel-trash").addEventListener("click", (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to permanently delete channel #${chKey}?`)) {
                        database.ref(`serverMetadata/channels/${chKey}`).remove();
                        database.ref(`channels/${chKey}`).remove();
                        if (currentChannel === chKey) {
                            currentChannel = "welcome-and-rules";
                            database.ref("serverMetadata/channels/welcome-and-rules").set(true);
                        }
                    }
                });

                dynamicChannelContainerRail.appendChild(chElement);

                if (!watchedUnreadChannels.has(chKey)) {
                    watchedUnreadChannels.add(chKey);
                    watchChannelForUnread(chKey);
                } else {
                    updateChannelUnreadDot(chKey);
                }
            });
        });
    }

    if (createNewChannelActionBtn) {
        createNewChannelActionBtn.addEventListener("click", () => {
            const rawName = prompt("Enter name for new text channel:");
            if (!rawName) return;
            const processedChannelName = rawName.toLowerCase().replace(/[^a-z0-9-_]/g, "-");
            if (processedChannelName.trim() === "") return alert("Invalid channel layout naming.");
            
            database.ref(`serverMetadata/channels/${processedChannelName}`).set(true);
        });
    }

    // --- 5. PROFILE SCREEN INITIALIZATION (username + PIN claim) ---
    if (confirmProfileBtn) {
        confirmProfileBtn.addEventListener("click", async () => {
            const enteredName = modalUsernameInput?.value.trim() || "Cowmilk";
            const enteredPin = modalPinInput?.value.trim() || "";
            const enteredAvatar = modalAvatarInput?.value.trim() || "";
            const enteredStatus = modalStatusInput?.value.trim() || "🎮 ROBLOX";

            if (enteredName === "") return alert("Username cannot be blank.");
            if (enteredPin.length < 4) return alert("Please choose a PIN with at least 4 characters. It locks your username so no one else can use it.");

            confirmProfileBtn.disabled = true;
            confirmProfileBtn.textContent = "Checking name...";

            try {
                const lowerName = enteredName.toLowerCase();
                const pinHash = await hashPin(enteredPin);
                const registryRef = database.ref(`usernameRegistry/${lowerName}`);
                const snap = await registryRef.once("value");

                if (snap.exists()) {
                    const record = snap.val();
                    if (record.pinHash !== pinHash) {
                        alert("That username is already claimed and this PIN doesn't match. Pick a different name, or enter the correct PIN.");
                        confirmProfileBtn.disabled = false;
                        confirmProfileBtn.textContent = "Join Server";
                        return;
                    }
                } else {
                    await registryRef.set({ pinHash: pinHash, claimedAt: Date.now() });
                }

                currentUser.username = enteredName;
                currentUser.avatarUrl = enteredAvatar;
                currentUser.status = enteredStatus;
                localStorage.setItem("cowmilk_last_username", enteredName);

                const imgAvatar = document.getElementById("globalUserAvatar");
                const placeholderAvatar = document.getElementById("globalUserAvatarPlaceholder");

                if (currentUser.avatarUrl !== "" && imgAvatar) {
                    imgAvatar.src = currentUser.avatarUrl;
                    imgAvatar.style.display = "block";
                    if (placeholderAvatar) placeholderAvatar.style.display = "none";
                } else if (placeholderAvatar) {
                    placeholderAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
                    placeholderAvatar.style.display = "flex";
                    if (imgAvatar) imgAvatar.style.display = "none";
                }

                const globalUserEl = document.getElementById("globalUsername");
                const globalStatusEl = document.getElementById("globalUserStatus");
                if (globalUserEl) globalUserEl.textContent = currentUser.username;
                if (globalStatusEl) globalStatusEl.textContent = currentUser.status;

                if (openAdminPanelBtn) {
                    openAdminPanelBtn.style.display = ADMIN_USERNAMES.includes(currentUser.username.toLowerCase()) ? "flex" : "none";
                }

                if (identityModal) identityModal.style.display = "none";

                initializeUserPresence();
            } catch (err) {
                alert("Something went wrong connecting to the server. Try again.");
                confirmProfileBtn.disabled = false;
                confirmProfileBtn.textContent = "Join Server";
            }
        });
    }

    // Fire data synchronization on initial engine spin-up
    initializeChannelMetadataManager();
    syncChannelMessages(currentChannel);

    function parseShortcodes(text) {
        let processedText = text;
        for (const [code, emoji] of Object.entries(EMOJI_SHORTCODES)) {
            processedText = processedText.replace(new RegExp(code, 'gi'), emoji);
        }
        return processedText;
    }

    // --- 6. ATTACH IMAGE DATA LOADER ---
    if (imageAttachmentFileInput) {
        imageAttachmentFileInput.addEventListener("change", (e) => {
            if (localMuteRegistry[currentUser.username.toLowerCase()]) {
                alert("You are muted and cannot send files.");
                return;
            }
            const file = e.target.files[0];
            if (!file || !file.type.startsWith("image/")) return;

            const fileReader = new FileReader();
            fileReader.onload = () => {
                const now = new Date();
                const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                database.ref(`channels/${currentChannel}`).push({
                    username: currentUser.username,
                    avatarUrl: currentUser.avatarUrl,
                    time: `Today at ${timeString}`,
                    timestamp: Date.now(),
                    text: "", 
                    imageUrl: fileReader.result, 
                    edited: false
                });
                imageAttachmentFileInput.value = "";
            };
            fileReader.readAsDataURL(file);
        });
    }

    // --- 7. INTERFACE EVENT LISTENERS ---
    if (emojiMenuBtn) {
        emojiMenuBtn.addEventListener("click", (e) => { 
            e.stopPropagation(); 
            emojiPickerTray?.classList.toggle("active"); 
        });
    }
    document.querySelectorAll(".emoji-picker-tray span").forEach(emojiSpan => {
        emojiSpan.addEventListener("click", () => {
            if (chatInput) {
                chatInput.value += emojiSpan.textContent;
                chatInput.focus();
            }
        });
    });
    document.addEventListener("click", () => {
        emojiPickerTray?.classList.remove("active");
        document.querySelectorAll(".reaction-picker-tray").forEach(t => t.remove());
    });
    cancelReplyBtn?.addEventListener("click", () => { activeReplyTargetId = null; if (replyPreviewBar) replyPreviewBar.style.display = "none"; });
    closeForwardModalBtn?.addEventListener("click", () => { if (forwardModal) forwardModal.style.display = "none"; messageToForwardData = null; });
    menuToggleBtn?.addEventListener("click", () => appContainer?.classList.add("menu-open"));
    menuOverlay?.addEventListener("click", () => appContainer?.classList.remove("menu-open"));

    // --- Message search (filters currently loaded messages in this channel) ---
    messageSearchInput?.addEventListener("input", () => {
        const query = messageSearchInput.value.trim().toLowerCase();
        document.querySelectorAll(".message-wrapper-block").forEach(wrapper => {
            if (query === "") {
                wrapper.style.display = "";
                return;
            }
            const textEl = wrapper.querySelector(".msg-text, .msg-system-notice");
            const usernameEl = wrapper.querySelector(".msg-username");
            const combined = ((textEl?.textContent || "") + " " + (usernameEl?.textContent || "")).toLowerCase();
            wrapper.style.display = combined.includes(query) ? "" : "none";
        });
    });

    // --- Admin panel open/close ---
    openAdminPanelBtn?.addEventListener("click", () => {
        if (!ADMIN_USERNAMES.includes(currentUser.username.toLowerCase())) return;
        renderAdminPanel();
        if (adminPanelModal) adminPanelModal.style.display = "flex";
    });
    closeAdminPanelBtn?.addEventListener("click", () => { if (adminPanelModal) adminPanelModal.style.display = "none"; });

    adminPurgeBtn?.addEventListener("click", () => {
        const amount = parseInt(adminPurgeAmount?.value, 10);
        if (isNaN(amount) || amount <= 0) return alert("Enter a valid amount.");
        database.ref(`channels/${currentChannel}`).orderByKey().limitToLast(amount).once("value", (snapshot) => {
            if (!snapshot.exists()) return;
            let updates = {};
            snapshot.forEach(child => { updates[child.key] = null; });
            database.ref(`channels/${currentChannel}`).update(updates).then(() => {
                postSystemMessage(`🧹 Administrative Action: Wiped last ${amount} messages via Admin Panel.`);
            });
        });
    });

    function renderAdminPanel() {
        if (adminMutedList) {
            adminMutedList.innerHTML = "";
            const mutedNames = Object.keys(localMuteRegistry);
            if (mutedNames.length === 0) {
                adminMutedList.innerHTML = `<div class="admin-list-row">No muted users</div>`;
            } else {
                mutedNames.forEach(name => {
                    const row = document.createElement("div");
                    row.classList.add("admin-list-row");
                    row.innerHTML = `<span>@${escapeHTML(name)}</span>`;
                    const unmuteBtn = document.createElement("button");
                    unmuteBtn.textContent = "Unmute";
                    unmuteBtn.addEventListener("click", () => {
                        database.ref(`mutedUsers/${name}`).remove().then(renderAdminPanel);
                    });
                    row.appendChild(unmuteBtn);
                    adminMutedList.appendChild(row);
                });
            }
        }

        if (adminChannelDeleteList) {
            adminChannelDeleteList.innerHTML = "";
            database.ref("serverMetadata/channels").once("value", (snapshot) => {
                snapshot.forEach(child => {
                    const chKey = child.key;
                    const row = document.createElement("div");
                    row.classList.add("admin-list-row");
                    row.innerHTML = `<span># ${escapeHTML(chKey)}</span>`;
                    const delBtn = document.createElement("button");
                    delBtn.textContent = "Delete";
                    delBtn.addEventListener("click", () => {
                        if (confirm(`Delete #${chKey}?`)) {
                            database.ref(`serverMetadata/channels/${chKey}`).remove();
                            database.ref(`channels/${chKey}`).remove();
                            renderAdminPanel();
                        }
                    });
                    row.appendChild(delBtn);
                    adminChannelDeleteList.appendChild(row);
                });
            });
        }
    }

    // --- 7b. TYPING INDICATOR SYSTEM ---
    if (chatInput) {
        chatInput.addEventListener("input", () => {
            database.ref(`typing/${mySessionUid}`).set({
                username: currentUser.username,
                channel: currentChannel,
                ts: Date.now()
            });
            database.ref(`typing/${mySessionUid}`).onDisconnect().remove();

            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                database.ref(`typing/${mySessionUid}`).remove();
            }, 3000);
        });
    }

    database.ref("typing").on("value", (snapshot) => {
        latestTypingSnapshotData = snapshot;
        renderTypingIndicator();
    });

    function renderTypingIndicator() {
        if (!typingIndicatorBar || !latestTypingSnapshotData) return;
        const typers = [];
        const now = Date.now();
        latestTypingSnapshotData.forEach(child => {
            const t = child.val();
            if (child.key !== mySessionUid && t.channel === currentChannel && (now - t.ts) < 4000) {
                typers.push(t.username);
            }
        });
        if (typers.length === 0) {
            typingIndicatorBar.textContent = "";
        } else if (typers.length === 1) {
            typingIndicatorBar.textContent = `${typers[0]} is typing...`;
        } else if (typers.length <= 3) {
            typingIndicatorBar.textContent = `${typers.join(", ")} are typing...`;
        } else {
            typingIndicatorBar.textContent = `Several people are typing...`;
        }
    }

    // --- 7c. UNREAD CHANNEL TRACKING ---
    function getLastReadTimestamp(channelKey) {
        return parseInt(localStorage.getItem(`cowmilk_lastRead_${channelKey}`) || "0", 10);
    }
    function setLastReadTimestamp(channelKey, ts) {
        localStorage.setItem(`cowmilk_lastRead_${channelKey}`, String(ts));
    }

    function watchChannelForUnread(channelKey) {
        database.ref(`channels/${channelKey}`).orderByChild("timestamp").limitToLast(1)
            .on("value", (snapshot) => {
                let latestTs = 0;
                snapshot.forEach(child => {
                    const val = child.val();
                    if (val && val.timestamp) latestTs = val.timestamp;
                });
                channelLastMessageTimestamps[channelKey] = latestTs;
                updateChannelUnreadDot(channelKey);
            });
    }

    function updateChannelUnreadDot(channelKey) {
        if (!dynamicChannelContainerRail) return;
        const chElement = dynamicChannelContainerRail.querySelector(`[data-ch="${CSS.escape(channelKey)}"]`);
        if (!chElement) return;

        const lastRead = getLastReadTimestamp(channelKey);
        const latestTs = channelLastMessageTimestamps[channelKey] || 0;
        const isUnread = channelKey !== currentChannel && latestTs > lastRead;

        let dot = chElement.querySelector(".channel-unread-dot");
        if (isUnread) {
            chElement.classList.add("has-unread");
            if (!dot) {
                dot = document.createElement("span");
                dot.classList.add("channel-unread-dot");
                chElement.querySelector(".channel-left-group")?.appendChild(dot);
            }
        } else {
            chElement.classList.remove("has-unread");
            dot?.remove();
        }
    }

    // --- 8. MESSAGE RENDERING ---
    function renderMessages(channelKey, snapshot) {
        if (!chatMessagesContainer) return;
        chatMessagesContainer.innerHTML = "";
        if (!snapshot.exists()) {
            if (channelKey === currentChannel) {
                setLastReadTimestamp(channelKey, Date.now());
                updateChannelUnreadDot(channelKey);
            }
            return;
        }

        snapshot.forEach(childSnapshot => {
            const msgId = childSnapshot.key;
            const msg = childSnapshot.val();
            
            const messageWrapper = document.createElement("div");
            messageWrapper.classList.add("message-wrapper-block");

            let replyLineHTML = msg.replyTo ? `
                <div class="message-reply-header">
                     replied to <strong>${escapeHTML(msg.replyTo.username)}</strong>: "${escapeHTML(msg.replyTo.snippet)}"
                </div>
            ` : "";

            const isBot = msg.username.includes("🤖");
            const isSystemNotice = msg.systemNotice === true;
            const editedBadgeHTML = msg.edited ? `<span class="msg-edited-tag">(edited)</span>` : '';
            const forwardedBadgeHTML = msg.forwarded ? `<span class="msg-forwarded-tag">Forwarded</span>` : '';
            let mediaEmbedHTML = msg.imageUrl ? `<img src="${escapeHTML(msg.imageUrl)}" class="msg-image-embed">` : '';

            const mentionsMe = !isSystemNotice && msg.text &&
                msg.text.toLowerCase().includes("@" + currentUser.username.toLowerCase());

            let userAvatarHTML = msg.avatarUrl && msg.avatarUrl !== "" 
                ? `<img class="message-avatar" src="${escapeHTML(msg.avatarUrl)}">` 
                : `<div class="message-avatar" style="background-color:#5865f2; display:flex; align-items:center; justify-content:center; font-weight:bold; color:white; font-size:16px;">${msg.username.charAt(0).toUpperCase()}</div>`;

            const modifyToolsHTML = (!isBot && !isSystemNotice) ? `
                <button class="action-btn edit-btn" title="Edit Message">✏️</button>
                <button class="action-btn delete-btn" title="Delete Message">🗑️</button>
            ` : '';

            const reactBtnHTML = !isSystemNotice ? `<button class="action-btn react-btn" title="Add Reaction">🙂</button>` : '';

            const linkPreviewHTML = !isSystemNotice ? buildLinkPreviewHTML(msg.text) : '';

            let reactionsRowHTML = "";
            if (msg.reactions) {
                const pills = Object.keys(msg.reactions).map(emoji => {
                    const reactors = msg.reactions[emoji] || {};
                    const count = Object.keys(reactors).length;
                    if (count === 0) return "";
                    const mineClass = reactors[mySessionUid] ? "mine" : "";
                    return `<div class="reaction-pill ${mineClass}" data-emoji="${escapeHTML(emoji)}">${emoji} <span>${count}</span></div>`;
                }).filter(Boolean).join("");
                if (pills) reactionsRowHTML = `<div class="reactions-row">${pills}</div>`;
            }

            let contentBodyHTML = isSystemNotice 
                ? `<p class="msg-system-notice">${escapeHTML(msg.text)}</p>` 
                : `<p class="msg-text">${linkifyAndMentionify(msg.text)}</p>`;

            messageWrapper.innerHTML = `
                ${replyLineHTML}
                <div class="message ${mentionsMe ? 'mentions-me' : ''}" data-id="${msgId}">
                    ${userAvatarHTML}
                    <div class="message-content">
                        <div class="message-meta">
                            <span class="msg-username">${escapeHTML(msg.username)}</span>
                            <span class="msg-timestamp">${msg.time} ${editedBadgeHTML} ${forwardedBadgeHTML}</span>
                        </div>
                        ${contentBodyHTML}
                        ${mediaEmbedHTML}
                        ${linkPreviewHTML}
                        ${reactionsRowHTML}
                    </div>
                    <div class="message-actions" style="${isSystemNotice ? 'display:none !important;' : ''}">
                        ${reactBtnHTML}
                        <button class="action-btn reply-btn" title="Reply">↩️</button>
                        <button class="action-btn forward-btn" title="Forward">➡️</button>
                        ${modifyToolsHTML}
                    </div>
                </div>
            `;

            messageWrapper.querySelector(".reply-btn").addEventListener("click", () => {
                activeReplyTargetId = msgId;
                if (replyTargetUsername) replyTargetUsername.textContent = msg.username;
                if (replyTargetSnippet) replyTargetSnippet.textContent = msg.text ? msg.text : "Attachment File";
                if (replyPreviewBar) replyPreviewBar.style.display = "flex";
                chatInput?.focus();
            });

            messageWrapper.querySelector(".forward-btn").addEventListener("click", () => {
                messageToForwardData = msg;
                openForwardTargetSelectionDialog();
            });

            const reactBtnEl = messageWrapper.querySelector(".react-btn");
            if (reactBtnEl) {
                reactBtnEl.addEventListener("click", (e) => {
                    e.stopPropagation();
                    document.querySelectorAll(".reaction-picker-tray").forEach(t => t.remove());
                    const tray = document.createElement("div");
                    tray.classList.add("reaction-picker-tray");
                    REACTION_EMOJI_SET.forEach(emoji => {
                        const span = document.createElement("span");
                        span.textContent = emoji;
                        span.addEventListener("click", (ev) => {
                            ev.stopPropagation();
                            toggleReaction(msgId, emoji);
                            tray.remove();
                        });
                        tray.appendChild(span);
                    });
                    messageWrapper.querySelector(".message").appendChild(tray);
                });
            }

            messageWrapper.querySelectorAll(".reaction-pill").forEach(pill => {
                pill.addEventListener("click", () => {
                    toggleReaction(msgId, pill.getAttribute("data-emoji"));
                });
            });

            if (!isBot && !isSystemNotice) {
                messageWrapper.querySelector(".delete-btn").addEventListener("click", () => {
                    if (confirm("Delete this message?")) database.ref(`channels/${currentChannel}/${msgId}`).remove();
                });
                messageWrapper.querySelector(".edit-btn").addEventListener("click", () => {
                    const newText = prompt("Edit your message:", msg.text);
                    if (newText !== null && newText.trim() !== "") {
                        database.ref(`channels/${currentChannel}/${msgId}`).update({
                            text: parseShortcodes(newText.trim()), edited: true
                        });
                    }
                });
            }
            chatMessagesContainer.appendChild(messageWrapper);
        });
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;

        if (channelKey === currentChannel) {
            setLastReadTimestamp(channelKey, Date.now());
            updateChannelUnreadDot(channelKey);
        }
    }

    function toggleReaction(msgId, emoji) {
        const reactionRef = database.ref(`channels/${currentChannel}/${msgId}/reactions/${emoji}/${mySessionUid}`);
        reactionRef.once("value", (snap) => {
            if (snap.exists()) {
                reactionRef.remove();
            } else {
                reactionRef.set(true);
            }
        });
    }

    function openForwardTargetSelectionDialog() {
        if (!forwardChannelListContainer) return;
        forwardChannelListContainer.innerHTML = "";
        if (forwardModal) forwardModal.style.display = "flex";

        database.ref("serverMetadata/channels").once("value", (snapshot) => {
            snapshot.forEach(childCh => {
                const chName = childCh.key;
                if (chName !== currentChannel) {
                    const row = document.createElement("div");
                    row.classList.add("forward-target-row");
                    row.textContent = `# ${chName}`;
                    row.addEventListener("click", () => {
                        if (messageToForwardData) {
                            const now = new Date();
                            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                            database.ref(`channels/${chName}`).push({
                                username: messageToForwardData.username,
                                avatarUrl: messageToForwardData.avatarUrl,
                                time: `Today at ${timeString}`,
                                timestamp: Date.now(),
                                text: messageToForwardData.text,
                                imageUrl: messageToForwardData.imageUrl || "",
                                forwarded: true, edited: false
                            });
                            if (forwardModal) forwardModal.style.display = "none";
                            messageToForwardData = null;
                            alert(`Message forwarded to #${chName}`);
                        }
                    });
                    forwardChannelListContainer.appendChild(row);
                }
            });
        });
    }

    function syncChannelMessages(channelKey) {
        if (currentLiveListener) database.ref(`channels/${currentChannel}`).off();
        currentLiveListener = database.ref(`channels/${channelKey}`).on('value', (snapshot) => {
            renderMessages(channelKey, snapshot);
        });
    }

    // --- 9. ADMINISTRATIVE COMMAND SYSTEM ---
    function handleAdminCommands(inputText) {
        const parts = inputText.trim().split(" ");
        const command = parts[0].toLowerCase();

        if (command === "!purge" || command === "!mute") {
            if (!ADMIN_USERNAMES.includes(currentUser.username.toLowerCase())) {
                postSystemMessage(`⛔ Access Denied: @${currentUser.username} does not have permission to run **${command}**.`);
                return true;
            }
        }

        if (command === "!purge") {
            const amount = parseInt(parts[1], 10);
            if (isNaN(amount) || amount <= 0) {
                postSystemMessage(`⚠️ Usage instruction error: Type **!purge 10** to wipe trailing logs.`);
                return true;
            }

            database.ref(`channels/${currentChannel}`).orderByKey().limitToLast(amount).once("value", (snapshot) => {
                if (!snapshot.exists()) return;
                let updates = {};
                snapshot.forEach(child => {
                    updates[child.key] = null;
                });
                database.ref(`channels/${currentChannel}`).update(updates).then(() => {
                    postSystemMessage(`🧹 Administrative Action: Wiped last ${amount} messages inside this log channel.`);
                });
            });
            return true;
        }

        if (command === "!mute") {
            let targetUser = parts.slice(1).join(" ").replace("@", "").trim();
            if (targetUser === "") {
                postSystemMessage(`⚠️ Usage instruction error: Type **!mute @Username** to toggle communication flags.`);
                return true;
            }
            
            const lowerTarget = targetUser.toLowerCase();
            if (localMuteRegistry[lowerTarget]) {
                database.ref(`mutedUsers/${lowerTarget}`).remove().then(() => {
                    postSystemMessage(`**🔊 Server Access Restored:** Unmuted @${targetUser}. They can now write messages.`);
                });
            } else {
                database.ref(`mutedUsers/${lowerTarget}`).set(true).then(() => {
                    postSystemMessage(`**🔇 Administrative Action:** Blocked user @${targetUser}. Messaging access restricted.`);
                });
            }
            return true;
        }
        return false;
    }

    function postSystemMessage(noticeText) {
        const now = new Date();
        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        database.ref(`channels/${currentChannel}`).push({
            username: "🛡️ System Core",
            avatarUrl: "",
            time: `Today at ${timeString}`,
            timestamp: Date.now(),
            text: noticeText,
            systemNotice: true
        });
    }

    // --- 10. TEXT MESSAGE INPUT ---
    if (chatInput) {
        chatInput.addEventListener("keydown", (event) => {
            if (event.key === "Enter" && chatInput.value.trim() !== "") {
                let rawInputText = chatInput.value.trim();

                const wasCommand = handleAdminCommands(rawInputText);
                if (wasCommand) {
                    chatInput.value = "";
                    return;
                }

                if (localMuteRegistry[currentUser.username.toLowerCase()]) {
                    alert("Mute lock detected. You are restricted from broadcasting to this server channel.");
                    chatInput.value = "";
                    return;
                }

                let messageText = parseShortcodes(rawInputText);
                const now = new Date();
                const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                let outboundPayload = {
                    username: currentUser.username,
                    avatarUrl: currentUser.avatarUrl,
                    time: `Today at ${timeString}`,
                    timestamp: Date.now(),
                    text: messageText,
                    edited: false
                };

                if (activeReplyTargetId && replyTargetUsername && replyTargetSnippet) {
                    outboundPayload.replyTo = {
                        username: replyTargetUsername.textContent,
                        snippet: replyTargetSnippet.textContent.substring(0, 40)
                    };
                }

                database.ref(`channels/${currentChannel}`).push(outboundPayload);
                database.ref(`typing/${mySessionUid}`).remove();
                clearTimeout(typingTimeout);

                chatInput.value = "";
                activeReplyTargetId = null;
                if (replyPreviewBar) replyPreviewBar.style.display = "none";

                if (currentChannel === "ai-bot-test") triggerSmartBotResponse(messageText);
            }
        });
    }

    // --- 11. AI SIMULATOR ---
    function triggerSmartBotResponse(userPrompt) {
        setTimeout(() => {
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const cleanPrompt = userPrompt.toLowerCase().trim();
            let aiReply = "";

            const mathExpression = cleanPrompt.replace(/[^0-9+\-*/().\s]/g, '');
            if (mathExpression && /^[\d\s+\-*/()]+$/.test(mathExpression)) {
                try {
                    const result = Function("\"use strict\"; return (" + mathExpression + ")")();
                    aiReply = `📊 Math analysis complete: **${userPrompt} = ${result}**`;
                } catch (e) {
                    aiReply = "I tried parsing that math equation, but the formatting seems off!";
                }
            } else if (cleanPrompt.includes("apple")) {
                aiReply = "🍎 Apples are typically **red**, **green**, or **yellow**! Green ones tend to be sour.";
            } else if (cleanPrompt.includes("hi") || cleanPrompt.includes("hello") || cleanPrompt.includes("yo")) {
                aiReply = `👋 Hello ${currentUser.username}! Ready to run queries. Ask me something or drop some math problems!`;
            } else if (cleanPrompt.includes("roblox")) {
                aiReply = "🎮 Roblox instance detected. Let me know what game loops you're script testing right now!";
            } else {
                aiReply = `🤖 I received your transmission: "${userPrompt}". My processing matrix is ready for structured data or math questions!`;
            }

            database.ref("channels/ai-bot-test").push({
                username: "🤖 Clyde-AI", avatarUrl: "", time: `Today at ${timeString}`, timestamp: Date.now(), text: aiReply, edited: false
            });
        }, 700);
    }

    // --- 12. TEXT HELPERS: escaping, mentions, links, previews ---
    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
    }

    function linkifyAndMentionify(text) {
        let safe = escapeHTML(text);
        safe = safe.replace(/@([a-zA-Z0-9_\-]{2,32})/g, (match, name) => `<span class="mention">@${name}</span>`);
        safe = safe.replace(/(https?:\/\/[^\s<]+)/g, (url) => {
            const cleanUrl = url.replace(/[.,!?)]+$/, "");
            return `<a href="${cleanUrl}" target="_blank" rel="noopener noreferrer">${cleanUrl}</a>`;
        });
        return safe;
    }

    function buildLinkPreviewHTML(text) {
        if (!text) return "";
        const urlMatch = text.match(/https?:\/\/[^\s<]+/);
        if (!urlMatch) return "";
        const url = urlMatch[0].replace(/[.,!?)]+$/, "");
        const safeUrl = escapeHTML(url);

        if (/\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url)) {
            return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-preview-card">
                        <img src="${safeUrl}" loading="lazy">
                    </a>`;
        }

        const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{6,15})/);
        if (ytMatch) {
            const videoId = ytMatch[1];
            return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="link-preview-card">
                        <img src="https://img.youtube.com/vi/${videoId}/hqdefault.jpg" loading="lazy">
                        <div class="link-preview-label">▶ YouTube Video</div>
                    </a>`;
        }

        return "";
    }
});
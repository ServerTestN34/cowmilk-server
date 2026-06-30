document.addEventListener("DOMContentLoaded", () => {
    
    // 1. FIREBASE SETUP
    const firebaseConfig = {
        databaseURL: "https://cowmilk-chat-default-rtdb.firebaseio.com"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // 2. ACTIVE SYSTEM USER STATE
    let currentUser = {
        username: "Cowmilk",
        avatar: "#5865f2",
        status: "🎮 ROBLOX"
    };
    let currentChannel = "welcome-and-rules";
    let currentLiveListener = null;

    // 3. ELEMENT SELECTORS
    const channels = document.querySelectorAll(".channel");
    const channelHeaderTitle = document.getElementById("headerChannelName");
    const chatInput = document.getElementById("messageInputField");
    const chatMessagesContainer = document.querySelector(".chat-messages");
    
    const appContainer = document.getElementById("appContainer");
    const menuToggleBtn = document.getElementById("menuToggleBtn");
    const menuOverlay = document.getElementById("menuOverlay");

    // Profile Modal Elements
    const identityModal = document.getElementById("identityModal");
    const profileButtons = document.querySelectorAll(".profile-select-btn");
    const memberListGrid = document.getElementById("memberListGrid");

    // Emoji Box Selectors
    const emojiMenuBtn = document.getElementById("emojiMenuBtn");
    const emojiPickerTray = document.getElementById("emojiPickerTray");

    // --- LOGIC: IDENTITY SELECTOR SYSTEM ---
    profileButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            currentUser.username = btn.getAttribute("data-user");
            currentUser.avatar = btn.getAttribute("data-avatar");
            currentUser.status = btn.getAttribute("data-game");

            // Apply user identity values globally
            document.getElementById("globalUsername").textContent = currentUser.username;
            document.getElementById("globalUserStatus").textContent = currentUser.status;
            document.getElementById("globalUserAvatar").style.backgroundColor = currentUser.avatar;

            // Hide Picker and open server application
            identityModal.style.display = "none";
            
            // Build the right-hand active participant card layout lists
            renderMemberList();
            syncChannelMessages(currentChannel);
        });
    });

    // --- LOGIC: RENDERING STATIC MEMBER DASHBOARD CARD BLOCKS ---
    function renderMemberList() {
        memberListGrid.innerHTML = `
            <div class="member-card">
                <div class="member-avatar" style="background-color: #5865f2;"></div>
                <div>
                    <div class="member-name">Cowmilk 👑</div>
                    <div class="member-game">🎮 ROBLOX</div>
                </div>
            </div>
            <div class="member-card">
                <div class="member-avatar" style="background-color: #e67e22;"></div>
                <div>
                    <div class="member-name">Guest Racer</div>
                    <div class="member-game">🏎️ Mario Kart</div>
                </div>
            </div>
            <div class="member-card">
                <div class="member-avatar" style="background-color: #9b59b6;"></div>
                <div>
                    <div class="member-name">🤖 Clyde-AI</div>
                    <div class="member-game">⚙️ Core Matrix</div>
                </div>
            </div>
        `;
    }

    // --- MOBILE ASSIST ACTIONS ---
    menuToggleBtn.addEventListener("click", () => appContainer.classList.add("menu-open"));
    menuOverlay.addEventListener("click", () => appContainer.classList.remove("menu-open"));

    // --- EMOJI INPUT SELECTION INTERACTIVE HOOKS ---
    emojiMenuBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        emojiPickerTray.classList.toggle("active");
    });

    document.querySelectorAll(".emoji-picker-tray span").forEach(emojiSpan => {
        emojiSpan.addEventListener("click", () => {
            chatInput.value += emojiSpan.textContent; // Insert emoji at end of text string
            chatInput.focus();
        });
    });

    // Hide drawer automatically if anywhere else is clicked
    document.addEventListener("click", () => emojiPickerTray.classList.remove("active"));

    // --- FIREBASE LOGIC: RENDERING CLOUD DATA BLOCKS ---
    function renderMessages(channelKey, snapshot) {
        chatMessagesContainer.innerHTML = "";

        const splash = document.createElement("div");
        splash.classList.add("welcome-splash");
        splash.innerHTML = `
            <h1>Welcome to<br>#${channelKey}</h1>
            <p>This is the start of the #${channelKey} channel.</p>
            <div class="date-divider"><span>June 2026</span></div>
        `;
        chatMessagesContainer.appendChild(splash);

        if (!snapshot.exists()) return;

        snapshot.forEach(childSnapshot => {
            const msgId = childSnapshot.key;
            const msg = childSnapshot.val();
            
            const msgElement = document.createElement("div");
            msgElement.classList.add("message");

            const isBot = msg.username.includes("🤖");
            const avatarColor = msg.avatarColor || (isBot ? "#9b59b6" : "#3ba55d");

            // Append (edited) tag if edited configuration flag evaluate true
            const editedBadgeHTML = msg.edited ? `<span class="msg-edited-tag">(edited)</span>` : '';

            // Only allow the creator of the text to alter their records
            const actionsHTML = (msg.username === currentUser.username && !isBot) ? `
                <div class="message-actions">
                    <button class="action-btn edit-btn">✏️</button>
                    <button class="action-btn delete-btn">🗑️</button>
                </div>
            ` : '';

            msgElement.innerHTML = `
                <div class="message-avatar" style="background-color: ${avatarColor} !important;"></div>
                <div class="message-content">
                    <div class="message-meta">
                        <span class="msg-username" style="color: ${isBot ? '#9b59b6' : '#ffffff'}">${msg.username}</span>
                        <span class="msg-timestamp">${msg.time} ${editedBadgeHTML}</span>
                    </div>
                    <p class="msg-text">${escapeHTML(msg.text)}</p>
                </div>
                ${actionsHTML}
            `;

            if (msg.username === currentUser.username && !isBot) {
                msgElement.querySelector(".delete-btn").addEventListener("click", () => {
                    if (confirm("Delete this message permanently?")) {
                        database.ref(`channels/${currentChannel}/${msgId}`).remove();
                    }
                });

                msgElement.querySelector(".edit-btn").addEventListener("click", () => {
                    const newText = prompt("Edit your message:", msg.text);
                    if (newText !== null && newText.trim() !== "") {
                        database.ref(`channels/${currentChannel}/${msgId}`).update({
                            text: newText.trim(),
                            edited: true // Set flag to true
                        });
                    }
                });
            }

            chatMessagesContainer.appendChild(msgElement);
        });

        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // --- PIPELINE MANAGER ---
    function syncChannelMessages(channelKey) {
        if (currentLiveListener) {
            database.ref(`channels/${currentChannel}`).off();
        }
        currentLiveListener = database.ref(`channels/${channelKey}`).on('value', (snapshot) => {
            renderMessages(channelKey, snapshot);
        });
    }

    // --- CHANNELS EVENT CONFIGS ---
    channels.forEach(channel => {
        channel.addEventListener("click", () => {
            document.querySelector(".channel.active")?.classList.remove("active");
            channel.classList.add("active");
            
            const channelName = channel.textContent.replace('# ', '').trim();
            currentChannel = channelName;
            
            channelHeaderTitle.textContent = channelName;
            chatInput.placeholder = `Message #${channelName}`;

            appContainer.classList.remove("menu-open");
            syncChannelMessages(currentChannel);
        });
    });

    // --- SEND TRIGGER HOOK ---
    chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && chatInput.value.trim() !== "") {
            const messageText = chatInput.value.trim();
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            database.ref(`channels/${currentChannel}`).push({
                username: currentUser.username,
                avatarColor: currentUser.avatar,
                time: `Today at ${timeString}`,
                text: messageText,
                edited: false
            });

            chatInput.value = "";

            if (currentChannel === "ai-bot-test") {
                triggerSmartBotResponse(messageText);
            }
        }
    });

    // --- BOT CORE LOGIC ---
    function triggerSmartBotResponse(userPrompt) {
        setTimeout(() => {
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const cleanPrompt = userPrompt.toLowerCase().trim();
            
            let aiReply = "";

            const mathExpression = cleanPrompt.replace(/[^0-9+\-*/().\s]/g, '');
            if (mathExpression && /^[\d\s+\-*/()]+$/.test(mathExpression)) {
                try {
                    const result = Function(`"use strict"; return (${mathExpression})`)();
                    aiReply = `📊 Math analysis complete: **${userPrompt} = ${result}**`;
                } catch (e) {
                    aiReply = "I tried parsing that math equation, but the formatting seems off!";
                }
            } 
            else if (cleanPrompt.includes("apple")) {
                aiReply = "🍎 Apples are typically **red**, **green**, or **yellow**! Green ones tend to be sour.";
            } else if (cleanPrompt.includes("hi") || cleanPrompt.includes("hello") || cleanPrompt.includes("yo")) {
                aiReply = `👋 Hello ${currentUser.username}! Ready to run queries. Ask me something or drop some math problems!`;
            } else if (cleanPrompt.includes("roblox")) {
                aiReply = "🎮 Roblox instance detected. Let me know what game loops you're script testing right now!";
            } else if (cleanPrompt.includes("color")) {
                aiReply = "🎨 Visual data request: What object's color spectrum are you inquiring about?";
            } else {
                aiReply = `🤖 I received your transmission: "${userPrompt}". My processing matrix is ready for structured data or math questions!`;
            }

            database.ref("channels/ai-bot-test").push({
                username: "🤖 Clyde-AI",
                time: `Today at ${timeString}`,
                text: aiReply,
                edited: false
            });

        }, 700);
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
});
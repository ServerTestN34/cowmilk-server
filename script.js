document.addEventListener("DOMContentLoaded", () => {
    
    // 1. FIREBASE SETUP
    const firebaseConfig = {
        databaseURL: "https://cowmilk-chat-default-rtdb.firebaseio.com"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // 2. STATE MANAGEMENT
    let currentChannel = "welcome-and-rules";
    let currentLiveListener = null;

    // 3. UI ELEMENT SELECTORS
    const channels = document.querySelectorAll(".channel");
    const channelHeaderTitle = document.getElementById("headerChannelName");
    const chatInput = document.getElementById("messageInputField");
    const chatMessagesContainer = document.querySelector(".chat-messages");
    
    const appContainer = document.getElementById("appContainer");
    const menuToggleBtn = document.getElementById("menuToggleBtn");
    const menuOverlay = document.getElementById("menuOverlay");

    // --- DRAWER LAYOUT TOGGLES ---
    menuToggleBtn.addEventListener("click", () => appContainer.classList.add("menu-open"));
    menuOverlay.addEventListener("click", () => appContainer.classList.remove("menu-open"));

    // --- FUNCTION: RENDER CHAT FEED WITH MOD TOOLS ---
    function renderMessages(channelKey, snapshot) {
        chatMessagesContainer.innerHTML = "";

        // Header Splash Layout
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
            const msgId = childSnapshot.key; // Unique Firebase string hash code
            const msg = childSnapshot.val();
            
            const msgElement = document.createElement("div");
            msgElement.classList.add("message");
            msgElement.setAttribute("data-id", msgId);

            const isBot = msg.username.includes("🤖");
            const avatarColor = isBot ? "#9b59b6" : "#3ba55d";

            // Tool menu buttons (only render for non-bot messages so users can manage their text blocks)
            const actionButtonsHTML = !isBot ? `
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
                        <span class="msg-timestamp">${msg.time}</span>
                    </div>
                    <p class="msg-text">${escapeHTML(msg.text)}</p>
                </div>
                ${actionButtonsHTML}
            `;

            // Attach operational click actions inside the elements
            if (!isBot) {
                msgElement.querySelector(".delete-btn").addEventListener("click", () => {
                    if (confirm("Delete this message permanently?")) {
                        database.ref(`channels/${currentChannel}/${msgId}`).remove();
                    }
                });

                msgElement.querySelector(".edit-btn").addEventListener("click", () => {
                    const currentText = msg.text;
                    const newText = prompt("Edit your message:", currentText);
                    if (newText !== null && newText.trim() !== "") {
                        database.ref(`channels/${currentChannel}/${msgId}`).update({
                            text: newText.trim()
                        });
                    }
                });
            }

            chatMessagesContainer.appendChild(msgElement);
        });

        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // --- FIREBASE SYNC CONTROL ---
    function syncChannelMessages(channelKey) {
        if (currentLiveListener) {
            database.ref(`channels/${currentChannel}`).off();
        }
        currentLiveListener = database.ref(`channels/${channelKey}`).on('value', (snapshot) => {
            renderMessages(channelKey, snapshot);
        });
    }

    // --- INTERACTIVE: CHANNEL SWITCHING WITH AUTO-CLOSE DRAWER ---
    channels.forEach(channel => {
        channel.addEventListener("click", () => {
            document.querySelector(".channel.active")?.classList.remove("active");
            channel.classList.add("active");
            
            const channelName = channel.textContent.replace('# ', '').trim();
            currentChannel = channelName;
            
            channelHeaderTitle.textContent = channelName;
            chatInput.placeholder = `Message #${channelName}`;

            // FIX: Instantly close menu viewports on channel tap
            appContainer.classList.remove("menu-open");

            syncChannelMessages(currentChannel);
        });
    });

    // --- INTERACTIVE: SEND ENTER MESSAGES ---
    chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && chatInput.value.trim() !== "") {
            const messageText = chatInput.value.trim();
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            database.ref(`channels/${currentChannel}`).push({
                username: "Cowmilk",
                time: `Today at ${timeString}`,
                text: messageText
            });

            chatInput.value = "";

            if (currentChannel === "ai-bot-test") {
                triggerSmartBotResponse(messageText);
            }
        }
    });

    // --- AI COMMAND RESPONSE PARSER ---
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
                aiReply = "👋 Hello Cowmilk! Ready to run queries. Ask me something or drop some math problems!";
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
                text: aiReply
            });

        }, 700);
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    syncChannelMessages(currentChannel);
});
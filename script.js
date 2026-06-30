document.addEventListener("DOMContentLoaded", () => {
    
    // 1. FIREBASE CONFIGURATION (Using your actual link)
    const firebaseConfig = {
        databaseURL: "https://cowmilk-chat-default-rtdb.firebaseio.com"
    };
    
    // Initialize Firebase
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // 2. APP STATE
    let currentChannel = "welcome-and-rules";

    // 3. UI DOM ELEMENTS
    const channels = document.querySelectorAll(".channel");
    const channelHeaderTitle = document.getElementById("headerChannelName");
    const chatInput = document.getElementById("messageInputField");
    const chatMessagesContainer = document.querySelector(".chat-messages");
    
    // Mobile Element SELECTORS 
    const appContainer = document.getElementById("appContainer");
    const menuToggleBtn = document.getElementById("menuToggleBtn");
    const menuOverlay = document.getElementById("menuOverlay");

    // --- MOBILE SCREEN NAVIGATION TOGGLES ---
    menuToggleBtn.addEventListener("click", () => {
        appContainer.classList.add("menu-open");
    });

    menuOverlay.addEventListener("click", () => {
        appContainer.classList.remove("menu-open");
    });

    // --- FUNCTION: RENDER CHAT WINDOW ---
    function renderMessages(channelKey, messagesSnapshot) {
        chatMessagesContainer.innerHTML = "";

        // Welcome Splash Header
        const splash = document.createElement("div");
        splash.classList.add("welcome-splash");
        splash.innerHTML = `
            <h1>Welcome to<br>#${channelKey}</h1>
            <p>This is the start of the #${channelKey} channel.</p>
            <div class="date-divider"><span>June 2026</span></div>
        `;
        chatMessagesContainer.appendChild(splash);

        // Loop through and build database messages
        if (messagesSnapshot) {
            messagesSnapshot.forEach(childSnapshot => {
                const msg = childSnapshot.val();
                const msgElement = document.createElement("div");
                msgElement.classList.add("message");

                const avatarColor = msg.username.includes("🤖") ? "#9b59b6" : "#3ba55d";

                msgElement.innerHTML = `
                    <div class="message-avatar" style="background-color: ${avatarColor} !important;"></div>
                    <div class="message-content">
                        <div class="message-meta">
                            <span class="msg-username" style="color: ${msg.username.includes('🤖') ? '#9b59b6' : '#ffffff'}">${msg.username}</span>
                            <span class="msg-timestamp">${msg.time}</span>
                        </div>
                        <p class="msg-text">${escapeHTML(msg.text)}</p>
                    </div>
                `;
                chatMessagesContainer.appendChild(msgElement);
            });
        }

        // Auto Scroll to Bottom
        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // --- FIREBASE SYNC: LISTEN FOR LIVE MESSAGES ---
    let currentLiveListener = null;

    function syncChannelMessages(channelKey) {
        if (currentLiveListener) {
            database.ref(`channels/${currentChannel}`).off();
        }

        currentLiveListener = database.ref(`channels/${channelKey}`).on('value', (snapshot) => {
            renderMessages(channelKey, snapshot);
        });
    }

    // --- INTERACTIVE: CHANNEL SWITCHING ---
    channels.forEach(channel => {
        channel.addEventListener("click", () => {
            document.querySelector(".channel.active")?.classList.remove("active");
            channel.classList.add("active");
            
            const channelName = channel.textContent.replace('# ', '').trim();
            currentChannel = channelName;
            
            channelHeaderTitle.textContent = channelName;
            chatInput.placeholder = `Message #${channelName}`;

            // Close side drawers on selection if on mobile display modes
            appContainer.classList.remove("menu-open");

            // Pull live channel stream
            syncChannelMessages(currentChannel);
        });
    });

    // --- INTERACTIVE: SEND MESSAGE ON ENTER ---
    chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && chatInput.value.trim() !== "") {
            const messageText = chatInput.value.trim();
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Push to public cloud database
            database.ref(`channels/${currentChannel}`).push({
                username: "Cowmilk",
                time: `Today at ${timeString}`,
                text: messageText
            });

            chatInput.value = "";

            // Bot response trigger if in testing grounds
            if (currentChannel === "ai-bot-test") {
                triggerSmartBotResponse(messageText);
            }
        }
    });

    // --- SMART BOT LOGIC ENGINE ---
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
document.addEventListener("DOMContentLoaded", () => {
    
    // 1. DATA STORAGE
    const channelData = {
        "welcome-and-rules": [
            { username: "Cowmilk", time: "6/27/26, 3:31 PM", text: "hi", type: "text" },
            { username: "Cowmilk", time: "6/30/26, 3:17 PM", text: "https://picsum.photos/500/340?random=1", type: "meme" }
        ],
        "announcements": [
            { username: "Cowmilk", time: "Today at 12:05 PM", text: "📢 Server rules update: Keep the memes spicy but respectful.", type: "text" }
        ],
        "resources": [
            { username: "Cowmilk", time: "Yesterday at 4:12 PM", text: "Check out our GitHub repository link here later!", type: "text" }
        ],
        "memes": [
            { username: "Cowmilk", time: "Today at 1:40 PM", text: "Post your brain rot animations here.", type: "text" }
        ],
        "general-chat": [
            { username: "Cowmilk", time: "Today at 2:00 PM", text: "yo what's up everyone", type: "text" }
        ],
        "ai-bot-test": [
            { username: "🤖 Clyde-AI", time: "System", text: "Hello! I am your local test bot. Ask me a math problem (like 2+2), ask me about colors, or say hello!", type: "text" }
        ]
    };

    let currentChannel = "welcome-and-rules";

    const channels = document.querySelectorAll(".channel");
    const channelHeaderTitle = document.querySelector(".channel-header .header-left");
    const chatInput = document.querySelector(".chat-input-wrapper input");
    const chatMessagesContainer = document.querySelector(".chat-messages");

    function renderMessages(channelKey) {
        chatMessagesContainer.innerHTML = "";

        const splash = document.createElement("div");
        splash.classList.add("welcome-splash");
        splash.innerHTML = `
            <h1>Welcome to<br>#${channelKey}</h1>
            <p>This is the start of the #${channelKey} channel.</p>
            <div class="date-divider"><span>June 2026</span></div>
        `;
        chatMessagesContainer.appendChild(splash);

        const messages = channelData[channelKey] || [];
        messages.forEach(msg => {
            const msgElement = document.createElement("div");
            msgElement.classList.add("message");

            const avatarColor = msg.username.includes("🤖") ? "#9b59b6" : "#3ba55d";

            if (msg.type === "text") {
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
            } else if (msg.type === "meme") {
                msgElement.innerHTML = `
                    <div class="message-avatar" style="background-color: ${avatarColor} !important;"></div>
                    <div class="message-content">
                        <div class="message-meta">
                            <span class="msg-username">${msg.username}</span>
                            <span class="msg-timestamp">${msg.time}</span>
                        </div>
                        <div class="meme-embed">
                            <img src="${msg.text}" alt="Meme Content">
                        </div>
                    </div>
                `;
            }
            chatMessagesContainer.appendChild(msgElement);
        });

        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // --- CHANNEL SWITCHING ---
    channels.forEach(channel => {
        channel.addEventListener("click", () => {
            document.querySelector(".channel.active")?.classList.remove("active");
            channel.classList.add("active");
            
            const channelName = channel.textContent.replace('# ', '').trim();
            currentChannel = channelName;
            
            channelHeaderTitle.innerHTML = `<span class="hashtag">#</span> ${channelName}`;
            chatInput.placeholder = `Message #${channelName}`;

            renderMessages(currentChannel);
        });
    });

    // --- SEND MESSAGE & TRIGGER AI LOGIC ---
    chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && chatInput.value.trim() !== "") {
            const messageText = chatInput.value.trim();
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            if (!channelData[currentChannel]) {
                channelData[currentChannel] = [];
            }

            channelData[currentChannel].push({
                username: "Cowmilk",
                time: `Today at ${timeString}`,
                text: messageText,
                type: "text"
            });

            renderMessages(currentChannel);
            chatInput.value = "";

            if (currentChannel === "ai-bot-test") {
                triggerSmartBotResponse(messageText);
            }
        }
    });

    // --- NEW FIXED SMART BOT RESPONSE LOGIC ---
    function triggerSmartBotResponse(userPrompt) {
        setTimeout(() => {
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const cleanPrompt = userPrompt.toLowerCase().trim();
            
            let aiReply = "";

            // 1. Math Evaluator (Solves 2+2, 5*10, etc.)
            const mathExpression = cleanPrompt.replace(/[^0-9+\-*/().\s]/g, '');
            if (mathExpression && /^[\d\s+\-*/()]+$/.test(mathExpression)) {
                try {
                    // Evaluates basic math inputs securely
                    const result = Function(`"use strict"; return (${mathExpression})`)();
                    aiReply = `📊 Math analysis complete: **${userPrompt} = ${result}**`;
                } catch (e) {
                    aiReply = "I tried parsing that math equation, but the formatting seems off!";
                }
            } 
            // 2. Contextual Knowledge Engine
            else if (cleanPrompt.includes("apple")) {
                aiReply = "🍎 Apples are typically **red**, **green**, or **yellow**! Green ones tend to be sour.";
            } else if (cleanPrompt.includes("hi") || cleanPrompt.includes("hello") || cleanPrompt.includes("yo")) {
                aiReply = "👋 Hello Cowmilk! Ready to run queries. Ask me something or drop some math problems!";
            } else if (cleanPrompt.includes("roblox")) {
                aiReply = "🎮 Roblox instance detected. Let me know what game loops you're script testing right now!";
            } else if (cleanPrompt.includes("color")) {
                aiReply = "🎨 Visual data request: What object's color spectrum are you inquiring about?";
            } else {
                // Dynamic mirrored response if it doesn't hit a key filter
                aiReply = `🤖 I received your transmission: "${userPrompt}". My processing matrix is ready for structured data or math questions!`;
            }

            channelData["ai-bot-test"].push({
                username: "🤖 Clyde-AI",
                time: `Today at ${timeString}`,
                text: aiReply,
                type: "text"
            });

            renderMessages("ai-bot-test");
        }, 500);
    }

    function escapeHTML(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    renderMessages(currentChannel);
});
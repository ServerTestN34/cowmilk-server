document.addEventListener("DOMContentLoaded", () => {
    
    // 1. FIREBASE CONFIGURATION
    const firebaseConfig = {
        databaseURL: "https://cowmilk-chat-default-rtdb.firebaseio.com"
    };
    firebase.initializeApp(firebaseConfig);
    const database = firebase.database();

    // 2. RUNTIME SYSTEM APP STATE
    let currentUser = { username: "Cowmilk", avatarUrl: "", status: "🎮 ROBLOX" };
    let currentChannel = "welcome-and-rules";
    let currentLiveListener = null;
    
    // Multi-thread Message Routing References
    let activeReplyTargetId = null;
    let messageToForwardData = null;

    // TEXT SHORTCODE DICTIONARY
    const EMOJI_SHORTCODES = {
        ":sob:": "😭",
        ":smile:": "😀",
        ":joy:": "😂",
        ":fire:": "🔥",
        ":eyes:": "👀",
        ":100:": "💯",
        ":milk:": "🥛"
    };

    // 3. UI ELEMENT SELECTORS
    const channels = document.querySelectorAll(".channel");
    const channelHeaderTitle = document.getElementById("headerChannelName");
    const chatInput = document.getElementById("messageInputField");
    const chatMessagesContainer = document.querySelector(".chat-messages");
    
    const appContainer = document.getElementById("appContainer");
    const menuToggleBtn = document.getElementById("menuToggleBtn");
    const menuOverlay = document.getElementById("menuOverlay");

    // Profile Setup DOM Elements
    const identityModal = document.getElementById("identityModal");
    const confirmProfileBtn = document.getElementById("confirmProfileBtn");
    const modalUsernameInput = document.getElementById("modalUsernameInput");
    const modalAvatarInput = document.getElementById("modalAvatarInput");
    const modalStatusInput = document.getElementById("modalStatusInput");
    const memberListGrid = document.getElementById("memberListGrid");

    // Forward Dialog Selectors
    const forwardModal = document.getElementById("forwardModal");
    const forwardChannelListContainer = document.getElementById("forwardChannelListContainer");
    const closeForwardModalBtn = document.getElementById("closeForwardModalBtn");

    // Reply Mode UI Elements
    const replyPreviewBar = document.getElementById("replyPreviewBar");
    const replyTargetUsername = document.getElementById("replyTargetUsername");
    const replyTargetSnippet = document.getElementById("replyTargetSnippet");
    const cancelReplyBtn = document.getElementById("cancelReplyBtn");

    // Media Upload Element
    const imageAttachmentFileInput = document.getElementById("imageAttachmentFileInput");

    // Emoji Box Selectors
    const emojiMenuBtn = document.getElementById("emojiMenuBtn");
    const emojiPickerTray = document.getElementById("emojiPickerTray");

    // --- INITIALIZE ACCOUNT SETUP ON SUBMIT ---
    confirmProfileBtn.addEventListener("click", () => {
        const enteredName = modalUsernameInput.value.trim();
        const enteredAvatar = modalAvatarInput.value.trim();
        const enteredStatus = modalStatusInput.value.trim();

        if(enteredName === "") return alert("Username field cannot be blank.");

        currentUser.username = enteredName;
        currentUser.avatarUrl = enteredAvatar;
        currentUser.status = enteredStatus;

        // Apply Custom Image Node or fallback to default styled letter layout block
        const imgAvatar = document.getElementById("globalUserAvatar");
        const placeholderAvatar = document.getElementById("globalUserAvatarPlaceholder");
        
        if (currentUser.avatarUrl !== "") {
            imgAvatar.src = currentUser.avatarUrl;
            imgAvatar.style.display = "block";
            placeholderAvatar.style.display = "none";
        } else {
            placeholderAvatar.textContent = currentUser.username.charAt(0).toUpperCase();
            placeholderAvatar.style.backgroundColor = "#5865f2";
            placeholderAvatar.style.display = "flex";
            imgAvatar.style.display = "none";
        }

        document.getElementById("globalUsername").textContent = currentUser.username;
        document.getElementById("globalUserStatus").textContent = currentUser.status;

        identityModal.style.display = "none";
        
        renderMemberList();
        syncChannelMessages(currentChannel);
    });

    // --- RE-RENDER GLOBAL USER DIRECTORY ---
    function renderMemberList() {
        // Build self profile layout strings dynamically
        const selfAvatarHTML = currentUser.avatarUrl !== "" 
            ? `<img class="member-avatar-img" src="${currentUser.avatarUrl}">` 
            : `<div class="member-avatar" style="background-color:#5865f2; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-weight:bold; color:white;">${currentUser.username.charAt(0).toUpperCase()}</div>`;

        memberListGrid.innerHTML = `
            <div class="member-card">
                ${selfAvatarHTML}
                <div>
                    <div class="member-name">${currentUser.username} <small style="color:#5865f2;">(You)</small></div>
                    <div class="member-game">${currentUser.status}</div>
                </div>
            </div>
            <div class="member-card">
                <div class="member-avatar" style="background-color: #9b59b6; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white;">🤖</div>
                <div>
                    <div class="member-name">🤖 Clyde-AI</div>
                    <div class="member-game">⚙️ Core Matrix</div>
                </div>
            </div>
        `;
    }

    // --- SHORTCODE PARSER FUNCTION ---
    function parseShortcodes(text) {
        let processedText = text;
        for (const [code, emoji] of Object.entries(EMOJI_SHORTCODES)) {
            processedText = processedText.replace(new RegExp(code, 'gi'), emoji);
        }
        return processedText;
    }

    // --- FILE SYSTEM LOCAL BASE64 READER TRICK (SEND PICTURES) ---
    imageAttachmentFileInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            alert("Only image attachments are allowed.");
            return;
        }

        const fileReader = new FileReader();
        fileReader.onload = () => {
            const rawBase64String = fileReader.result;
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            // Send base64 payload to database instance
            database.ref(`channels/${currentChannel}`).push({
                username: currentUser.username,
                avatarUrl: currentUser.avatarUrl,
                time: `Today at ${timeString}`,
                text: "", 
                imageUrl: rawBase64String, // Store image string node
                edited: false
            });
            imageAttachmentFileInput.value = ""; // Reset input
        };
        fileReader.readAsDataURL(file);
    });

    // --- MOBILE SIDEBAR NAVIGATION ---
    menuToggleBtn.addEventListener("click", () => appContainer.classList.add("menu-open"));
    menuOverlay.addEventListener("click", () => appContainer.classList.remove("menu-open"));

    // --- INTERACTIVE KEYBOARD EMOJI SELECTION ---
    emojiMenuBtn.addEventListener("click", (e) => { e.stopPropagation(); emojiPickerTray.classList.toggle("active"); });
    document.querySelectorAll(".emoji-picker-tray span").forEach(emojiSpan => {
        emojiSpan.addEventListener("click", () => {
            chatInput.value += emojiSpan.textContent;
            chatInput.focus();
        });
    });
    document.addEventListener("click", () => emojiPickerTray.classList.remove("active"));

    // --- INTERACTIVE LAYER: CANCEL REPLY ---
    cancelReplyBtn.addEventListener("click", () => {
        activeReplyTargetId = null;
        replyPreviewBar.style.display = "none";
    });

    // --- INTERACTIVE LAYER: CLOSE FORWARD OPTIONS ---
    closeForwardModalBtn.addEventListener("click", () => {
        forwardModal.style.display = "none";
        messageToForwardData = null;
    });

    // --- STREAM PIPELINE LOGIC: RENDER CHAT VIEWER CELLS ---
    function renderMessages(channelKey, snapshot) {
        chatMessagesContainer.innerHTML = "";

        if (!snapshot.exists()) return;

        snapshot.forEach(childSnapshot => {
            const msgId = childSnapshot.key;
            const msg = childSnapshot.val();
            
            const messageWrapper = document.createElement("div");
            messageWrapper.classList.add("message-wrapper-block");

            // Build Reply Quote layout blocks if reference keys point to parent text data
            let replyLineHTML = "";
            if (msg.replyTo) {
                replyLineHTML = `
                    <div class="message-reply-header">
                        💬 replied to <strong>${msg.replyTo.username}</strong>: "${escapeHTML(msg.replyTo.snippet)}"
                    </div>
                `;
            }

            const isBot = msg.username.includes("🤖");
            const editedBadgeHTML = msg.edited ? `<span class="msg-edited-tag">(edited)</span>` : '';
            const forwardedBadgeHTML = msg.forwarded ? `<span class="msg-forwarded-tag">Forwarded</span>` : '';

            // Render Embedded Image Blocks if field attributes detect data strings
            let mediaEmbedHTML = msg.imageUrl ? `<img src="${msg.imageUrl}" class="msg-image-embed">` : '';

            const userAvatarHTML = msg.avatarUrl && msg.avatarUrl !== "" 
                ? `<img class="message-avatar" src="${msg.avatarUrl}" style="object-fit:cover;">` 
                : `<div class="message-avatar" style="background-color:#3ba55d; display:flex; align-items:center; justify-content:center; font-weight:bold; color:white; font-size:16px;">${msg.username.charAt(0).toUpperCase()}</div>`;

            // Action Utility Row Grid Panels Setup
            const modifyToolsHTML = (msg.username === currentUser.username && !isBot) ? `
                <button class="action-btn edit-btn" title="Edit Message">✏️</button>
                <button class="action-btn delete-btn" title="Delete Message">🗑️</button>
            ` : '';

            messageWrapper.innerHTML = `
                ${replyLineHTML}
                <div class="message" data-id="${msgId}">
                    ${userAvatarHTML}
                    <div class="message-content">
                        <div class="message-meta">
                            <span class="msg-username">${msg.username}</span>
                            <span class="msg-timestamp">${msg.time} ${editedBadgeHTML} ${forwardedBadgeHTML}</span>
                        </div>
                        <p class="msg-text">${escapeHTML(msg.text)}</p>
                        ${mediaEmbedHTML}
                    </div>
                    <div class="message-actions">
                        <button class="action-btn reply-btn" title="Reply to Message">↩️</button>
                        <button class="action-btn forward-btn" title="Forward Message">➡️</button>
                        ${modifyToolsHTML}
                    </div>
                </div>
            `;

            // ATTACH CLICK HOOKS TO MESSAGE ACTIONS
            messageWrapper.querySelector(".reply-btn").addEventListener("click", () => {
                activeReplyTargetId = msgId;
                replyTargetUsername.textContent = msg.username;
                replyTargetSnippet.textContent = msg.text ? msg.text : "Image File Attachment";
                replyPreviewBar.style.display = "flex";
                chatInput.focus();
            });

            messageWrapper.querySelector(".forward-btn").addEventListener("click", () => {
                messageToForwardData = msg;
                openForwardTargetSelectionDialog();
            });

            if (msg.username === currentUser.username && !isBot) {
                messageWrapper.querySelector(".delete-btn").addEventListener("click", () => {
                    if (confirm("Delete this message permanently?")) {
                        database.ref(`channels/${currentChannel}/${msgId}`).remove();
                    }
                });

                messageWrapper.querySelector(".edit-btn").addEventListener("click", () => {
                    const newText = prompt("Edit your message:", msg.text);
                    if (newText !== null && newText.trim() !== "") {
                        database.ref(`channels/${currentChannel}/${msgId}`).update({
                            text: parseShortcodes(newText.trim()), // parse text shortcodes on edit too
                            edited: true
                        });
                    }
                });
            }

            chatMessagesContainer.appendChild(messageWrapper);
        });

        chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
    }

    // --- SETUP FORWARDING ROUTING MENU MODAL ---
    function openForwardTargetSelectionDialog() {
        forwardChannelListContainer.innerHTML = "";
        forwardModal.style.display = "flex";

        channels.forEach(ch => {
            const chName = ch.textContent.replace('# ', '').trim();
            // List all channel alternatives
            if (chName !== currentChannel) {
                const row = document.createElement("div");
                row.classList.add("forward-target-row");
                row.textContent = `# ${chName}`;
                
                row.addEventListener("click", () => {
                    if (messageToForwardData) {
                        const now = new Date();
                        const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                        // Push cloned record to target channel database node path
                        database.ref(`channels/${chName}`).push({
                            username: messageToForwardData.username,
                            avatarUrl: messageToForwardData.avatarUrl,
                            time: `Today at ${timeString}`,
                            text: messageToForwardData.text,
                            imageUrl: messageToForwardData.imageUrl || "",
                            forwarded: true,
                            edited: false
                        });

                        forwardModal.style.display = "none";
                        messageToForwardData = null;
                        alert(`Message forwarded to #${chName}!`);
                    }
                });
                forwardChannelListContainer.appendChild(row);
            }
        });
    }

    // --- TUNNEL STREAM MANAGERS ---
    function syncChannelMessages(channelKey) {
        if (currentLiveListener) {
            database.ref(`channels/${currentChannel}`).off();
        }
        currentLiveListener = database.ref(`channels/${channelKey}`).on('value', (snapshot) => {
            renderMessages(channelKey, snapshot);
        });
    }

    // --- DYNAMIC SWITCH CHANNEL ROUTER ---
    channels.forEach(channel => {
        channel.addEventListener("click", () => {
            document.querySelector(".channel.active")?.classList.remove("active");
            channel.classList.add("active");
            
            const channelName = channel.textContent.replace('# ', '').trim();
            currentChannel = channelName;
            
            channelHeaderTitle.textContent = channelName;
            chatInput.placeholder = `Message #${channelName}`;

            appContainer.classList.remove("menu-open");
            
            // Wipe active temporary message states on channel changes
            activeReplyTargetId = null;
            replyPreviewBar.style.display = "none";

            syncChannelMessages(currentChannel);
        });
    });

    // --- ATTACH INPUT ENTER KEY KEYDOWN PROCESSOR ---
    chatInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && chatInput.value.trim() !== "") {
            let messageText = chatInput.value.trim();
            
            // RUN SHORTCODE CONVERSION DISPATCH
            messageText = parseShortcodes(messageText);

            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            let outboundPayload = {
                username: currentUser.username,
                avatarUrl: currentUser.avatarUrl,
                time: `Today at ${timeString}`,
                text: messageText,
                edited: false
            };

            // Inject structural reply target node mapping if flag references exist
            if (activeReplyTargetId) {
                outboundPayload.replyTo = {
                    username: replyTargetUsername.textContent,
                    snippet: replyTargetSnippet.textContent.substring(0, 40)
                };
            }

            database.ref(`channels/${currentChannel}`).push(outboundPayload);

            // Reset Input and Reply configurations instantly
            chatInput.value = "";
            activeReplyTargetId = null;
            replyPreviewBar.style.display = "none";

            if (currentChannel === "ai-bot-test") {
                triggerSmartBotResponse(messageText);
            }
        }
    });

    // --- AI BOT RESPONSE LOOP ---
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
                avatarUrl: "",
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
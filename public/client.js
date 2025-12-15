let ws;
let peerConnection;
let dataChannel; // For peer-to-peer file and text transfer

const AppState = {
  myUserName: null,
  selectedUser: null,
  pendingRemoteCandidates: [],
  callType: "video", // 'video' or 'audio'
  isCallActive: false,
  currentFacingMode: "user",
  reconnectAttempts: 0,
  maxReconnectAttempts: 5,
};

// Simple Chat Persistence
const ChatStore = {
  getMessages: (partner) => {
    try {
      const key = `chat_${AppState.myUserName}_${partner}`;
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Failed to load chat history", e);
      return [];
    }
  },
  saveMessage: (partner, msg) => {
    try {
      const key = `chat_${AppState.myUserName}_${partner}`;
      const messages = ChatStore.getMessages(partner);
      messages.push({ ...msg, timestamp: Date.now() });
      // Keep last 50 messages
      if (messages.length > 50) messages.shift();
      localStorage.setItem(key, JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save chat message", e);
    }
  },
};

let config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

document.addEventListener("DOMContentLoaded", () => {
  // UI Elements
  const loginScreen = document.getElementById("login-screen");
  const app = document.getElementById("app");
  const usernameInput = document.getElementById("usernameInput");
  const joinBtn = document.getElementById("joinBtn");

  // Sidebar
  const sidebar = document.getElementById("sidebar");
  const usersPanel = document.getElementById("usersPanel");
  const usersListEl = document.getElementById("usersList");

  // Main Views
  const placeholderView = document.getElementById("placeholder-view");
  const openSidebarBtn = document.getElementById("openSidebarBtn");
  const chatInterface = document.getElementById("chat-interface");
  const videoInterface = document.getElementById("video-interface");

  // User Identity
  const currentUserDisplay = document.getElementById("currentUserDisplay");
  const myUserNameDisplay = document.getElementById("myUserNameDisplay");
  const logoutBtn = document.getElementById("logoutBtn");

  const localAvatarCircle = document.getElementById("localAvatarCircle");
  const remoteAvatarCircle = document.getElementById("remoteAvatarCircle");

  // Main Chat Interface
  const chatUserName = document.getElementById("chatUserName");
  const chatAvatar = document.getElementById("chatAvatar");
  const returnToCallBtn = document.getElementById("returnToCallBtn");
  const startAudioCallBtn = document.getElementById("startAudioCallBtn");
  const startVideoCallBtn = document.getElementById("startVideoCallBtn");
  const mainMessages = document.getElementById("mainMessages");
  const mainChatInput = document.getElementById("mainChatInput");
  const mainSendBtn = document.getElementById("mainSendBtn");
  const fileUploadBtn = document.getElementById("uploadFileBtn");
  let selectedFile = null;

  // Call Status & Timer
  const callStatusBar = document.getElementById("call-status-bar");
  const callTimerEl = document.getElementById("call-timer");
  let callStartTime = null;
  let callTimerInterval = null;

  // Video Interface
  const localVideo = document.getElementById("localVideo");
  const remoteVideo = document.getElementById("remoteVideo");
  const audioOnlyPlaceholder = document.getElementById("audioOnlyPlaceholder");
  const localAudioPlaceholder = document.getElementById(
    "localAudioPlaceholder"
  );
  const remoteAudioLabel = document.getElementById("remoteAudioLabel");
  const localAudioLabel = document.getElementById("localAudioLabel");
  const remoteVideoLabel = document.getElementById("remoteVideoLabel");
  const localVideoLabel = document.getElementById("localVideoLabel");

  // Controls
  const controlsBar = document.getElementById("controls-bar");
  const muteBtn = document.getElementById("muteBtn");
  const videoBtn = document.getElementById("videoBtn");
  const flipCameraBtn = document.getElementById("flipCameraBtn");
  const toChatBtn = document.getElementById("toChatBtn");
  const hangupBtn = document.getElementById("hangupBtn");
  const backToUsersBtn = document.getElementById("backToUsersBtn");

  // Incoming Call
  const incomingModal = document.getElementById("incoming-call-modal");
  const callerNameEl = document.getElementById("caller-name");
  const answerCallBtn = document.getElementById("answerCallBtn");
  const rejectCallBtn = document.getElementById("rejectCallBtn");

  // Calling Overlay
  const callingOverlay = document.getElementById("calling-overlay");
  const callingText = document.getElementById("calling-text");
  const cancelCallBtn = document.getElementById("cancelCallBtn");

  // Call Ended Overlay
  const callEndedOverlay = document.getElementById("call-ended-overlay");
  const callEndedDuration = document.getElementById("call-ended-duration");

  const remoteRingtoneElement = document.getElementById("remoteRingtone");

  // Unlock Audio Context for Autoplay Policy
  function unlockAudio() {
    if (remoteRingtoneElement) {
      // Just play and pause immediately to unlock
      remoteRingtoneElement
        .play()
        .then(() => {
          remoteRingtoneElement.pause();
          remoteRingtoneElement.currentTime = 0;
        })
        .catch(() => {});
    }
  }

  document.body.addEventListener("click", unlockAudio, { once: true });
  document.body.addEventListener("touchstart", unlockAudio, { once: true });

  const toastContainer = document.getElementById("toast-container");

  // --- UI State Management ---

  function switchView(viewId) {
    [placeholderView, chatInterface, videoInterface].forEach((el) =>
      el.classList.add("hidden")
    );
    document.getElementById(viewId).classList.remove("hidden");

    // Manage Controls Visibility
    if (viewId === "video-interface") {
      controlsBar.classList.remove("hidden");
    } else {
      controlsBar.classList.add("hidden");
    }

    // Manage Return to Call Button
    if (viewId === "chat-interface" && AppState.isCallActive) {
      if (returnToCallBtn) returnToCallBtn.classList.remove("hidden");
      if (startAudioCallBtn) startAudioCallBtn.classList.add("hidden");
      if (startVideoCallBtn) startVideoCallBtn.classList.add("hidden");
    } else {
      if (returnToCallBtn) returnToCallBtn.classList.add("hidden");
      if (startAudioCallBtn) startAudioCallBtn.classList.remove("hidden");
      if (startVideoCallBtn) startVideoCallBtn.classList.remove("hidden");
    }

    // Mobile: If switching to a main view (chat or video), close sidebar
    if (window.innerWidth <= 768) {
      if (viewId === "chat-interface" || viewId === "video-interface") {
        if (sidebar) sidebar.classList.add("closed");
      }
    }
  }

  if (backToUsersBtn) {
    //should also be used to go back to the welcome screen from a chat window or to the call screen if a call is active
    backToUsersBtn.onclick = () => {
      if (AppState.isCallActive) {
        switchView("video-interface");
      } else {
        switchView("placeholder-view");
      }
    };

    // backToUsersBtn.onclick = () => {
    //   sidebar.classList.remove("closed");
    //   switchView("placeholder-view");
    //   AppState.selectedUser = null;
    // };
  }

  if (openSidebarBtn) {
    openSidebarBtn.onclick = () => {
      sidebar.classList.remove("closed");
    };
  }

  // --- Helper Functions ---

  function getInitials(name) {
    if (!name) return "??";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  }

  function showToast(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(-10px)"; // Slide up on exit
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function handleError(error, userMessage = "An error occurred") {
    console.error(error);
    showToast(userMessage, "danger");
  }

  // Modified to handle raw text or message objects
  function addMessage(textOrObj, className = "system", fromUser = null) {
    let text = textOrObj;
    let timestamp = null;

    if (typeof textOrObj === "object") {
      text = textOrObj.text;
      timestamp = textOrObj.timestamp;
    }

    const createMsg = (container) => {
      if (!container) return;
      const div = document.createElement("div");
      div.className = "msg " + className;

      if (fromUser && className === "other") {
        const strong = document.createElement("strong");
        strong.textContent = fromUser;
        div.appendChild(strong);
        div.appendChild(document.createElement("br"));
        div.appendChild(document.createTextNode(text));
      } else {
        div.textContent = text;
      }

      // Add Timestamp if available
      if (timestamp || className !== "system") {
        const timeSpan = document.createElement("span");
        timeSpan.className = "msg-time";
        const date = timestamp ? new Date(timestamp) : new Date();
        timeSpan.textContent = date.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        });
        div.appendChild(timeSpan);
      }

      container.appendChild(div);

      // Auto-scroll
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    };

    // Add to chat container
    createMsg(mainMessages);
  }

  // --- Timer Logic ---

  function startCallTimer() {
    stopCallTimer(); // Reset if exists
    callStartTime = Date.now();
    callStatusBar.classList.remove("hidden");
    callTimerEl.textContent = "00:00";

    callTimerInterval = setInterval(() => {
      const now = Date.now();
      const diff = now - callStartTime;
      const seconds = Math.floor((diff / 1000) % 60);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const hours = Math.floor(diff / (1000 * 60 * 60));

      const fmt = (n) => (n < 10 ? "0" + n : n);

      if (hours > 0) {
        callTimerEl.textContent = `${fmt(hours)}:${fmt(minutes)}:${fmt(
          seconds
        )}`;
      } else {
        callTimerEl.textContent = `${fmt(minutes)}:${fmt(seconds)}`;
      }
    }, 1000);
  }

  function stopCallTimer() {
    if (callTimerInterval) {
      clearInterval(callTimerInterval);
      callTimerInterval = null;
    }
    callStartTime = null;
    callStatusBar.classList.add("hidden");
  }

  // --- Core Logic ---

  // Check for persisted user
  const savedUser = localStorage.getItem("peers_username");
  if (savedUser) {
    AppState.myUserName = savedUser;
    // Don't auto-hide login screen completely if we want to force interaction?
    // Actually, let's keep it but add a subtle "Click to reconnect" overlay if needed?
    // No, standard behavior is auto-login. The recovery logic above handles the call case.

    initWebSocket();
    loginScreen.classList.add("hidden");
    app.classList.remove("hidden");
    updateUserIdentity();

    // Attempt to unlock audio silently on first load if possible (unlikely to work without gesture)
    // But we can try just in case user refreshed with interaction? No.
  }

  joinBtn.addEventListener("click", () => {
    const name = usernameInput.value.trim();
    if (!name) {
      showToast("Please enter your name", "danger");
      return;
    }

    // Explicitly unlock audio on join
    unlockAudio();

    AppState.myUserName = name;
    localStorage.setItem("peers_username", name);
    initWebSocket();
    loginScreen.classList.add("hidden");
    app.classList.remove("hidden");
    updateUserIdentity();
  });

  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.removeItem("peers_username");
      window.location.reload();
    };
  }

  function updateUserIdentity() {
    if (myUserNameDisplay) {
      myUserNameDisplay.textContent = AppState.myUserName;
      currentUserDisplay.classList.remove("hidden");
    }
    if (logoutBtn) {
      logoutBtn.classList.remove("hidden");
    }
    // Update Local Avatar Initials
    if (localAvatarCircle) {
      localAvatarCircle.textContent = getInitials(AppState.myUserName);
    }
  }

  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinBtn.click();
  });

  // --- Heartbeat Logic ---
  let heartbeatInterval = null;
  let pongTimeoutId = null;

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "ping" }));
        // If we don't get a pong back in 10 seconds, assume dead
        pongTimeoutId = setTimeout(() => {
          console.warn("Pong timeout - closing connection");
          ws.close();
        }, 10000);
      }
    }, 30000); // 30 seconds
  }

  function stopHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    if (pongTimeoutId) clearTimeout(pongTimeoutId);
    heartbeatInterval = null;
    pongTimeoutId = null;
  }

  function initWebSocket() {
    if (
      ws &&
      (ws.readyState === WebSocket.OPEN ||
        ws.readyState === WebSocket.CONNECTING)
    ) {
      return; // Already connected or connecting
    }

    const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${wsProtocol}://${window.location.host}`;
    ws = new WebSocket(wsUrl);

    const params = new URLSearchParams(window.location.search);
    const turn = params.get("turn");
    const turnUser = params.get("turnUser");
    const turnPass = params.get("turnPass");
    if (turn && turnUser && turnPass) {
      config.iceServers.push({
        urls: turn,
        username: turnUser,
        credential: turnPass,
      });
    }

    ws.onopen = () => {
      showToast("Connected to server", "success");
      AppState.reconnectAttempts = 0; // Reset attempts on success
      startHeartbeat();
      if (AppState.myUserName) {
        ws.send(
          JSON.stringify({ type: "join", username: AppState.myUserName })
        );
      }
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case "pong":
          if (pongTimeoutId) clearTimeout(pongTimeoutId);
          break;
        case "welcome":
          addMessage(data.message, "system");
          break;
        case "onlineUsers":
          updateUserList(data.users);
          break;
        case "offer":
          await handleOffer(data);
          break;
        case "answer":
          handleAnswer(data);
          break;
        case "reject":
          handleReject(data);
          break;
        case "ice":
          handleIceCandidate(data);
          break;
        case "hangup":
          handleHangup(data);
          break;
        case "video-toggle":
          // Handle remote video toggle
          const remoteAudioLabel = document.getElementById("remoteAudioLabel");

          if (data.enabled) {
            audioOnlyPlaceholder.classList.add("fade-out");
          } else {
            audioOnlyPlaceholder.classList.remove("fade-out");
            audioOnlyPlaceholder.classList.remove("hidden");
            if (remoteAudioLabel) remoteAudioLabel.textContent = data.from;
            if (remoteAvatarCircle)
              remoteAvatarCircle.textContent = getInitials(data.from);
          }
          break;
        case "chat":
          if (data.from !== AppState.selectedUser) {
            showToast(`New message from ${data.from}`, "info");
            // Also save message if not currently selected
            ChatStore.saveMessage(data.from, {
              text: data.text,
              type: "other",
              from: data.from,
            });
          } else {
            // Save and Add
            ChatStore.saveMessage(data.from, {
              text: data.text,
              type: "other",
              from: data.from,
            });
            addMessage(data.text, "other", data.from);
          }
          break;
        default:
          console.log("Unknown message:", data.type);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      // showToast("Connection error", "danger"); // Too noisy for reconnects
    };

    ws.onclose = () => {
      stopHeartbeat();
      console.log("Disconnected from server");
      // showToast("Disconnected from server", "danger");

      // Auto-reconnect logic
      if (AppState.reconnectAttempts < AppState.maxReconnectAttempts) {
        AppState.reconnectAttempts++;
        const timeout = Math.min(
          1000 * Math.pow(2, AppState.reconnectAttempts),
          10000
        );
        console.log(
          `Reconnecting in ${timeout}ms... (Attempt ${AppState.reconnectAttempts})`
        );
        setTimeout(initWebSocket, timeout);
      } else {
        showToast("Connection lost. Please refresh.", "danger");
      }
    };
  }

  function updateUserList(usernames) {
    usersListEl.innerHTML = "";
    usernames.forEach((name) => {
      if (name === AppState.myUserName) return;
      const li = document.createElement("li");

      // Enhanced User Item Structure
      const avatarDiv = document.createElement("div");
      avatarDiv.className = "list-avatar";
      avatarDiv.textContent = getInitials(name);

      const infoDiv = document.createElement("div");
      infoDiv.className = "list-info";

      const nameSpan = document.createElement("span");
      nameSpan.className = "list-name";
      nameSpan.textContent = name;

      const statusSpan = document.createElement("span");
      statusSpan.className = "list-status";
      statusSpan.textContent = "Online";

      infoDiv.appendChild(nameSpan);
      infoDiv.appendChild(statusSpan);

      li.appendChild(avatarDiv);
      li.appendChild(infoDiv);

      // Restore selection state
      if (AppState.selectedUser === name) {
        li.classList.add("selected");
      }

      li.onclick = () => {
        // Update selection styles
        document.querySelectorAll("#usersList li").forEach((el) => {
          el.classList.remove("selected");
        });
        li.classList.add("selected");

        // If already selected and in chat view, do nothing special
        if (AppState.selectedUser === name) {
          switchView("chat-interface");
          sidebar.classList.add("closed");
          return;
        }

        AppState.selectedUser = name;
        chatUserName.textContent = name;
        if (chatAvatar) chatAvatar.textContent = getInitials(name);

        loadChatHistory(name); // Load history

        // Switch to Chat Interface
        switchView("chat-interface");
        // Hide sidebar on mobile
        sidebar.classList.add("closed");
        // showToast(`Chatting with ${name}`, "info"); // Removed to reduce noise
      };
      usersListEl.appendChild(li);
    });
  }

  // --- PiP Swapping Logic ---
  const localVideoWrapper = document.querySelector(".video-wrapper.local");
  const remoteVideoWrapper = document.querySelector(".video-wrapper.remote");

  if (localVideoWrapper && remoteVideoWrapper) {
    localVideoWrapper.onclick = () => {
      if (localVideoWrapper.classList.contains("local")) {
        localVideoWrapper.classList.remove("local");
        localVideoWrapper.classList.add("remote-style-override");

        remoteVideoWrapper.classList.remove("remote");
        remoteVideoWrapper.classList.add("local-style-override");

        localVideoWrapper.className = "video-wrapper remote";
        remoteVideoWrapper.className = "video-wrapper local";

        // Update Labels for Swapped State
        if (localVideoLabel) localVideoLabel.textContent = "You";
        if (remoteVideoLabel)
          remoteVideoLabel.textContent = AppState.selectedUser || "Remote";
      } else {
        localVideoWrapper.className = "video-wrapper local";
        remoteVideoWrapper.className = "video-wrapper remote";

        // Reset Labels
        if (localVideoLabel) localVideoLabel.textContent = "You";
        if (remoteVideoLabel)
          remoteVideoLabel.textContent = AppState.selectedUser || "Remote";
      }
    };

    remoteVideoWrapper.onclick = () => {
      if (remoteVideoWrapper.classList.contains("local")) {
        // Swap back
        localVideoWrapper.className = "video-wrapper local";
        remoteVideoWrapper.className = "video-wrapper remote";

        // Reset Labels
        if (localVideoLabel) localVideoLabel.textContent = "You";
        if (remoteVideoLabel)
          remoteVideoLabel.textContent = AppState.selectedUser || "Remote";
      }
    };
  }

  // --- Refactored Call Helpers ---

  function initializeCallSession(user, type, isIncoming = false) {
    AppState.selectedUser = user;
    AppState.callType = type;
    AppState.isCallActive = true;

    // Reset UI State
    muteBtn.classList.remove("danger");
    videoBtn.classList.remove("danger");

    // Set Labels
    if (remoteVideoLabel) remoteVideoLabel.textContent = user;
    if (remoteAudioLabel) remoteAudioLabel.textContent = user;
    if (remoteAvatarCircle) remoteAvatarCircle.textContent = getInitials(user);

    // Local Labels
    if (localVideoLabel) localVideoLabel.textContent = "You";
    if (localAudioLabel) localAudioLabel.textContent = "You";
    if (localAvatarCircle)
      localAvatarCircle.textContent = getInitials(AppState.myUserName);

    // Switch View
    switchView("video-interface");
    updateCallUI(type);

    // Handle Overlays
    if (!isIncoming) {
      callingOverlay.classList.remove("hidden");
      callingText.textContent = `Calling ${user}...`;
    } else {
      // Incoming call accepted
      callingOverlay.classList.add("hidden");
      incomingModal.classList.add("hidden");
      incomingModal.classList.remove("video-preview-mode");
    }
  }

  function setupPeerConnection(stream) {
    if (peerConnection) {
      peerConnection.close();
    }
    peerConnection = new RTCPeerConnection(config);

    // Add Tracks
    if (stream) {
      stream
        .getTracks()
        .forEach((track) => peerConnection.addTrack(track, stream));
    }

    // Event Handlers
    peerConnection.ontrack = (e) => {
      remoteVideo.srcObject = e.streams[0];
      remoteVideo.play().catch(() => {});
    };

    peerConnection.onicecandidate = (e) => {
      if (e.candidate && AppState.selectedUser) {
        ws.send(
          JSON.stringify({
            type: "ice",
            ice: e.candidate,
            to: AppState.selectedUser,
            from: AppState.myUserName,
          })
        );
      }
    };

    peerConnection.onconnectionstatechange = () => {
      const s = peerConnection.connectionState;
      if (["failed", "disconnected", "closed"].includes(s)) {
        endCall(false);
      }
    };

    // Handle incoming data channel (for callee)
    peerConnection.ondatachannel = (event) => {
      setupDataChannel(event.channel);
    };

    return peerConnection;
  }

  // --- Call Logic ---

  async function startMedia(type = "video") {
    try {
      const constraints = {
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          type === "video" ? { facingMode: AppState.currentFacingMode } : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (err) {
      handleError(err, "Camera/Mic access denied");
      throw err;
    }
  }

  // Check for mobile to show flip button
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    if (flipCameraBtn) flipCameraBtn.classList.remove("hidden");
  }

  startAudioCallBtn.onclick = () => startCall("audio");
  startVideoCallBtn.onclick = () => startCall("video");

  async function startCall(type) {
    if (!AppState.selectedUser) return;
    if (AppState.isCallActive) {
      showToast("You are already in a call!", "danger");
      return;
    }

    try {
      // 1. Get Media
      const stream = await startMedia(type);
      localVideo.srcObject = stream;
      localVideo.play().catch(() => {});

      // 2. Initialize Session UI
      initializeCallSession(AppState.selectedUser, type, false);

      // 3. Setup PC
      setupPeerConnection(stream);
      // Create data channel for caller and attach handlers
      try {
        dataChannel = peerConnection.createDataChannel("chat");
        setupDataChannel(dataChannel);
      } catch (e) {
        console.warn("Failed to create data channel:", e);
      }

      // 4. Create Offer
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await peerConnection.setLocalDescription(offer);

      // 5. Send Offer
      ws.send(
        JSON.stringify({
          type: "offer",
          to: AppState.selectedUser,
          from: AppState.myUserName,
          offer,
          callType: type,
        })
      );

      // Cancel Handler
      cancelCallBtn.onclick = () => endCall(true);
    } catch (err) {
      handleError(err, "Failed to start call");
      endCall(false);
    }
  }

  function updateCallUI(type) {
    // Reset control buttons to default state first
    muteBtn.classList.remove("danger");
    videoBtn.classList.remove("danger");

    if (type === "audio") {
      // Remote
      audioOnlyPlaceholder.classList.remove("hidden");
      audioOnlyPlaceholder.classList.remove("fade-out");

      remoteVideo.classList.add("hidden");

      // Local
      localVideo.classList.add("hidden");
      localAudioPlaceholder.classList.remove("hidden");
      localAudioPlaceholder.classList.remove("fade-out");

      // Controls
      videoBtn.classList.add("hidden");
      if (flipCameraBtn) flipCameraBtn.classList.add("hidden");
    } else {
      // Remote
      audioOnlyPlaceholder.classList.remove("hidden");
      audioOnlyPlaceholder.classList.add("fade-out");
      remoteVideo.classList.remove("hidden");

      // Local
      localVideo.classList.remove("hidden");
      localAudioPlaceholder.classList.remove("hidden");
      localAudioPlaceholder.classList.add("fade-out");

      // Controls
      videoBtn.classList.remove("hidden");

      if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
        if (flipCameraBtn) flipCameraBtn.classList.remove("hidden");
      }

      // Check track states
      const stream = localVideo.srcObject;
      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack && !audioTrack.enabled) muteBtn.classList.add("danger");

        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && !videoTrack.enabled) {
          videoBtn.classList.add("danger");
          localAudioPlaceholder.classList.remove("fade-out");
        }
      }
    }
  }

  // Setup data channel handlers (reusable)
  function setupDataChannel(channel) {
    if (!channel) return;
    dataChannel = channel;
    try {
      channel.binaryType = "arraybuffer";
    } catch (e) {}

    channel.onopen = () => {
      console.log("DataChannel open");
    };

    channel.onclose = () => {
      console.log("DataChannel closed");
    };

    channel.onerror = (err) => {
      console.error("DataChannel error:", err);
    };

    channel.onmessage = (e) => {
      // Handle both text and binary
      if (typeof e.data === "string") {
        let msg = null;
        try {
          msg = JSON.parse(e.data);
        } catch (err) {
          console.warn("Received non-JSON string on data channel", e.data);
          addMessage(e.data, "other");
          return;
        }

        if (msg.type === "file-start") {
          window.incomingFile = {
            name: msg.fileName,
            type: msg.fileType,
            size: msg.fileSize,
            chunks: [],
            received: 0,
            total: msg.totalChunks,
          };
          return;
        }

        if (msg.type === "file-end") {
          if (window.incomingFile) {
            const blob = new Blob(window.incomingFile.chunks, {
              type: window.incomingFile.type,
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = window.incomingFile.name;
            a.click();
            addMessage(
              `📎 Received file: ${window.incomingFile.name}`,
              "other"
            );
            window.incomingFile = null;
          }
          return;
        }

        // Other string messages (chat)
        if (msg.type === "chat") {
          addMessage(msg.text, "other");
        }
      } else {
        // Binary chunk
        if (window.incomingFile) {
          window.incomingFile.chunks.push(e.data);
          window.incomingFile.received++;
        }
      }
    };
  }

  // Handle Offer
  async function handleOffer(data) {
    if (AppState.isCallActive) {
      ws.send(
        JSON.stringify({
          type: "reject",
          to: data.from,
          from: AppState.myUserName,
          reason: "busy",
        })
      );
      return;
    }

    AppState.selectedUser = data.from;
    const incomingCallType = data.callType || "video";
    AppState.callType = incomingCallType;

    // Update Caller Name
    callerNameEl.textContent = data.from;
    const callTypeEl = document.getElementById("incoming-call-type");
    if (callTypeEl) {
      callTypeEl.textContent =
        incomingCallType === "audio"
          ? "Incoming Voice Call"
          : "Incoming Video Call";
    } else {
      callerNameEl.textContent = `${data.from} - ${
        incomingCallType === "audio"
          ? "Incoming Voice Call"
          : "Incoming Video Call"
      }`;
    }

    incomingModal.classList.remove("hidden");

    // Play Ringtone
    try {
      remoteRingtoneElement.volume = 1.0;
      remoteRingtoneElement.muted = false;
      const playPromise = remoteRingtoneElement.play();

      if (playPromise !== undefined) {
        playPromise.catch((error) => {
          console.warn("Ringtone playback failed (autoplay policy?):", error);

          // Show visual cue
          showToast("Tap anywhere to enable sound", "info");

          // Rescue: Try to play on next interaction
          const retryAudio = () => {
            remoteRingtoneElement
              .play()
              .catch((e) => console.log("Retry failed", e));
            if (navigator.vibrate) {
              try {
                navigator.vibrate([200, 100, 200]);
              } catch (e) {}
            }
            document.body.removeEventListener("click", retryAudio);
            document.body.removeEventListener("touchstart", retryAudio);
          };

          document.body.addEventListener("click", retryAudio);
          document.body.addEventListener("touchstart", retryAudio);
        });
      }
    } catch (e) {
      console.warn("Ringtone playback failed:", e);
    }

    // Video Preview Logic
    if (incomingCallType === "video") {
      try {
        if (chatUserName) chatUserName.textContent = AppState.selectedUser;

        switchView("video-interface");
        updateCallUI("video");

        incomingModal.classList.add("video-preview-mode");

        const stream = await startMedia("video");
        localVideo.srcObject = stream;
        localVideo.play().catch(() => {});

        document
          .getElementById("localAudioPlaceholder")
          .classList.add("fade-out");
      } catch (err) {
        handleError(err, "Failed to start video preview");
      }
    } else {
      incomingModal.classList.remove("video-preview-mode");
      if (chatUserName) chatUserName.textContent = AppState.selectedUser;
      switchView("video-interface");
      updateCallUI("audio");
    }

    answerCallBtn.onclick = async () => {
      // Clean up Ringtone
      incomingModal.classList.add("hidden");
      incomingModal.classList.remove("video-preview-mode");
      remoteRingtoneElement.muted = true;
      remoteRingtoneElement.pause();
      remoteRingtoneElement.currentTime = 0;

      if (AppState.selectedUser) {
        loadChatHistory(AppState.selectedUser);
      }

      await acceptCall(data);
    };

    rejectCallBtn.onclick = () => {
      incomingModal.classList.add("hidden");
      incomingModal.classList.remove("video-preview-mode");
      remoteRingtoneElement.muted = true;
      remoteRingtoneElement.pause();
      rejectCall(data);
    };
  }

  async function acceptCall(data) {
    try {
      showToast("Connecting...", "info");

      // 1. Ensure Media
      let stream = localVideo.srcObject;
      if (!stream) {
        try {
          stream = await startMedia(AppState.callType);
          localVideo.srcObject = stream;
          await localVideo.play().catch(() => {});
        } catch (mediaErr) {
          handleError(mediaErr, "Could not access Camera/Mic");
          return;
        }
      }

      // 2. Initialize Session UI (Incoming = true)
      initializeCallSession(data.from, AppState.callType, true);

      // 3. Setup PC
      setupPeerConnection(stream);

      // 4. Set Remote Desc
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.offer)
      );

      // 5. Add Candidates
      while (AppState.pendingRemoteCandidates.length) {
        await peerConnection.addIceCandidate(
          AppState.pendingRemoteCandidates.shift()
        );
      }

      // 6. Create Answer
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      // 7. Send Answer
      ws.send(
        JSON.stringify({
          type: "answer",
          to: data.from,
          from: AppState.myUserName,
          answer,
        })
      );

      // 8. Start Timer
      startCallTimer();
      addMessage(`Connected to ${data.from}`, "system");
    } catch (err) {
      handleError(err, "Failed to accept call: " + err.message);
      endCall(false);
    }
  }

  function rejectCall(data) {
    ws.send(
      JSON.stringify({
        type: "reject",
        to: data.from,
        from: AppState.myUserName,
      })
    );
    showToast("Call declined", "info");

    if (localVideo.srcObject) {
      localVideo.srcObject.getTracks().forEach((t) => t.stop());
      localVideo.srcObject = null;
    }

    if (AppState.selectedUser) {
      loadChatHistory(AppState.selectedUser);
    }
    switchView("chat-interface");
    // Keep selectedUser for chat
  }

  async function handleAnswer(data) {
    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
      while (AppState.pendingRemoteCandidates.length) {
        await peerConnection.addIceCandidate(
          AppState.pendingRemoteCandidates.shift()
        );
      }
      startCallTimer();

      callingOverlay.classList.add("hidden");
      switchView("video-interface");

      showToast("Call established", "success");
    } catch (err) {
      handleError(err, "Failed to establish connection");
    }
  }

  function handleReject(data) {
    const reason =
      data.reason === "busy" ? "is on another call" : "declined the call";
    showToast(`${data.from} ${reason}`, "danger");
    callingOverlay.classList.add("hidden");
    endCall(false);
  }

  function handleHangup(data) {
    if (
      !AppState.isCallActive &&
      incomingModal.classList.contains("hidden") === false
    ) {
      incomingModal.classList.add("hidden");
      remoteRingtoneElement.muted = true;
      remoteRingtoneElement.pause();
      addMessage(`Missed call from ${data.from}`, "system");
      return;
    }

    showToast(`${data.from} ended the call`, "info");
    endCall(false);
  }

  async function handleIceCandidate(data) {
    if (!peerConnection) return;
    try {
      const candidate = new RTCIceCandidate(data.ice);
      if (peerConnection.remoteDescription) {
        await peerConnection.addIceCandidate(candidate);
      } else {
        AppState.pendingRemoteCandidates.push(candidate);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function endCall(sendSignal = true) {
    if (sendSignal && AppState.selectedUser && AppState.isCallActive) {
      ws.send(
        JSON.stringify({
          type: "hangup",
          to: AppState.selectedUser,
          from: AppState.myUserName,
        })
      );
    }

    const durationText = callTimerEl.textContent;

    AppState.isCallActive = false;
    stopCallTimer();

    if (localVideo.srcObject) {
      localVideo.srcObject.getTracks().forEach((track) => track.stop());
      localVideo.srcObject = null;
    }
    if (remoteVideo.srcObject) {
      remoteVideo.srcObject.getTracks().forEach((track) => track.stop());
      remoteVideo.srcObject = null;
    }

    if (callingOverlay) callingOverlay.classList.add("hidden");
    if (incomingModal) incomingModal.classList.add("hidden");
    if (incomingModal) incomingModal.classList.remove("video-preview-mode");

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    if (callEndedOverlay && durationText !== "00:00") {
      callEndedDuration.textContent = durationText;
      callEndedOverlay.classList.remove("hidden");

      setTimeout(() => {
        callEndedOverlay.classList.add("hidden");
        switchView("chat-interface");
        if (AppState.selectedUser) {
          loadChatHistory(AppState.selectedUser);
        }
      }, 2000);
    } else {
      switchView("chat-interface");
    }

    AppState.callType = "video";
    AppState.currentFacingMode = "user";

    if (remoteVideoLabel) remoteVideoLabel.textContent = "Remote";
    if (remoteAudioLabel) remoteAudioLabel.textContent = "User";
    if (remoteAvatarCircle) remoteAvatarCircle.textContent = "";

    muteBtn.classList.remove("danger");
    videoBtn.classList.remove("danger");
  }

  // --- Chat Logic ---

  async function loadChatHistory(user) {
    if (!user) return;

    chatUserName.textContent = user;
    if (chatAvatar) chatAvatar.textContent = getInitials(user);
    mainMessages.innerHTML = "";

    // Load persisted messages
    const messages = ChatStore.getMessages(user);
    messages.forEach((msg) => {
      addMessage(msg, msg.type, msg.from);
    });

    // Update list selection style
    document.querySelectorAll("#usersList li").forEach((li) => {
      // Since we changed structure, we need to check textContent or a data attribute
      // But textContent now includes InitialsNameOnline...
      // Let's rely on the click handler or re-render logic.
      // Actually, updateUserList re-renders everything on socket update.
      // But loadChatHistory is called on click.
      // Let's use a selector for the name span.
      const nameSpan = li.querySelector(".list-name");
      if (nameSpan && nameSpan.textContent === user) {
        li.classList.add("selected");
      } else {
        li.classList.remove("selected");
      }
    });
  }

  function sendChat(inputEl) {
    const text = inputEl.value.trim();
    if (!text || !AppState.selectedUser) return;

    ws.send(
      JSON.stringify({
        type: "chat",
        to: AppState.selectedUser,
        from: AppState.myUserName,
        text: text,
      })
    );

    ChatStore.saveMessage(AppState.selectedUser, {
      text: text,
      type: "me",
      from: AppState.myUserName,
    });

    addMessage(text, "me");
    inputEl.value = "";
  }

  // allow upload and sending of files in chat
  fileUploadBtn.onclick = () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.onchange = () => {
      selectedFile = fileInput.files[0];
      if (selectedFile) {
        // Show file in chat input area
        const chatInput = document.getElementById("mainChatInput");
        chatInput.value = `📎 ${selectedFile.name} (${formatFileSize(
          selectedFile.size
        )})`;
        chatInput.disabled = false;
        console.log("File selected:", selectedFile.name);
      }
    };
    fileInput.click();
  };

  function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  // fileUploadBtn.onclick = () => {
  //   console.log("File upload clicked");
  //   const fileInput = document.createElement("input");
  //   fileInput.type = "file";
  //   fileInput.onchange = () => {
  //     const file = fileInput.files[0];
  //     if (file && AppState.selectedUser) {
  //       const reader = new FileReader();
  //       reader.onload = () => {
  //         const arrayBuffer = reader.result;

  //         // Check WebSocket is ready
  //         if (ws.readyState !== ws.OPEN) {
  //           console.error("WebSocket not connected");
  //           addMessage("Connection lost. Cannot send file.", "system");
  //           return;
  //         }

  //         ws.send(
  //           JSON.stringify({
  //             type: "file",
  //             to: AppState.selectedUser,
  //             from: AppState.myUserName,
  //             fileName: file.name,
  //             fileType: file.type,
  //             fileSize: file.size,
  //             fileData: Array.from(new Uint8Array(arrayBuffer)),
  //           })
  //         );

  //         ChatStore.saveMessage(AppState.selectedUser, {
  //           text: `Sent file: ${file.name}`,
  //           type: "me",
  //           from: AppState.myUserName,
  //         });

  //         addMessage(`Sent file: ${file.name}`, "me");
  //       };
  //       reader.readAsArrayBuffer(file);
  //     }
  //   };

  //   // THIS IS THE KEY LINE - trigger the file picker
  //   fileInput.click();
  // };

  // //allow upload and sending of files in chat
  // fileUploadBtn.onclick = () => {
  //   console.log("File upload clicked");
  //   const fileInput = document.createElement("input");
  //   fileInput.type = "file";
  //   fileInput.onchange = () => {
  //     const file = fileInput.files[0];
  //     if (file && AppState.selectedUser) {
  //       const reader = new FileReader();
  //       reader.onload = () => {
  //         const arrayBuffer = reader.result;
  //         ws.send(
  //           JSON.stringify({
  //             type: "file",
  //             to: AppState.selectedUser,
  //             from: AppState.myUserName,
  //             fileName: file.name,
  //             fileType: file.type,
  //             fileData: Array.from(new Uint8Array(arrayBuffer)),
  //           })
  //         );

  //         ChatStore.saveMessage(AppState.selectedUser, {
  //           text: `Sent file: ${file.name}`,
  //           type: "me",
  //           from: AppState.myUserName,
  //         });

  //         addMessage(`Sent file: ${file.name}`, "me");
  //       };
  //       reader.readAsArrayBuffer(file);
  //     }
  //   };
  // };

  // on click mainSendBtn or enter key, send chat message or file if selected
  mainSendBtn.onclick = () => {
    if (selectedFile) {
      sendFileViaDataChannel(selectedFile);
      // Clear selected file
      selectedFile = null;
      mainChatInput.value = "";
      mainChatInput.disabled = false;
      return;
    } else {
      sendChat(mainChatInput);
    }
  };
  mainChatInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      if (selectedFile) {
        sendFileViaDataChannel(selectedFile);

        selectedFile = null;
        mainChatInput.value = "";
        mainChatInput.disabled = false;
        return;
      } else {
        sendChat(mainChatInput);
      }
    }
  };

  function sendFileViaDataChannel(file) {
    if (!dataChannel || dataChannel.readyState !== "open") {
      addMessage("Error: No active connection. Start a call first.", "system");
      return;
    }

    const CHUNK_SIZE = 16384; // 16KB chunks
    const chunks = Math.ceil(file.size / CHUNK_SIZE);
    let sentChunks = 0;

    // Send file metadata first
    dataChannel.send(
      JSON.stringify({
        type: "file-start",
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        totalChunks: chunks,
      })
    );

    const reader = new FileReader();

    reader.onload = (e) => {
      const chunk = e.target.result;
      dataChannel.send(chunk); // Send raw binary
      sentChunks++;

      if (sentChunks < chunks) {
        const nextChunk = file.slice(
          sentChunks * CHUNK_SIZE,
          (sentChunks + 1) * CHUNK_SIZE
        );
        reader.readAsArrayBuffer(nextChunk);
      } else {
        // Done
        dataChannel.send(
          JSON.stringify({ type: "file-end", fileName: file.name })
        );
        addMessage(`Sent file: ${file.name}`, "me");
      }
    };

    const firstChunk = file.slice(0, CHUNK_SIZE);
    reader.readAsArrayBuffer(firstChunk);
  }
  // Data channel handlers will be attached when the channel is created or received

  // mainSendBtn.onclick = () => {sendChat(mainChatInput);}
  // mainChatInput.onkeydown = (e) => {
  //   if (e.key === "Enter") sendChat(mainChatInput);
  // };

  if (toChatBtn) {
    toChatBtn.onclick = () => {
      switchView("chat-interface");
    };
  }

  if (returnToCallBtn) {
    returnToCallBtn.onclick = () => {
      switchView("video-interface");
    };
  }

  if (flipCameraBtn) {
    flipCameraBtn.onclick = async () => {
      if (AppState.callType !== "video") return;

      AppState.currentFacingMode =
        AppState.currentFacingMode === "user" ? "environment" : "user";

      const oldStream = localVideo.srcObject;
      if (oldStream) {
        oldStream.getTracks().forEach((t) => t.stop());
      }

      try {
        const newStream = await startMedia("video");
        localVideo.srcObject = newStream;
        localVideo.play().catch(() => {});

        if (peerConnection) {
          const videoTrack = newStream.getVideoTracks()[0];
          const sender = peerConnection
            .getSenders()
            .find((s) => s.track.kind === "video");
          if (sender) {
            sender.replaceTrack(videoTrack);
          }
        }
      } catch (err) {
        handleError(err, "Failed to switch camera");
      }
    };
  }

  muteBtn.onclick = () => {
    const stream = localVideo.srcObject;
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        muteBtn.classList.toggle("danger", !audioTrack.enabled);
      }
    }
  };

  videoBtn.onclick = () => {
    const stream = localVideo.srcObject;
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        videoBtn.classList.toggle("danger", !videoTrack.enabled);

        const localAudioPlaceholder = document.getElementById(
          "localAudioPlaceholder"
        );
        if (localAudioPlaceholder) {
          if (videoTrack.enabled) {
            localAudioPlaceholder.classList.add("fade-out");
          } else {
            localAudioPlaceholder.classList.remove("fade-out");
          }
        }

        if (AppState.isCallActive && AppState.selectedUser) {
          ws.send(
            JSON.stringify({
              type: "video-toggle",
              to: AppState.selectedUser,
              from: AppState.myUserName,
              enabled: videoTrack.enabled,
            })
          );
        }
      }
    }
  };

  hangupBtn.onclick = () => {
    endCall();
  };

  // Ensure hangup on page close/refresh
  window.addEventListener("beforeunload", () => {
    if (AppState.isCallActive && AppState.selectedUser) {
      // Use sendBeacon or just a quick WebSocket send if possible
      // Since WS is async, it might not send in time, but we try.
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "hangup",
            to: AppState.selectedUser,
            from: AppState.myUserName,
          })
        );
      }
    }
  });
});

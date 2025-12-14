let ws;
let peerConnection;

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
  const returnToCallBtn = document.getElementById("returnToCallBtn");
  const startAudioCallBtn = document.getElementById("startAudioCallBtn");
  const startVideoCallBtn = document.getElementById("startVideoCallBtn");
  const mainMessages = document.getElementById("mainMessages");
  const mainChatInput = document.getElementById("mainChatInput");
  const mainSendBtn = document.getElementById("mainSendBtn");

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
      returnToCallBtn.classList.remove("hidden");
    } else {
      returnToCallBtn.classList.add("hidden");
    }

    // Mobile: If switching to a main view (chat or video), close sidebar
    if (window.innerWidth <= 768) {
      if (viewId === "chat-interface" || viewId === "video-interface") {
        if (sidebar) sidebar.classList.add("closed");
      }
    }
  }

  if (backToUsersBtn) {
    backToUsersBtn.onclick = () => {
      sidebar.classList.remove("closed");
    };
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

  function addMessage(text, className = "system", fromUser = null) {
    const createMsg = (container) => {
      if (!container) return;
      const div = document.createElement("div");
      div.className = "msg " + className;
      if (fromUser && className === "other") {
        div.innerHTML = `<strong>${fromUser}</strong><br>${text}`;
      } else {
        div.textContent = text;
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
    initWebSocket();
    loginScreen.classList.add("hidden");
    app.classList.remove("hidden");
    updateUserIdentity();
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
      if (AppState.myUserName) {
        ws.send(
          JSON.stringify({ type: "join", username: AppState.myUserName })
        );
      }
    };

    ws.onmessage = async (event) => {
      const data = JSON.parse(event.data);
      switch (data.type) {
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
          }
          addMessage(data.text, "other", data.from);
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
      li.textContent = name;
      li.onclick = () => {
        AppState.selectedUser = name;
        chatUserName.textContent = name;
        // Switch to Chat Interface
        switchView("chat-interface");
        // Hide sidebar on mobile
        sidebar.classList.add("closed");
        showToast(`Chatting with ${name}`, "info");
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
          if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
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
    showToast(`${data.from} rejected the call`, "danger");
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
    mainMessages.innerHTML = "";

    document.querySelectorAll("#usersList li").forEach((li) => {
      if (li.textContent === user) {
        li.style.background = "#3a3a3a";
      } else {
        li.style.background = "";
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

    addMessage(text, "me");
    inputEl.value = "";
  }

  mainSendBtn.onclick = () => sendChat(mainChatInput);
  mainChatInput.onkeydown = (e) => {
    if (e.key === "Enter") sendChat(mainChatInput);
  };

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
});

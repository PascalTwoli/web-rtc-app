let ws;
let peerConnection;
let dataChannel;
let myUserName = null;
let selectedUser = null;
let pendingRemoteCandidates = [];
let callType = "video"; // 'video' or 'audio'
let isCallActive = false; // Tracks if a call is ongoing

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
  // const closeSidebarBtn = document.getElementById("closeSidebarBtn"); // Removed
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
  const remoteLabel = document.getElementById("remoteLabel");
  const audioOnlyPlaceholder = document.getElementById("audioOnlyPlaceholder");
  const localAudioPlaceholder = document.getElementById(
    "localAudioPlaceholder"
  );
  const remoteAudioLabel = document.getElementById("remoteAudioLabel");

  // Controls
  const controlsBar = document.getElementById("controls-bar");
  const muteBtn = document.getElementById("muteBtn");
  const videoBtn = document.getElementById("videoBtn");
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

  const remoteRingtoneElement = document.getElementById("remoteRingtone");
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
    if (viewId === "chat-interface" && isCallActive) {
      returnToCallBtn.classList.remove("hidden");
    } else {
      returnToCallBtn.classList.add("hidden");
    }
  }

  // Sidebar Tab logic removed - Sidebar is always Users

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

  /*
  if (closeSidebarBtn) {
     closeSidebarBtn.onclick = () => sidebar.classList.add("closed");
  }
  */

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
    myUserName = savedUser;
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
    myUserName = name;
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
      myUserNameDisplay.textContent = myUserName;
      currentUserDisplay.classList.remove("hidden");
    }
    if (logoutBtn) {
      logoutBtn.classList.remove("hidden");
    }
    // Update Local Avatar Initials
    if (localAvatarCircle) {
      localAvatarCircle.textContent = getInitials(myUserName);
    }
  }

  usernameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") joinBtn.click();
  });

  function initWebSocket() {
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
      ws.send(JSON.stringify({ type: "join", username: myUserName }));
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
          if (data.enabled) {
            audioOnlyPlaceholder.classList.add("hidden");
          } else {
            audioOnlyPlaceholder.classList.remove("hidden");
            if (remoteAudioLabel) remoteAudioLabel.textContent = data.from;
            if (remoteAvatarCircle)
              remoteAvatarCircle.textContent = getInitials(data.from);
          }
          break;
        case "chat":
          if (data.from !== selectedUser) {
            showToast(`New message from ${data.from}`, "info");
          }
          // Only show in chat if it's from the selected user or we want global chat
          // For now, let's just append to chat log
          addMessage(data.text, "other", data.from);
          break;
        default:
          console.log("Unknown message:", data.type);
      }
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      showToast("Connection error", "danger");
    };

    ws.onclose = () => {
      showToast("Disconnected from server", "danger");
    };
  }

  function updateUserList(usernames) {
    usersListEl.innerHTML = "";
    usernames.forEach((name) => {
      if (name === myUserName) return;
      const li = document.createElement("li");
      li.textContent = name;
      li.onclick = () => {
        selectedUser = name;
        chatUserName.textContent = name;
        // Switch to Chat Interface
        switchView("chat-interface");
        // Hide sidebar on mobile
        sidebar.classList.add("closed");
        // Clear chat or keep history? keeping history for now (global buffer)
        // Ideally we filter by user, but let's keep it simple
        showToast(`Chatting with ${name}`, "info");
      };
      usersListEl.appendChild(li);
    });
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
        video: type === "video" ? true : false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (err) {
      showToast("Camera/Mic access denied", "danger");
      throw err;
    }
  }

  startAudioCallBtn.onclick = () => startCall("audio");
  startVideoCallBtn.onclick = () => startCall("video");

  async function startCall(type) {
    if (!selectedUser) return;

    // Prevent concurrent calls
    if (isCallActive) {
      showToast("You are already in a call!", "danger");
      return;
    }

    callType = type;
    isCallActive = true; // Set active state

    try {
      const stream = await startMedia(type);
      localVideo.srcObject = stream;
      localVideo.play().catch(() => {});

      // Ensure UI mute button is reset
      muteBtn.classList.remove("danger");

      createPeerConnection(stream, true);

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true, // Always offer video capability?
        // If we want audio-only, we can set offerToReceiveVideo: false
        // But usually better to offer and just not send track
      });
      await peerConnection.setLocalDescription(offer);

      ws.send(
        JSON.stringify({
          type: "offer",
          to: selectedUser,
          from: myUserName,
          offer,
          callType, // Custom field to hint receiver
        })
      );

      // Switch UI
      // switchView("video-interface"); // Removed immediate switch
      // Sidebar auto-switch removed
      updateCallUI(type);

      // Show Calling Overlay
      callingOverlay.classList.remove("hidden");
      callingText.textContent = `Calling ${selectedUser}...`;

      cancelCallBtn.onclick = () => {
        endCall(true);
      };

      // addMessage(`Calling ${selectedUser}...`, "system"); // Optional
      remoteLabel.textContent = `Calling ${selectedUser}...`;
    } catch (err) {
      console.error(err);
    }
  }

  function updateCallUI(type) {
    if (type === "audio") {
      // Remote
      audioOnlyPlaceholder.classList.remove("hidden");
      remoteVideo.classList.add("hidden");
      remoteAudioLabel.textContent = selectedUser;
      if (remoteAvatarCircle)
        remoteAvatarCircle.textContent = getInitials(selectedUser);

      // Local
      localVideo.classList.add("hidden");
      localAudioPlaceholder.classList.remove("hidden");
      if (localAvatarCircle)
        localAvatarCircle.textContent = getInitials(myUserName);

      // Controls
      videoBtn.classList.add("hidden");
    } else {
      // Remote
      audioOnlyPlaceholder.classList.add("hidden");
      remoteVideo.classList.remove("hidden");

      // Local
      localVideo.classList.remove("hidden");
      localAudioPlaceholder.classList.add("hidden");
      if (localAvatarCircle)
        localAvatarCircle.textContent = getInitials(myUserName);

      // Controls
      videoBtn.classList.remove("hidden");
    }
  }

  // Handle Offer
  async function handleOffer(data) {
    // Prevent receiving calls if already in one
    if (isCallActive) {
      // Auto-reject with busy signal
      ws.send(
        JSON.stringify({
          type: "reject",
          to: data.from,
          from: myUserName,
          reason: "busy",
        })
      );
      return;
    }

    selectedUser = data.from;
    const incomingCallType = data.callType || "video";
    callType = incomingCallType;

    // Update Caller Name and Type
    callerNameEl.textContent = data.from;
    const callTypeEl = document.getElementById("incoming-call-type");
    if (callTypeEl) {
      callTypeEl.textContent =
        incomingCallType === "audio"
          ? "Incoming Voice Call"
          : "Incoming Video Call";
    } else {
      // Fallback if element doesn't exist yet (we will add it to HTML)
      callerNameEl.textContent = `${data.from} - ${
        incomingCallType === "audio"
          ? "Incoming Voice Call"
          : "Incoming Video Call"
      }`;
    }

    // Show Modal
    incomingModal.classList.remove("hidden");

    // Play Ringtone
    try {
      remoteRingtoneElement.volume = 1.0;
      remoteRingtoneElement.muted = false;
      await remoteRingtoneElement.play();
    } catch (e) {
      console.warn("Ringtone playback failed (autoplay policy?):", e);
    }

    // If Video Call, start preview immediately
    if (incomingCallType === "video") {
      try {
        // Switch to video view to show preview
        switchView("video-interface");
        updateCallUI("video");

        // Make modal transparent for preview
        incomingModal.classList.add("video-preview-mode");

        const stream = await startMedia("video");
        localVideo.srcObject = stream;
        localVideo.play().catch(() => {});

        // Ensure local avatar is hidden since we have video
        document
          .getElementById("localAudioPlaceholder")
          .classList.add("hidden");
      } catch (err) {
        console.error("Failed to start video preview", err);
      }
    } else {
      // Audio call - ensure modal is opaque
      incomingModal.classList.remove("video-preview-mode");
    }

    answerCallBtn.onclick = async () => {
      incomingModal.classList.add("hidden");
      incomingModal.classList.remove("video-preview-mode"); // Reset
      remoteRingtoneElement.muted = true;
      remoteRingtoneElement.pause();
      await acceptCall(data);
    };

    rejectCallBtn.onclick = () => {
      incomingModal.classList.add("hidden");
      incomingModal.classList.remove("video-preview-mode"); // Reset
      remoteRingtoneElement.muted = true;
      remoteRingtoneElement.pause();
      rejectCall(data);
    };
  }

  async function acceptCall(data) {
    try {
      showToast("Connecting...", "info");
      isCallActive = true; // Set active state

      let stream = localVideo.srcObject;

      // If we don't have a stream (Audio call) or need to upgrade/match type
      if (!stream) {
        try {
          stream = await startMedia(callType);
          localVideo.srcObject = stream;
          // Only play if it's video, or if we want to ensure audio track is active?
          // localVideo is muted, so playing it is fine.
          await localVideo.play().catch(() => {});
        } catch (mediaErr) {
          console.error("Failed to start media in acceptCall:", mediaErr);
          showToast("Could not access Camera/Mic", "danger");
          return; // Abort if media fails
        }
      }

      // Switch UI BEFORE creating peer connection to ensure user sees something
      switchView("video-interface");
      updateCallUI(callType);

      // Ensure UI mute button is reset
      muteBtn.classList.remove("danger");

      createPeerConnection(stream, false);

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.offer)
      );

      while (pendingRemoteCandidates.length) {
        await peerConnection.addIceCandidate(pendingRemoteCandidates.shift());
      }

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      ws.send(
        JSON.stringify({
          type: "answer",
          to: data.from,
          from: myUserName,
          answer,
        })
      );

      // switchView("video-interface"); // Moved up
      // switchSidebarTab("chat");
      // updateCallUI(callType); // Moved up

      // Start Timer
      startCallTimer();

      addMessage(`Connected to ${data.from}`, "system");
      remoteLabel.textContent = data.from;
    } catch (err) {
      console.error("Error in acceptCall:", err);
      showToast("Failed to accept call: " + err.message, "danger");
      // Clean up if failed
      endCall(false);
    }
  }

  function rejectCall(data) {
    ws.send(
      JSON.stringify({ type: "reject", to: data.from, from: myUserName })
    );
    showToast("Call declined", "info");

    // Stop preview tracks if any
    if (localVideo.srcObject) {
      localVideo.srcObject.getTracks().forEach((t) => t.stop());
      localVideo.srcObject = null;
    }

    // Reset view to chat
    switchView("chat-interface");
    selectedUser = null; // Or keep? User might want to chat.
    // If we reject, we probably want to stay on the chat screen with that user or go back.
    // Since we set selectedUser in handleOffer, let's keep it so they can chat.
  }

  async function handleAnswer(data) {
    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
      while (pendingRemoteCandidates.length) {
        await peerConnection.addIceCandidate(pendingRemoteCandidates.shift());
      }
      // Start Timer
      startCallTimer();

      // Hide Calling Overlay and Switch View
      callingOverlay.classList.add("hidden");
      switchView("video-interface");

      showToast("Call established", "success");
      remoteLabel.textContent = selectedUser;
    } catch (err) {
      console.error(err);
    }
  }

  function handleReject(data) {
    showToast(`${data.from} rejected the call`, "danger");
    callingOverlay.classList.add("hidden"); // Hide overlay
    endCall(false);
  }

  function handleHangup(data) {
    // Check if it's the current caller to stop ringing
    if (!isCallActive && incomingModal.classList.contains("hidden") === false) {
      // Incoming call was cancelled before answering
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
        pendingRemoteCandidates.push(candidate);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function createPeerConnection(stream, isCaller = false) {
    peerConnection = new RTCPeerConnection(config);
    stream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, stream));

    peerConnection.ontrack = (e) => {
      remoteVideo.srcObject = e.streams[0];
      remoteVideo.play().catch(() => {});
    };

    peerConnection.onicecandidate = (e) => {
      if (e.candidate && selectedUser) {
        ws.send(
          JSON.stringify({
            type: "ice",
            ice: e.candidate,
            to: selectedUser,
            from: myUserName,
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
  }

  function endCall(sendSignal = true) {
    isCallActive = false; // Reset active state
    stopCallTimer(); // Stop timer

    // Hide overlays
    if (callingOverlay) callingOverlay.classList.add("hidden");
    if (incomingModal) incomingModal.classList.add("hidden");

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (localVideo.srcObject) {
      localVideo.srcObject.getTracks().forEach((t) => t.stop());
      localVideo.srcObject = null;
    }
    remoteVideo.srcObject = null;

    if (sendSignal && selectedUser && ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({ type: "hangup", to: selectedUser, from: myUserName })
      );
    }

    // Reset UI
    switchView("chat-interface"); // Go back to chat
    // Optional: Go back to users? or stay on chat
    // selectedUser = null; // Keep selected user to continue chatting
    pendingRemoteCandidates = [];
  }

  // --- Chat Logic ---

  function sendChat(inputEl) {
    const text = inputEl.value.trim();
    if (!text || !selectedUser) return;

    // Send via WebSocket
    ws.send(
      JSON.stringify({
        type: "chat",
        to: selectedUser,
        from: myUserName,
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

  // Sidebar chat logic removed

  // --- Control Buttons ---

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

        // Toggle Local Avatar
        const localAudioPlaceholder = document.getElementById(
          "localAudioPlaceholder"
        );
        if (localAudioPlaceholder) {
          if (videoTrack.enabled) {
            localAudioPlaceholder.classList.add("hidden");
          } else {
            localAudioPlaceholder.classList.remove("hidden");
          }
        }

        // Send Signal to Remote Peer
        if (isCallActive && selectedUser) {
          ws.send(
            JSON.stringify({
              type: "video-toggle",
              to: selectedUser,
              from: myUserName,
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

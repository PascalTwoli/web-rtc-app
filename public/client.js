let ws;
let peerConnection;
let dataChannel;
let myUserName = null;
let selectedUser = null;

const config = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

document.addEventListener("DOMContentLoaded", () => {
  // DOM elements (safe to get now)
  const localVideo = document.getElementById("localVideo");
  const remoteVideo = document.getElementById("remoteVideo");
  const messages = document.getElementById("messages");
  const usersListEl = document.getElementById("usersList");
  const startBtn = document.getElementById("startCallBtn");
  const sendBtn = document.getElementById("sendBtn");
  const chatInput = document.getElementById("chatInput");
  const answerControls = document.getElementById("answerControls");
  const answerCallBtn = document.getElementById("answerCallBtn");
  const rejectCallBtn = document.getElementById("rejectCallBtn");
  const hangupBtn = document.getElementById("hangupBtn");
  const muteAudioBtn = document.getElementById("muteBtn");
  const muteVideoBtn = document.getElementById("videoBtn");
  const remoteRingtoneElement = document.getElementById("remoteRingtone");

  // Helper to add messages to chat area

  function addMessage(text, className = "system") {
    const div = document.createElement("div");
    div.className = "msg " + className;
    div.textContent = text;
    messages.appendChild(div);
    messages.scrollTop = messages.scrollHeight;
  }

  // WebSocket setup
  const wsProtocol = window.location.protocol === "https:" ? "wss" : "ws";
  const wsUrl = `${wsProtocol}://${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    myUserName = prompt("Enter your name:") || "Anonymous";
    addMessage("Connected to signaling server", "system");

    ws.send(JSON.stringify({ type: "join", username: myUserName }));
  };

  ws.onmessage = async (event) => {
    console.log("WebSocket message:", event.data);

    const data = JSON.parse(event.data);

    switch (data.type) {
      case "welcome":
        addMessage(data.message, "system");
        break;
      case "onlineUsers":
        updateUserList(data.users);
        break;
      case "offer":
        console.log("Received offer:", data);
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
      // Handle other message types (offer, answer, ice) here
      default:
        console.log("Unknown message type:", data.type);
        break;
    }
  };

  ws.onerror = (err) => {
    console.error("WebSocket error:", err);
    addMessage("Connection error: " + err, "system");
  };

  ws.onclose = () => {
    console.log("WebSocket closed");
    addMessage("Disconnected from server", "system");
  };

  // Helper to list users in UI
  function updateUserList(usernames) {
    usersListEl.innerHTML = "";
    usernames.forEach((name) => {
      if (name === myUserName) return;
      const li = document.createElement("li");
      li.textContent = name;
      li.onclick = () => {
        selectedUser = name;
        addMessage(`Selected ${name} to call`, "system");
      };
      usersListEl.appendChild(li);
    });
  }

  // Media
  async function startMedia() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error("getUserMedia not supported or insecure origin");
    }

    const localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true,
    });

    return localStream;
  }

  // Create RTCPeerConnection
  function createPeerConnection(someLocalStream, isCaller = false) {
    peerConnection = new RTCPeerConnection(config);

    // attach local tracks
    someLocalStream
      .getTracks()
      .forEach((track) => peerConnection.addTrack(track, someLocalStream));

    peerConnection.ontrack = (e) => {
      remoteVideo.srcObject = e.streams[0];
      const p = remoteVideo.play();
      if (p && typeof p.then === "function") p.catch(() => {});
    };

    peerConnection.onicecandidate = (e) => {
      if (e.candidate) {
        if (!selectedUser) {
          console.warn("No selectedUser to send ICE to");
          return;
        }
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

    // Only create data channel if caller
    if (isCaller) {
      dataChannel = peerConnection.createDataChannel("chat");
      setupDataChannel(dataChannel);
    }

    // Always listen for remote data channel
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannel(dataChannel);
    };
  }

  function setupDataChannel(channel) {
    channel.onopen = () => {
      console.log("DataChannel ready");
      addMessage("Data channel open", "system");
    };
    channel.onmessage = (e) => addMessage(e.data, "other");
    channel.onerror = (e) => console.error("DataChannel error:", e);
  }

  // Start a call to selectedUser
  async function startCall() {
    if (!selectedUser) {
      addMessage("No user selected to call", "system");
      return;
    }

    try {
      const localStream = await startMedia();
      localVideo.srcObject = localStream;
      const p = localVideo.play();
      if (p && typeof p.then === "function") p.catch(() => {});
      createPeerConnection(localStream, true);

      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
        usernameFragment: myUserName,
      });
      await peerConnection.setLocalDescription(offer);

      ws.send(
        JSON.stringify({
          type: "offer",
          to: selectedUser,
          from: myUserName,
          offer,
          myUserName,
        })
      );
      addMessage(`Calling ${selectedUser}...`, "system");
    } catch (err) {
      console.error("startCall failed:", err);
      addMessage("Start call failed: " + (err.message || err), "system");
    }
  }

  // Handle incoming offer
  async function handleOffer(data) {
    console.log("Handling offer from", data.from);

    // Display answer controls
    answerControls.style.display = "block";

    remoteRingtoneElement.muted = false;

    answerCallBtn.onclick = async () => {
      remoteRingtoneElement.muted = true;
      answerControls.style.display = "none";
      await acceptCall(data);
    };

    rejectCallBtn.onclick = async () => {
      remoteRingtoneElement.muted = true;
      answerControls.style.display = "none";

      await rejectCall(data);
    };
  }

  // Handle answer to our offer
  async function handleAnswer(data) {
    console.log("Handling answer from", data);
    try {
      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.answer)
      );
      addMessage(`Call established with ${data.from}`, "system");
    } catch (err) {
      console.error("handleAnswer failed:", err);
      addMessage("Handle answer failed: " + (err.message || err), "system");
    }
  }

  async function handleHangup(data) {
    console.log("Handling hangup from", data.from);
    addMessage(`Call ended by ${data.from}`, "system");
    // Clean up peer connection if needed
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
    if (localVideo && localVideo.srcObject) {
      localVideo.srcObject.getTracks().forEach((t) => t.stop());
      localVideo.srcObject = null;
    }
    if (remoteVideo) {
      remoteVideo.srcObject = null;
    }
  }

  async function acceptCall(data) {
    console.log("Accepting call from", data.from);

    // Stop ringtone
    remoteRingtoneElement.muted = true;

    try {
      const localStream = await startMedia();

      localVideo.srcObject = localStream;
      const p = localVideo.play();

      if (p && typeof p.then === "function") p.catch(() => {});

      createPeerConnection(localStream, false);

      await peerConnection.setRemoteDescription(
        new RTCSessionDescription(data.offer)
      );

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
      addMessage(`Call accepted, connected to ${data.from}`, "system");
    } catch (err) {
      console.error("acceptCall failed:", err);
      addMessage("Accept call failed: " + (err.message || err), "system");
    }
  }

  async function rejectCall(data) {
    console.log("Rejecting call from", data.from);

    // Stop ringtone
    remoteRingtoneElement.muted = true;

    ws.send(
      JSON.stringify({
        type: "reject",
        to: data.from,
        from: myUserName,
      })
    );
    addMessage(`Call from ${data.from} rejected`, "system");
  }

  // Handle call rejection
  function handleReject(data) {
    addMessage(`Your call to ${data.from} was rejected`, "system");
    // Clean up peer connection if needed
    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }
  }

  // Handle incoming ICE candidate
  async function handleIceCandidate(data) {
    // Start peer connection if not already started
    if (!peerConnection) {
      console.warn("PeerConnection not established yet");
      return;
    }

    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.ice));
    } catch (err) {
      console.error("handleIceCandidate failed:", err);
      addMessage(
        "Handle ICE candidate failed: " + (err.message || err),
        "system"
      );
    }
  }

  // Chat send
  function sendChat() {
    const text = chatInput.value;
    if (!text || !dataChannel || dataChannel.readyState !== "open") {
      console.warn("Cannot send: no data channel or not open");
      return;
    }
    dataChannel.send(text);
    addMessage(text, "me");
    chatInput.value = "";
  }

  // Attach buttons (no inline onclick needed)
  if (startBtn) startBtn.addEventListener("click", startCall);
  if (sendBtn) sendBtn.addEventListener("click", sendChat);

  if (hangupBtn)
    hangupBtn.addEventListener("click", () => {
      if (peerConnection) {
        peerConnection.getSenders().forEach((s) => {
          try {
            s.track && s.track.stop();
          } catch (_) {}
        });
        peerConnection.close();
        peerConnection = null;
      }
      if (localVideo && localVideo.srcObject) {
        localVideo.srcObject.getTracks().forEach((t) => t.stop());
        localVideo.srcObject = null;
      }
      if (remoteVideo) {
        remoteVideo.srcObject = null;
      }

      // Send a hangup signal if needed (not implemented in signaling yet)
      ws.send(
        JSON.stringify({
          type: "hangup",
          to: selectedUser,
          from: myUserName,
        })
      );

      addMessage("Call ended", "system");
    });

  if (muteAudioBtn)
    muteAudioBtn.addEventListener("click", () => {
      const stream = localVideo && localVideo.srcObject;
      if (!stream) return;
      stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
      addMessage("Toggled microphone", "system");
    });

  if (muteVideoBtn)
    muteVideoBtn.addEventListener("click", () => {
      const stream = localVideo && localVideo.srcObject;
      if (!stream) return;
      stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
      addMessage("Toggled camera", "system");
    });

  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        sendChat();
      }
    });
  }

  // Expose for debugging (optional)
  window.__webrtc = {
    startCall,
    ws,
    getSelectedUser: () => selectedUser,
    setSelectedUser: (u) => (selectedUser = u),
  };
});

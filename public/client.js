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

// IndexedDB for file storage
const FileStore = {
	db: null,

	init: () => {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open("PeersAppDB", 1);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				FileStore.db = request.result;
				resolve();
			};
			request.onupgradeneeded = (e) => {
				const db = e.target.result;
				if (!db.objectStoreNames.contains("files")) {
					const store = db.createObjectStore("files", {
						keyPath: "id",
						autoIncrement: true,
					});
					store.createIndex("timestamp", "timestamp", { unique: false });
					store.createIndex("sender", "sender", { unique: false });
				}
			};
		});
	},

	saveFile: (fileName, fileBlob, sender) => {
		return new Promise((resolve, reject) => {
			const store = FileStore.db
				.transaction(["files"], "readwrite")
				.objectStore("files");
			const file = {
				name: fileName,
				blob: fileBlob,
				type: fileBlob.type,
				size: fileBlob.size,
				sender: sender,
				timestamp: Date.now(),
			};
			const request = store.add(file);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
		});
	},

	getFiles: () => {
		return new Promise((resolve, reject) => {
			const store = FileStore.db
				.transaction(["files"], "readonly")
				.objectStore("files");
			const request = store.getAll();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result);
		});
	},

	deleteFile: (id) => {
		return new Promise((resolve, reject) => {
			const store = FileStore.db
				.transaction(["files"], "readwrite")
				.objectStore("files");
			const request = store.delete(id);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	},
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
	updateMessageStatus: (partner, messageId, newStatus) => {
		try {
			const key = `chat_${AppState.myUserName}_${partner}`;
			const messages = ChatStore.getMessages(partner);
			const msg = messages.find((m) => m.messageId === messageId);
			if (msg) {
				msg.status = newStatus;
				localStorage.setItem(key, JSON.stringify(messages));
			}
		} catch (e) {
			console.error("Failed to update message status", e);
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
	const emojiBtn = document.getElementById("emojiBtn");
	const emojiPicker = document.getElementById("emojiPicker");
	const filesBtn = document.getElementById("filesBtn");
	const fileManagerModal = document.getElementById("fileManagerModal");
	let selectedFile = null;

	// Typing indicator state/handlers
	let typingTimeout = null;
	let isTyping = false;
	let typingIndicator = document.getElementById("typingIndicator");
	let _typingRemovalTimer = null;
	let _typingRemovalHandler = null;

	function ensureTypingIndicator() {
		// Create a typing indicator bubble element appended to the messages container
		if (!typingIndicator) {
			typingIndicator = document.createElement("div");
			typingIndicator.id = "typingIndicator";
			// use message styling so it fits into the flow
			typingIndicator.className = "msg other typing-bubble-wrapper";
			// inner bubble with small initials avatar and three animated dots
			typingIndicator.innerHTML = `
				<div class="typing-bubble" aria-hidden="true">
				  <div class="typing-avatar" aria-hidden="true"></div>
				  <div class="typing-dots">
				    <span class="typing-dot"></span>
				    <span class="typing-dot"></span>
				    <span class="typing-dot"></span>
				  </div>
				</div>
			`;
			if (mainMessages) mainMessages.appendChild(typingIndicator);
		}
	}

	function showTypingIndicator(user) {
		// Only show typing for the currently selected chat partner
		if (!AppState.selectedUser || AppState.selectedUser !== user) return;
		ensureTypingIndicator();
		if (!typingIndicator) return;
		typingIndicator.dataset.user = user;

		// If there is a pending removal scheduled, cancel it so the element remains
		if (_typingRemovalTimer) {
			clearTimeout(_typingRemovalTimer);
			_typingRemovalTimer = null;
		}
		if (_typingRemovalHandler && typingIndicator) {
			typingIndicator.removeEventListener('transitionend', _typingRemovalHandler);
			_typingRemovalHandler = null;
		}

		// decorate bubble with user's initials and color accent
		try {
			const bubble = typingIndicator.querySelector(".typing-bubble");
			const avatar = typingIndicator.querySelector(".typing-avatar");
			if (bubble && avatar) {
				// compute an accent index from username deterministicly
				const hash = Array.from(user).reduce(
					(acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0,
					0
				);
				const idx = (Math.abs(hash) % 5) + 1; // 1..5
				// remove prior accent classes
				for (let i = 1; i <= 5; i++)
					bubble.classList.remove(`typing-bubble--accent-${i}`);
				bubble.classList.add(`typing-bubble--accent-${idx}`);

				// set initials and avatar background
				const initials = getInitials(user || "");
				avatar.textContent = initials;
				const hue = Math.abs(hash) % 360;
				const bg = `linear-gradient(135deg, hsl(${hue} 70% 48%), hsl(${
					(hue + 30) % 360
				} 70% 43%))`;
				avatar.style.background = bg;
			}
		} catch (e) {
			// non-fatal
		}
		// If we're currently hiding, cancel hide state
		typingIndicator.classList.remove("typing-hide");
		// Trigger the visible state which will animate opacity/transform
		// Force a reflow so the transition runs reliably
		typingIndicator.getBoundingClientRect();
		typingIndicator.classList.add("typing-visible");
		// Ensure bubble is last in the message list
		if (mainMessages && mainMessages.lastElementChild !== typingIndicator) {
			mainMessages.appendChild(typingIndicator);
			// keep scroll at bottom
			mainMessages.scrollTop = mainMessages.scrollHeight;
		}
	}

	function hideTypingIndicator() {
		if (!typingIndicator) return;

		// Start hide animation
		typingIndicator.classList.remove("typing-visible");
		typingIndicator.classList.add("typing-hide");

		// Clear any existing removal handler/timer
		if (_typingRemovalTimer) {
			clearTimeout(_typingRemovalTimer);
			_typingRemovalTimer = null;
		}
		if (_typingRemovalHandler && typingIndicator) {
			typingIndicator.removeEventListener('transitionend', _typingRemovalHandler);
			_typingRemovalHandler = null;
		}

		// Remove after transitionend OR fallback timeout in case event doesn't fire
		_typingRemovalHandler = (e) => {
			// remove on first transition end (opacity or transform)
			if (!typingIndicator) return;
			if (typingIndicator.classList.contains('typing-hide')) {
				if (typingIndicator.parentNode) typingIndicator.parentNode.removeChild(typingIndicator);
				typingIndicator = null;
			}
			// cleanup
			if (_typingRemovalTimer) { clearTimeout(_typingRemovalTimer); _typingRemovalTimer = null; }
			typingIndicator && typingIndicator.removeEventListener('transitionend', _typingRemovalHandler);
			_typingRemovalHandler = null;
		};

		if (typingIndicator) {
			typingIndicator.addEventListener('transitionend', _typingRemovalHandler);
			// fallback: remove after slightly longer than CSS transition (280ms)
			_typingRemovalTimer = setTimeout(() => {
				if (typingIndicator && typingIndicator.classList.contains('typing-hide')) {
					if (typingIndicator.parentNode) typingIndicator.parentNode.removeChild(typingIndicator);
					typingIndicator = null;
				}
				if (_typingRemovalHandler && typingIndicator) typingIndicator.removeEventListener('transitionend', _typingRemovalHandler);
				_typingRemovalHandler = null;
				_typingRemovalTimer = null;
			}, 420);
		}
	}

	// Force-remove typing indicator immediately (no animation) - used when a message arrives
	function removeTypingIndicatorImmediately() {
		if (!typingIndicator) return;
		// clear pending handlers/timers
		if (_typingRemovalTimer) {
			clearTimeout(_typingRemovalTimer);
			_typingRemovalTimer = null;
		}
		if (_typingRemovalHandler) {
			try { typingIndicator.removeEventListener('transitionend', _typingRemovalHandler); } catch (e) {}
			_typingRemovalHandler = null;
		}

		// remove from DOM immediately
		if (typingIndicator.parentNode) typingIndicator.parentNode.removeChild(typingIndicator);
		typingIndicator = null;
	}

	// Send typing state to the other peer (via dataChannel when in-call, otherwise WS)
	function sendTyping(typing) {
		if (!AppState.selectedUser || !AppState.myUserName) return;
		const payload = {
			type: "typing",
			to: AppState.selectedUser,
			from: AppState.myUserName,
			isTyping: !!typing,
		};

		try {
			if (AppState.isCallActive && dataChannel?.readyState === "open") {
				dataChannel.send(JSON.stringify(payload));
			} else if (ws && ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify(payload));
			}
		} catch (e) {
			console.warn("Failed to send typing payload", e);
		}
	}

	// Debounced input handler to announce typing
	if (mainChatInput) {
		mainChatInput.addEventListener("input", () => {
			if (!AppState.selectedUser) return;
			if (!isTyping) {
				sendTyping(true);
				isTyping = true;
			}
			if (typingTimeout) clearTimeout(typingTimeout);
			typingTimeout = setTimeout(() => {
				sendTyping(false);
				isTyping = false;
			}, 2000);
		});
	}

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

	// Helper: update message status in DOM
	function updateMessageStatus(messageId, newStatus) {
		if (!messageId) return;
		// Find element with matching dataset.messageId
		const el = document.querySelector(`.msg[data-message-id="${messageId}"]`);
		if (!el) return;
		const statusSpan = el.querySelector(".msg-status");
		if (!statusSpan) return;
		statusSpan.className = `msg-status status-${newStatus}`;
		if (newStatus === "sent") {
			statusSpan.innerHTML = `<i class="bi bi-check2 tick"></i>`;
		} else if (newStatus === "delivered") {
			statusSpan.innerHTML = `<i class="bi bi-check2-all tick"></i>`;
		} else if (newStatus === "read") {
			statusSpan.innerHTML = `<i class="bi bi-check2-all tick"></i>`;
		}
	}

	// Mark messages from currently open chat as read and notify sender
	function markMessagesRead(user) {
		if (!user) return;
		const messages = ChatStore.getMessages(user) || [];
		const unread = messages.filter(
			(m) => m.type === "other" && m.status !== "read" && m.messageId
		);
		unread.forEach((m) => {
			// Update local store
			if (ChatStore.updateMessageStatus)
				ChatStore.updateMessageStatus(user, m.messageId, "read");
			// Update UI
			updateMessageStatus(m.messageId, "read");
			// Notify sender via server
			ws.send(
				JSON.stringify({
					type: "read",
					to: m.from,
					from: AppState.myUserName,
					messageId: m.messageId,
					timestamp: Date.now(),
				})
			);
		});
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
		let fileId = null;
		let fileName = null;
		let fileSize = null;
		let fileType = null;
		let messageId = null;
		let status = null; // 'sent' | 'delivered' | 'read' | null

		if (typeof textOrObj === "object") {
			text = textOrObj.text;
			timestamp = textOrObj.timestamp;
			fileId = textOrObj.fileId;
			fileName = textOrObj.fileName;
			fileSize = textOrObj.fileSize;
			fileType = textOrObj.fileType;
			messageId = textOrObj.messageId || null;
			status = textOrObj.status || null;
		}

		const createMsg = (container) => {
			if (!container) return;
			const div = document.createElement("div");
			div.className = "msg " + className;
			if (messageId) div.dataset.messageId = messageId;

			if (fromUser && className === "other") {
				const strong = document.createElement("strong");
				strong.textContent = fromUser;
				div.appendChild(strong);
				div.appendChild(document.createElement("br"));
			}

			// Check if this is a file message
			if (fileId && fileName) {
				const fileContainer = document.createElement("div");
				fileContainer.className = "file-message";
				fileContainer.dataset.fileId = fileId; // Add for easy removal when deleted

				// Check if it's an image
				const isImage = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(fileName);

				if (isImage) {
					// Show image preview
					const preview = document.createElement("img");
					preview.className = "file-preview-img";
					preview.style.maxWidth = "200px";
					preview.style.maxHeight = "200px";
					preview.style.borderRadius = "6px";
					preview.style.cursor = "pointer";
					preview.dataset.fileId = fileId;
					preview.onclick = () => window.downloadFile(fileId, fileName);

					// Get the image blob and create preview
					const transaction = FileStore.db.transaction(
						["files"],
						"readonly"
					);
					const store = transaction.objectStore("files");
					const request = store.get(fileId);
					request.onsuccess = () => {
						const file = request.result;
						if (file && file.blob) {
							const url = URL.createObjectURL(file.blob);
							preview.src = url;
						}
					};

					fileContainer.appendChild(preview);
				}

				// File info bar
				const infoBar = document.createElement("div");
				infoBar.className = "file-info-bar";
				infoBar.innerHTML = `
          <span class="file-icon">📎</span>
          <span class="file-details">
            <div class="file-name" title="${fileName}">${fileName}</div>
            <div class="file-meta">${formatFileSize(fileSize || 0)}</div>
          </span>
          <div class="file-buttons">
            <button class="file-btn download-btn" data-id="${fileId}" title="Download">⬇️</button>
            <button class="file-btn delete-btn" data-id="${fileId}" title="Delete">🗑️</button>
          </div>
        `;

				// Attach event handlers
				infoBar.querySelector(".download-btn").onclick = (e) => {
					e.stopPropagation();
					window.downloadFile(fileId, fileName);
				};
				infoBar.querySelector(".delete-btn").onclick = (e) => {
					e.stopPropagation();
					window.deleteFileFromChat(fileId);
				};

				fileContainer.appendChild(infoBar);
				div.appendChild(fileContainer);
			} else if (className === "other") {
				div.appendChild(document.createTextNode(text));
			} else {
				div.textContent = text;
			}

			// Status ticks for outgoing messages
			if (className === "me") {
				const statusSpan = document.createElement("span");
				statusSpan.className = `msg-status ${
					status ? "status-" + status : "status-sent"
				}`;
				statusSpan.innerHTML = `<i class="bi bi-check2 tick"></i>`; // single tick by default
				// two ticks for delivered/read
				if (status === "delivered")
					statusSpan.innerHTML = `<i class="bi bi-check2-all tick"></i>`;
				if (status === "read")
					statusSpan.innerHTML = `<i class="bi bi-check2-all tick"></i>`;
				div.appendChild(statusSpan);
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

	// Initialize IndexedDB
	FileStore.init().catch((err) =>
		console.error("Failed to initialize FileStore", err)
	);

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

	//helper to send read acks
	function sendReadAck(fromUser, messageId) {
		if (!fromUser || !messageId) return;

		ws.send(
			JSON.stringify({
				type: "read",
				to: fromUser,
				from: AppState.myUserName,
				messageId,
			})
		);
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

			// if (data.type === "chat") {
			//   if (AppState.isCallActive && dataChannel?.readyState === "open") {
			//     return; // DataChannel owns chat now
			//   }
			// }

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
					const remoteAudioLabel =
						document.getElementById("remoteAudioLabel");

					if (data.enabled) {
						audioOnlyPlaceholder.classList.add("fade-out");
					} else {
						audioOnlyPlaceholder.classList.remove("fade-out");
						audioOnlyPlaceholder.classList.remove("hidden");
						if (remoteAudioLabel)
							remoteAudioLabel.textContent = data.from;
						if (remoteAvatarCircle)
							remoteAvatarCircle.textContent = getInitials(data.from);
					}
					break;
				// case "chat":
				//     // ⛔ If DataChannel is active, ignore WS chat
				//   if (AppState.isCallActive && dataChannel?.readyState === "open") {
				//     return;
				//   }
				//   // Save incoming message and ACK delivery back to sender
				//   const incoming = {
				//     text: data.text,
				//     type: "other",
				//     from: data.from,
				//     messageId: data.messageId || null,
				//     timestamp: data.timestamp || Date.now(),
				//     status: "delivered",
				//   };

				//   if (data.from !== AppState.selectedUser) {
				//     showToast(`New message from ${data.from}`, "info");
				//     ChatStore.saveMessage(data.from, incoming);
				//     addMessage(incoming, "other", data.from);
				//   }

				//   // Send delivered ack back to the original sender via server
				//   if (data.messageId) {
				//     ws.send(
				//       JSON.stringify({
				//         type: "delivered",
				//         to: data.from,
				//         from: AppState.myUserName,
				//         messageId: data.messageId,
				//         timestamp: Date.now(),
				//       })
				//     );
				//   }
				//  break;

				case "chat": {
					// ⛔ If DataChannel is active, ignore WS chat
					if (
						AppState.isCallActive &&
						dataChannel?.readyState === "open"
					) {
						return;
					}

					const incoming = {
						text: data.text,
						type: "other",
						from: data.from,
						messageId: data.messageId,
						timestamp: data.timestamp,
						status: "delivered",
					};

					ChatStore.saveMessage(data.from, incoming);

					if (data.from === AppState.selectedUser) {
						// remove typing indicator immediately so incoming message doesn't leave extra space
						removeTypingIndicatorImmediately();
						addMessage(incoming, "other", data.from);

						// ✅ AUTO-READ when chat is open
						sendReadAck(data.from, data.messageId);
					} else {
						showToast(`New message from ${data.from}`, "info");
					}

					// delivered ACK (always)
					ws.send(
						JSON.stringify({
							type: "delivered",
							to: data.from,
							from: AppState.myUserName,
							messageId: data.messageId,
						})
					);

					break;
				}

				case "file-message":
					// Handle file received via WebSocket
					const binaryString = atob(data.fileData);
					const bytes = new Uint8Array(binaryString.length);
					for (let i = 0; i < binaryString.length; i++) {
						bytes[i] = binaryString.charCodeAt(i);
					}
					const fileBlob = new Blob([bytes], { type: data.fileType });

					// Save to IndexedDB and get the file ID
					FileStore.saveFile(data.fileName, fileBlob, data.from)
						.then((fileId) => {
							const fileMsg = `📎 Received file: ${data.fileName}`;
							if (data.from !== AppState.selectedUser) {
								showToast(
									`File from ${data.from}: ${data.fileName}`,
									"info"
								);
								ChatStore.saveMessage(data.from, {
									text: fileMsg,
									fileId: fileId,
									fileName: data.fileName,
									fileSize: data.fileSize,
									fileType: data.fileType,
									type: "other",
									from: data.from,
								});
							} else {
								addMessage(
									{
										text: fileMsg,
										fileId: fileId,
										fileName: data.fileName,
										fileSize: data.fileSize,
										fileType: data.fileType,
									},
									"other",
									data.from
								);
								ChatStore.saveMessage(data.from, {
									text: fileMsg,
									fileId: fileId,
									fileName: data.fileName,
									fileSize: data.fileSize,
									fileType: data.fileType,
									type: "other",
									from: data.from,
								});
							}
							showToast(`File saved: ${data.fileName}`, "success");
						})
						.catch((err) => {
							console.error("Failed to save file:", err);
							addMessage(
								`Error saving file: ${data.fileName}`,
								"system"
							);
						});
					break;
				case "delivered":
					// Update message status to delivered (two grey ticks)
					if (data.messageId) {
						updateMessageStatus(data.messageId, "delivered");
						// Persist status change
						ChatStore.updateMessageStatus &&
							ChatStore.updateMessageStatus(
								data.from,
								data.messageId,
								"delivered"
							);
					}
					break;

				case "typing":
					// Server sends { type: 'typing', isTyping: true|false, from }
					if (data.from === AppState.selectedUser) {
						if (data.isTyping) showTypingIndicator(data.from);
						else hideTypingIndicator();
					}
					break;

				case "read":
					// Update message status to read (two purple ticks)
					if (data.messageId) {
						updateMessageStatus(data.messageId, "read");
						ChatStore.updateMessageStatus &&
							ChatStore.updateMessageStatus(
								data.from,
								data.messageId,
								"read"
							);
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
		if (remoteAvatarCircle)
			remoteAvatarCircle.textContent = getInitials(user);

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
					type === "video"
						? { facingMode: AppState.currentFacingMode }
						: false,
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
				if (audioTrack && !audioTrack.enabled)
					muteBtn.classList.add("danger");

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
		if (!channel || channel._initialized) return;
		channel._initialized = true;
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
						const fileName = window.incomingFile.name;
						const fileSize = window.incomingFile.size;
						const fileType = window.incomingFile.type;
						const blob = new Blob(window.incomingFile.chunks, {
							type: fileType,
						});

						// Save to IndexedDB and get the file ID
						FileStore.saveFile(fileName, blob, AppState.selectedUser)
							.then((fileId) => {
								const fileMsg = `📎 Received file: ${fileName}`;
								addMessage(
									{
										text: fileMsg,
										fileId: fileId,
										fileName: fileName,
										fileSize: fileSize,
										fileType: fileType,
									},
									"other"
								);
								ChatStore.saveMessage(AppState.selectedUser, {
									text: fileMsg,
									fileId: fileId,
									fileName: fileName,
									fileSize: fileSize,
									fileType: fileType,
									type: "other",
									from: AppState.selectedUser,
								});
								showToast(`File saved: ${fileName}`, "success");
							})
							.catch((err) => {
								console.error("Failed to save file:", err);
								addMessage(`Error saving file: ${fileName}`, "system");
							});

						window.incomingFile = null;
					}
					return;
				}

				// typing events over DataChannel (sent by peer when in-call)
				if (msg.type === "typing") {
					// msg: { type: 'typing', isTyping: true|false, from }
					if (msg.from === AppState.selectedUser) {
						if (msg.isTyping) showTypingIndicator(msg.from);
						else hideTypingIndicator();
					}
					return;
				}

				// Other string messages (chat)
				if (msg.type === "chat") {
					const incoming = {
						text: msg.text,
						type: "other",
						from: msg.from,
						messageId: msg.messageId,
						timestamp: msg.timestamp,
						status: "delivered",
					};

					ChatStore.saveMessage(msg.from, incoming);
					// remove typing indicator immediately so incoming message doesn't leave extra space
					removeTypingIndicatorImmediately();
					addMessage(incoming, "other", msg.from);

					// delivered ACK
					ws.send(
						JSON.stringify({
							type: "delivered",
							to: msg.from,
							from: AppState.myUserName,
							messageId: msg.messageId,
						})
					);

					// ✅ AUTO-READ (this was missing completely)
					if (AppState.selectedUser === msg.from) {
						sendReadAck(msg.from, msg.messageId);
					}
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
					console.warn(
						"Ringtone playback failed (autoplay policy?):",
						error
					);

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

		// Clear any typing indicators when switching chats
		hideTypingIndicator();

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

		// Mark messages as read when opening a chat
		markMessagesRead(user);
	}

	function sendChat(inputEl) {
		const text = inputEl.value.trim();
		if (!text || !AppState.selectedUser) return;

		//create a unique messageId so we can track delivery/read acks
		const messageId = `${Date.now()}-${Math.random()
			.toString(16)
			.slice(2, 8)}`;

		//send chat with id
		sendChatMessage({
			type: "chat",
			to: AppState.selectedUser,
			from: AppState.myUserName,
			text,
			messageId,
			timestamp: Date.now(),
		});

		//persist locally  with status 'sent'
		ChatStore.saveMessage(AppState.selectedUser, {
			text: text,
			type: "me",
			from: AppState.myUserName,
			messageId: messageId,
			status: "sent",
			timestamp: Date.now(),
		});

		//Immediately show as sent (one tick)
		addMessage(
			{ text, messageId, status: "sent", timestamp: Date.now() },
			"me"
		);
		// Stop typing indicator when message is sent
		try {
			sendTyping(false);
		} catch (e) {}
		isTyping = false;
		inputEl.value = "";
	}

	//chat use one transport at a time
	function sendChatMessage(payload) {
		if (AppState.isCallActive && dataChannel?.readyState === "open") {
			dataChannel.send(JSON.stringify(payload));
		} else {
			ws.send(JSON.stringify(payload));
		}
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

	// Emoji Picker with Categories
	const emojiCategories = window.EMOJI_CATEGORIES || {};
	const emojis = window.EMOJIS || ["😀", "😂"];

	// Show emoji picker (do not auto-close on selection; user must press close)
	emojiBtn.onclick = () => {
		emojiPicker.classList.remove("hidden");
		closeMenu(); // Close the chat menu

		// Populate once
		if (!emojiPicker.dataset.initialized) {
			// Header with category buttons and close button
			const categoryButtons = Object.entries(emojiCategories)
				.map(
					([emoji, data]) =>
						`<button class="emoji-category-btn" data-category="${data.name}" title="${data.name}">${emoji}</button>`
				)
				.join("");
			const header = `<div class="emoji-header"><div class="emoji-categories">${categoryButtons}</div><button id="emojiCloseBtn" class="emoji-close-btn">Close</button></div>`;

			// Grid with emojis organized by category - headers span full width, emojis flow naturally
			let gridContent = "";
			Object.entries(emojiCategories).forEach(([_, data]) => {
				gridContent += `<h3 class="emoji-category-header" data-category="${data.name}" style="margin: 8px 0 4px; font-size: 12px; color: var(--text-secondary);">${data.name}</h3>`;
				gridContent += data.emojis
					.map((emoji) => `<button class="emoji-item">${emoji}</button>`)
					.join("");
			});
			const grid = `<div class="emoji-grid">${gridContent}</div>`;
			emojiPicker.innerHTML = header + grid;

			// Attach handlers for close button
			const closeBtn = emojiPicker.querySelector("#emojiCloseBtn");
			if (closeBtn) {
				closeBtn.onclick = (e) => {
					e.stopPropagation();
					emojiPicker.classList.add("hidden");
				};
			}

			// Attach handlers for category buttons (scroll to category)
			emojiPicker.querySelectorAll(".emoji-category-btn").forEach((btn) => {
				btn.onclick = (e) => {
					e.stopPropagation();
					const category = btn.dataset.category;
					const header = emojiPicker.querySelector(
						`.emoji-category-header[data-category="${category}"]`
					);
					if (header) {
						const grid = emojiPicker.querySelector(".emoji-grid");
						grid.scrollTop = header.offsetTop - 8; // Scroll to header with slight offset
					}
				};
			});

			// Attach handlers for emoji buttons
			emojiPicker.querySelectorAll(".emoji-item").forEach((btn) => {
				btn.onclick = (e) => {
					e.stopPropagation();
					mainChatInput.value += btn.textContent;
					mainChatInput.focus();
					// do NOT close picker to allow multiple selections
				};
			});

			emojiPicker.dataset.initialized = "1";
		}
	};

	// File Manager Modal
	async function showFileManager() {
		fileManagerModal.classList.remove("hidden");

		// Populate file list
		try {
			const files = await FileStore.getFiles();
			let html = `<div class="file-manager-header">
        <h3>Saved Files (${files.length})</h3>
        <button class="file-manager-close-btn" id="fileManagerCloseBtn">Close</button>
      </div>`;

			if (files.length === 0) {
				html += `<div class="file-list-empty">No files saved yet</div>`;
			} else {
				html += `<div class="file-list">`;
				files.forEach((file) => {
					const date = new Date(file.timestamp).toLocaleDateString();
					html += `<div class="file-item">
            <div class="file-info">
              <div class="file-name" title="${file.name}">${file.name}</div>
              <div class="file-meta">${formatFileSize(
						file.size
					)} • ${date}</div>
            </div>
            <div class="file-actions">
              <button class="file-action-btn" data-id="${
						file.id
					}" onclick="downloadFile(${file.id}, '${file.name}')">⬇️</button>
              <button class="file-action-btn delete" data-id="${
						file.id
					}" onclick="deleteFile(${file.id})">🗑️</button>
            </div>
          </div>`;
				});
				html += `</div>`;
			}

			fileManagerModal.innerHTML = html;

			// Attach close handler
			const closeBtn = fileManagerModal.querySelector(
				"#fileManagerCloseBtn"
			);
			if (closeBtn) {
				closeBtn.onclick = (e) => {
					e.stopPropagation();
					fileManagerModal.classList.add("hidden");
				};
			}
		} catch (err) {
			console.error("Failed to load files:", err);
			fileManagerModal.innerHTML = `<div class="file-manager-header">
        <h3>Saved Files</h3>
        <button class="file-manager-close-btn" id="fileManagerCloseBtn">Close</button>
      </div>
      <div class="file-list-empty">Error loading files</div>`;
		}
	}

	// Make functions global for onclick handlers
	window.downloadFile = async (id, fileName) => {
		try {
			const transaction = FileStore.db.transaction(["files"], "readonly");
			const store = transaction.objectStore("files");
			const request = store.get(id);

			request.onsuccess = () => {
				const file = request.result;
				if (file && file.blob) {
					const url = URL.createObjectURL(file.blob);
					const a = document.createElement("a");
					a.href = url;
					a.download = fileName;
					a.click();
					URL.revokeObjectURL(url);
					showToast(`Downloaded: ${fileName}`, "success");
				}
			};
		} catch (err) {
			console.error("Failed to download file:", err);
			showToast("Failed to download file", "danger");
		}
	};

	window.deleteFile = async (id) => {
		try {
			await FileStore.deleteFile(id);
			showToast("File deleted", "info");
			showFileManager(); // Refresh
		} catch (err) {
			console.error("Failed to delete file:", err);
			showToast("Failed to delete file", "danger");
		}
	};

	window.deleteFileFromChat = async (id) => {
		try {
			await FileStore.deleteFile(id);
			// Remove file message from chat display
			const fileMessages = document.querySelectorAll(
				`[data-file-id="${id}"]`
			);
			fileMessages.forEach((msg) => {
				msg.remove();
			});
			showToast("File deleted from chat", "info");
		} catch (err) {
			console.error("Failed to delete file from chat:", err);
			showToast("Failed to delete file", "danger");
		}
	};

	// Chat Menu Toggle (Mobile Only)
	const chatMenuBtn = document.getElementById("chatMenuBtn");
	const chatMenu = document.getElementById("chatMenu");

	if (chatMenuBtn) {
		chatMenuBtn.onclick = (e) => {
			e.stopPropagation();
			chatMenu.classList.toggle("hidden");
		};
	}

	// Close menu when clicking outside
	const closeMenu = () => {
		if (chatMenu) chatMenu.classList.add("hidden");
	};

	document.addEventListener("click", (e) => {
		if (
			chatMenuBtn &&
			!chatMenuBtn.contains(e.target) &&
			chatMenu &&
			!chatMenu.contains(e.target)
		) {
			closeMenu();
		}
	});

	// Desktop file upload button
	if (fileUploadBtn) {
		fileUploadBtn.onclick = () => {
			const fileInput = document.createElement("input");
			fileInput.type = "file";
			fileInput.onchange = () => {
				selectedFile = fileInput.files[0];
				if (selectedFile) {
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
	}

	// Mobile file upload button
	const fileUploadBtnMobile = document.getElementById("uploadFileBtn-mobile");
	if (fileUploadBtnMobile) {
		fileUploadBtnMobile.onclick = () => {
			const fileInput = document.createElement("input");
			fileInput.type = "file";
			fileInput.onchange = () => {
				selectedFile = fileInput.files[0];
				if (selectedFile) {
					const chatInput = document.getElementById("mainChatInput");
					chatInput.value = `📎 ${selectedFile.name} (${formatFileSize(
						selectedFile.size
					)})`;
					chatInput.disabled = false;
					console.log("File selected:", selectedFile.name);
				}
			};
			fileInput.click();
			closeMenu();
		};
	}

	filesBtn.onclick = () => {
		showFileManager();
	};

	// Mobile files button
	const filesBtnMobile = document.getElementById("filesBtn-mobile");
	if (filesBtnMobile) {
		filesBtnMobile.onclick = () => {
			showFileManager();
			closeMenu();
		};
	}

	// Mobile emoji button
	const emojiBtnMobile = document.getElementById("emojiBtn-mobile");
	if (emojiBtnMobile) {
		emojiBtnMobile.onclick = () => {
			emojiBtn.click(); // Trigger the desktop emoji button
			closeMenu();
		};
	}

	// on click mainSendBtn or enter key, send chat message or file if selected
	mainSendBtn.onclick = () => {
		if (selectedFile) {
			// Use DataChannel if on call, otherwise use WebSocket
			if (
				AppState.isCallActive &&
				dataChannel &&
				dataChannel.readyState === "open"
			) {
				sendFileViaDataChannel(selectedFile);
			} else {
				sendFileViaWebSocket(selectedFile);
			}
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
				// Use DataChannel if on call, otherwise use WebSocket
				if (
					AppState.isCallActive &&
					dataChannel &&
					dataChannel.readyState === "open"
				) {
					sendFileViaDataChannel(selectedFile);
				} else {
					sendFileViaWebSocket(selectedFile);
				}
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
			addMessage(
				"Error: No active connection. Start a call first.",
				"system"
			);
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
				// Store sent file to IndexedDB
				FileStore.saveFile(file.name, file, AppState.selectedUser).then(
					(fileId) => {
						const fileMsg = `📎 Sent file: ${file.name}`;
						addMessage(
							{
								text: fileMsg,
								fileId: fileId,
								fileName: file.name,
								fileSize: file.size,
								fileType: file.type,
							},
							"me"
						);
						ChatStore.saveMessage(AppState.selectedUser, {
							text: fileMsg,
							fileId: fileId,
							fileName: file.name,
							fileSize: file.size,
							fileType: file.type,
							type: "me",
							from: AppState.myUserName,
						});
					}
				);
			}
		};

		const firstChunk = file.slice(0, CHUNK_SIZE);
		reader.readAsArrayBuffer(firstChunk);
	}

	// Send file via WebSocket (for when not on call)
	function sendFileViaWebSocket(file) {
		if (!AppState.selectedUser) {
			addMessage("Error: No user selected", "system");
			return;
		}

		const reader = new FileReader();
		reader.onload = (e) => {
			const bytes = new Uint8Array(e.target.result);

			// Convert to base64 in chunks to avoid "Invalid array length" error
			let base64 = "";
			const chunkSize = 8192;
			for (let i = 0; i < bytes.length; i += chunkSize) {
				const chunk = bytes.subarray(i, i + chunkSize);
				base64 += String.fromCharCode.apply(null, chunk);
			}
			base64 = btoa(base64);

			ws.send(
				JSON.stringify({
					type: "file-message",
					to: AppState.selectedUser,
					from: AppState.myUserName,
					fileName: file.name,
					fileType: file.type,
					fileSize: file.size,
					fileData: base64,
				})
			);

			// Store sent file to IndexedDB
			FileStore.saveFile(file.name, file, AppState.selectedUser).then(
				(fileId) => {
					const fileMsg = `📎 Sent file: ${file.name}`;
					addMessage(
						{
							text: fileMsg,
							fileId: fileId,
							fileName: file.name,
							fileSize: file.size,
							fileType: file.type,
						},
						"me"
					);
					ChatStore.saveMessage(AppState.selectedUser, {
						text: fileMsg,
						fileId: fileId,
						fileName: file.name,
						fileSize: file.size,
						fileType: file.type,
						type: "me",
						from: AppState.myUserName,
					});
				}
			);
		};

		reader.readAsArrayBuffer(file);
	}

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

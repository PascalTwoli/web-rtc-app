import { useState, useRef, useEffect, useCallback } from "react";
import { useApp } from "../context/AppContext";
import {
	ArrowLeft,
	Phone,
	PhoneOff,
	PhoneMissed,
	Video,
	Send,
	Smile,
	Paperclip,
	FolderOpen,
	Bookmark,
	Trash2,
	X,
	Plus,
	Play,
	Download,
	Clock,
} from "lucide-react";
import clsx from "clsx";
import EmojiPicker from "./EmojiPicker";
import FilePreviewModal from "./FilePreviewModal";
import MediaViewerModal from "./MediaViewerModal";
import SavedFilesModal from "./SavedFilesModal";
import { saveFile, deleteMessage as deleteMessageFromDB } from "../services/storageService";

// Custom check icons for message status (bolder stroke)
const CheckIcon = ({ className = "" }) => (
	<svg className={className} viewBox="0 0 16 16" fill="currentColor" width="14" height="14" style={{ strokeWidth: 1 }}>
		<path d="M13.485 3.929a1 1 0 0 1 .057 1.413l-6.5 7a1 1 0 0 1-1.436.033l-3.5-3.5a1 1 0 1 1 1.414-1.414l2.757 2.757 5.794-6.232a1 1 0 0 1 1.414-.057z"/>
	</svg>
);

const CheckAllIcon = ({ className = "" }) => (
	<svg className={className} viewBox="0 0 16 16" fill="currentColor" width="16" height="16">
		<path d="M12.354 3.646a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414 0l-3.5-3.5a1 1 0 1 1 1.414-1.414L4.5 9.793l6.146-6.147a1 1 0 0 1 1.414 0z"/>
		<path d="M7.354 10.354l-1-1 1.414-1.414 1 1-1.414 1.414zM15.354 3.646a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414 0l-.293-.293 1.414-1.414.293.293 6.293-6.293a1 1 0 0 1 1.414 0z"/>
	</svg>
);

export default function ChatInterface() {
	const {
		username,
		selectedUser,
		callPeer,
		setSelectedUser,
		messages,
		typingUsers,
		isCallActive,
		setCurrentView,
		setSidebarOpen,
		handleStartCall,
		handleSendMessage,
		sendTypingStatus,
		sendMessage,
		deleteLocalMessages,
		localStream,
		isMuted,
		onlineUsers,
	} = useApp();

	// Ensure audio track stays enabled during call when viewing chat
	useEffect(() => {
		if (isCallActive && localStream && !isMuted) {
			const audioTrack = localStream.getAudioTracks()[0];
			if (audioTrack && !audioTrack.enabled) {
				audioTrack.enabled = true;
			}
		}
	}, [isCallActive, localStream, isMuted]);

	const [inputValue, setInputValue] = useState("");
	const [showEmoji, setShowEmoji] = useState(false);
	const [selectedFile, setSelectedFile] = useState(null);
	const [showFilePreview, setShowFilePreview] = useState(false);
	const [viewingMedia, setViewingMedia] = useState(null);
	const [showSavedFiles, setShowSavedFiles] = useState(false);
	const [selectedMessages, setSelectedMessages] = useState(new Set());
	const [isSelectionMode, setIsSelectionMode] = useState(false);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [showAttachMenu, setShowAttachMenu] = useState(false);
	const messagesEndRef = useRef(null);
	const inputRef = useRef(null);
	const fileInputRef = useRef(null);
	const attachMenuRef = useRef(null);
	const typingTimeoutRef = useRef(null);
	const typingIntervalRef = useRef(null);
	const isTypingRef = useRef(false);
	const longPressTimerRef = useRef(null);

	const userMessages = messages[selectedUser] || [];
	const isPeerTyping = selectedUser && typingUsers[selectedUser];
	
	// Get all media files from messages for navigation
	const mediaFiles = userMessages.filter(msg => 
		(msg.type === 'file' || msg.type === 'file-message') && 
		(msg.fileType?.startsWith('image/') || msg.fileType?.startsWith('video/'))
	);
	const viewingMediaIndex = viewingMedia ? mediaFiles.findIndex(m => m.messageId === viewingMedia.messageId) : -1;

	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [userMessages]);

	// Cleanup typing timeout on unmount
	useEffect(() => {
		return () => {
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
			}
			if (typingIntervalRef.current) {
				clearInterval(typingIntervalRef.current);
			}
			if (isTypingRef.current) {
				sendTypingStatus(false);
			}
		};
	}, [sendTypingStatus]);

	// Click outside to close attachment menu
	useEffect(() => {
		const handleClickOutside = (e) => {
			if (showAttachMenu && attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
				setShowAttachMenu(false);
			}
		};
		document.addEventListener('mousedown', handleClickOutside);
		return () => document.removeEventListener('mousedown', handleClickOutside);
	}, [showAttachMenu]);

	// Escape key to go back
	useEffect(() => {
		const handleKeyDown = (e) => {
			if (e.key === 'Escape') {
				if (showAttachMenu) {
					setShowAttachMenu(false);
				} else if (!isCallActive && !showFilePreview && !viewingMedia && !showSavedFiles && !showDeleteModal) {
					setCurrentView('placeholder');
					setSelectedUser(null);
				}
			}
		};
		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [isCallActive, showFilePreview, viewingMedia, showSavedFiles, showDeleteModal, showAttachMenu, setCurrentView, setSelectedUser]);

	const getInitials = (name) => {
		if (!name) return "??";
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase()
			.substring(0, 2);
	};

	const getAvatarColor = (name) => {
		const hash = Array.from(name || "").reduce(
			(acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0,
			0
		);
		const hue = Math.abs(hash) % 360;
		return `linear-gradient(135deg, hsl(${hue}, 70%, 48%), hsl(${
			(hue + 30) % 360
		}, 70%, 43%))`;
	};

	const formatCallDuration = (seconds) => {
		if (!seconds) return '0:00';
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	};

	const handleSubmit = (e) => {
		e?.preventDefault();
		if (inputValue.trim()) {
			handleSendMessage(inputValue);
			setInputValue("");
			// Reset textarea height
			if (inputRef.current) {
				inputRef.current.style.height = 'auto';
			}
			// Clear typing status when message is sent
			if (isTypingRef.current) {
				isTypingRef.current = false;
				sendTypingStatus(false);
			}
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
				typingTimeoutRef.current = null;
			}
		}
	};

	const handleInputChange = useCallback(
		(e) => {
			const value = e.target.value;
			setInputValue(value);

			// Auto-resize textarea
			const textarea = e.target;
			textarea.style.height = 'auto';
			textarea.style.height = Math.min(textarea.scrollHeight, 128) + 'px';

			// Clear existing timeout
			if (typingTimeoutRef.current) {
				clearTimeout(typingTimeoutRef.current);
				typingTimeoutRef.current = null;
			}

			if (value) {
				// Send typing status immediately if not already typing
				if (!isTypingRef.current) {
					isTypingRef.current = true;
					sendTypingStatus(true);
					
					// Start interval to periodically re-send typing status
					if (typingIntervalRef.current) {
						clearInterval(typingIntervalRef.current);
					}
					typingIntervalRef.current = setInterval(() => {
						if (isTypingRef.current) {
							sendTypingStatus(true);
						}
					}, 2000);
				}

				// Set timeout to clear typing status after 3 seconds of no input
				typingTimeoutRef.current = setTimeout(() => {
					isTypingRef.current = false;
					sendTypingStatus(false);
					if (typingIntervalRef.current) {
						clearInterval(typingIntervalRef.current);
						typingIntervalRef.current = null;
					}
				}, 3000);
			} else {
				// Input is empty, stop typing immediately
				if (isTypingRef.current) {
					isTypingRef.current = false;
					sendTypingStatus(false);
					if (typingIntervalRef.current) {
						clearInterval(typingIntervalRef.current);
						typingIntervalRef.current = null;
					}
				}
			}
		},
		[sendTypingStatus]
	);

	const handleKeyDown = (e) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	const handleEmojiSelect = (emoji) => {
		setInputValue((prev) => prev + emoji);
		inputRef.current?.focus();
	};

	const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit for WebSocket

	const handleFileSelect = (e) => {
		const file = e.target.files[0];
		if (file) {
			if (file.size > MAX_FILE_SIZE) {
				alert(`File too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB. Your file is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
				if (fileInputRef.current) {
					fileInputRef.current.value = '';
				}
				return;
			}
			setSelectedFile(file);
			setShowFilePreview(true);
		}
	};

	const handleSendFileWithCaption = async (file, caption) => {
		if (!file || !selectedUser) return;

		try {
			const reader = new FileReader();
			reader.onload = (e) => {
				const fileData = e.target.result;
				handleSendMessage({
					type: 'file',
					fileName: file.name,
					fileType: file.type,
					fileSize: file.size,
					fileData: fileData,
					caption: caption || '',
				});
			};
			reader.onerror = () => {
				console.error('Error reading file');
				alert('Failed to read file. Please try again.');
			};
			reader.readAsDataURL(file);
		} catch (error) {
			console.error('Error sending file:', error);
			alert('Failed to send file. Please try again.');
		}

		setSelectedFile(null);
		setShowFilePreview(false);
		if (fileInputRef.current) {
			fileInputRef.current.value = '';
		}
	};

	const handleSaveFile = async (fileData) => {
		try {
			await saveFile(fileData);
			alert('File saved successfully!');
		} catch (error) {
			console.error('Error saving file:', error);
			alert('Failed to save file.');
		}
	};

	const formatTime = (timestamp) => {
		const date = new Date(timestamp);
		return date.toLocaleTimeString([], {
			hour: "2-digit",
			minute: "2-digit",
		});
	};

	// Message selection handlers
	const handleMessageLongPress = (msgId) => {
		setIsSelectionMode(true);
		setSelectedMessages(new Set([msgId]));
	};

	const handleMessageClick = (msgId) => {
		if (isSelectionMode) {
			setSelectedMessages(prev => {
				const newSet = new Set(prev);
				if (newSet.has(msgId)) {
					newSet.delete(msgId);
				} else {
					newSet.add(msgId);
				}
				return newSet;
			});
		}
	};

	const cancelSelection = () => {
		setIsSelectionMode(false);
		setSelectedMessages(new Set());
	};

	const getSelectedMessagesInfo = () => {
		const selected = userMessages.filter(msg => selectedMessages.has(msg.messageId));
		const hasOwnMessages = selected.some(msg => msg.isMe || msg.from === username);
		const hasOtherMessages = selected.some(msg => !msg.isMe && msg.from !== username);
		return { selected, hasOwnMessages, hasOtherMessages, allOwn: hasOwnMessages && !hasOtherMessages };
	};

	const handleDeleteForMe = async () => {
		// Delete locally only
		const msgIds = Array.from(selectedMessages);
		for (const msgId of msgIds) {
			try {
				await deleteMessageFromDB(msgId);
			} catch (err) {
				console.error('Failed to delete message:', err);
			}
		}
		// Update local state
		if (deleteLocalMessages) {
			deleteLocalMessages(selectedUser, msgIds);
		}
		cancelSelection();
		setShowDeleteModal(false);
	};

	const handleDeleteForEveryone = async () => {
		const msgIds = Array.from(selectedMessages);
		
		// Send delete request to server for each message
		for (const msgId of msgIds) {
			sendMessage({
				type: 'delete-message',
				to: selectedUser,
				messageId: msgId,
			});
			// Also delete locally
			try {
				await deleteMessageFromDB(msgId);
			} catch (err) {
				console.error('Failed to delete message:', err);
			}
		}
		// Update local state
		if (deleteLocalMessages) {
			deleteLocalMessages(selectedUser, msgIds);
		}
		cancelSelection();
		setShowDeleteModal(false);
	};

	return (
		<div className="flex flex-col h-full w-full bg-bg">
			{/* Header - Selection Mode */}
			{isSelectionMode ? (
				<div className="h-16 px-4 border-b border-white/[0.08] flex items-center justify-between bg-[#1e1e1e]/80 backdrop-blur-xl flex-shrink-0">
					<div className="flex items-center gap-3">
						<button
							onClick={cancelSelection}
							className="p-1 -ml-1 hover:bg-white/10 rounded-full transition-colors">
							<X className="w-6 h-6" />
						</button>
						<span className="font-semibold">{selectedMessages.size} selected</span>
					</div>
					<button
						onClick={() => setShowDeleteModal(true)}
						className="p-2.5 rounded-full hover:bg-red-500/20 text-red-400 transition-colors"
						title="Delete">
						<Trash2 className="w-5 h-5" />
					</button>
				</div>
			) : (
				/* Header - Normal Mode */
				<div className="h-16 px-4 border-b border-white/[0.08] flex items-center justify-between bg-[#1e1e1e]/80 backdrop-blur-xl flex-shrink-0">
					<div className="flex items-center gap-3 flex-1 min-w-0">
						<button
							onClick={() => {
								if (isCallActive) {
									setCurrentView("video");
								} else {
									setSelectedUser(null);
								}
							}}
							className="p-1 -ml-1 hover:bg-white/10 rounded-full transition-colors">
							<ArrowLeft className="w-6 h-6" />
						</button>

						<div
							className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
							style={{ background: getAvatarColor(selectedUser) }}>
							{getInitials(selectedUser)}
						</div>

						<div className="flex flex-col min-w-0">
							<h3 className="font-semibold truncate">{selectedUser}</h3>
							<span className={clsx(
								"text-xs",
								onlineUsers.includes(selectedUser) ? "text-success" : "text-gray-500"
							)}>
								{onlineUsers.includes(selectedUser) ? "Online" : "Offline"}
							</span>
						</div>
					</div>

					<div className="flex items-center gap-2">
						{isCallActive ? (
							<button
								onClick={() => setCurrentView("video")}
								className="px-4 py-2 bg-green-500/20 text-green-400 border border-green-500/30 rounded-full text-sm font-semibold flex items-center gap-2 animate-pulse-green hover:bg-green-500/30 transition-colors">
								<span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
								<span>In Call{callPeer && callPeer !== selectedUser ? ` with ${callPeer}` : ''}</span>
							</button>
						) : (
							<>
								<button
									onClick={() => handleStartCall("audio")}
									className="p-2.5 rounded-full hover:bg-white/10 transition-all duration-200 hover:scale-105 active:scale-95"
									title="Voice Call">
									<Phone className="w-5 h-5" />
								</button>
								<button
									onClick={() => handleStartCall("video")}
									className="p-2.5 rounded-full hover:bg-white/10 transition-all duration-200 hover:scale-105 active:scale-95"
									title="Video Call">
									<Video className="w-5 h-5" />
								</button>
							</>
						)}
					</div>
				</div>
			)}

			{/* Messages */}
			<div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 hide-scrollbar">
				{userMessages.length === 0 ? (
					<div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
						<div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#667eea]/20 to-[#764ba2]/20 flex items-center justify-center">
							<Send className="w-7 h-7 text-[#667eea]" />
						</div>
						<div className="text-center">
							<p className="font-medium text-white/70">No messages yet</p>
							<p className="text-sm mt-1">Send a message to start chatting</p>
						</div>
					</div>
				) : (
					userMessages.map((msg, idx) => (
						msg.type === 'call-log' ? (
							// Call log entry
							<div
								key={msg.messageId || idx}
								className="self-center flex items-center gap-2 px-4 py-2 bg-[#252525] rounded-full text-sm text-gray-300 animate-message-in"
							>
								{msg.callLogType === 'completed' ? (
									<>
										<Phone className="w-4 h-4 text-green-400" />
										<span>
											{msg.isMe ? 'Outgoing call' : 'Incoming call'} • {formatCallDuration(msg.duration)}
										</span>
									</>
								) : msg.callLogType === 'missed-outgoing' ? (
									<>
										<PhoneMissed className="w-4 h-4 text-red-400" />
										<span>Call not answered</span>
									</>
								) : msg.callLogType === 'declined' ? (
									<>
										<PhoneOff className="w-4 h-4 text-orange-400" />
										<span>Call declined</span>
									</>
								) : msg.callLogType === 'rejected' ? (
									<>
										<PhoneMissed className="w-4 h-4 text-red-400" />
										<span>Missed call</span>
									</>
								) : msg.callLogType === 'missed' ? (
									<>
										<PhoneMissed className="w-4 h-4 text-red-400" />
										<span>Missed call</span>
									</>
								) : (
									<>
										<Phone className="w-4 h-4 text-gray-400" />
										<span>Call</span>
									</>
								)}
								<span className="text-xs text-gray-500 ml-1">
									{formatTime(msg.timestamp)}
								</span>
							</div>
						) : (
						<div
							key={msg.messageId || idx}
							className={clsx(
								"max-w-[80%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed relative break-words cursor-pointer transition-all duration-200 animate-message-in",
								msg.isMe || msg.from === username
									? "self-end bg-primary text-white rounded-br-sm hover:brightness-110"
									: "self-start bg-surface-light text-white rounded-bl-sm hover:bg-[#3a3a3a]",
								isSelectionMode && selectedMessages.has(msg.messageId) && "ring-2 ring-cyan-400/70 scale-[0.98]"
							)}
							style={{
								wordBreak: "break-word",
								overflowWrap: "anywhere",
							}}
							onClick={() => handleMessageClick(msg.messageId)}
							onMouseDown={() => {
								longPressTimerRef.current = setTimeout(() => {
									handleMessageLongPress(msg.messageId);
								}, 500);
							}}
							onMouseUp={() => {
								if (longPressTimerRef.current) {
									clearTimeout(longPressTimerRef.current);
								}
							}}
							onMouseLeave={() => {
								if (longPressTimerRef.current) {
									clearTimeout(longPressTimerRef.current);
								}
							}}
							onTouchStart={() => {
								longPressTimerRef.current = setTimeout(() => {
									handleMessageLongPress(msg.messageId);
								}, 500);
							}}
							onTouchEnd={() => {
								if (longPressTimerRef.current) {
									clearTimeout(longPressTimerRef.current);
								}
							}}>
							{msg.type === 'file' || msg.type === 'file-message' ? (
								<div className="flex flex-col gap-2">
									{msg.fileType?.startsWith('image/') ? (
										<img
											src={msg.fileData}
											alt={msg.fileName}
											className="max-w-full max-h-64 rounded-lg cursor-pointer hover:opacity-90 transition-opacity object-cover"
											onClick={() => setViewingMedia(msg)}
										/>
									) : msg.fileType?.startsWith('video/') ? (
										<div 
											className="relative cursor-pointer group"
											onClick={() => setViewingMedia(msg)}
										>
											<video
												src={msg.fileData}
												className="max-w-full max-h-64 rounded-lg object-cover"
											/>
											<div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg group-hover:bg-black/50 transition-colors">
												<div className="w-14 h-14 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center group-hover:scale-110 transition-transform">
													<Play className="w-7 h-7 ml-1" fill="white" />
												</div>
											</div>
										</div>
									) : (
										<div className="flex items-center gap-3 p-3 bg-black/20 rounded-xl">
											<div className="p-2 rounded-lg bg-white/10">
												<Paperclip className="w-5 h-5" />
											</div>
											<div className="flex-1 min-w-0">
												<p className="font-medium text-sm truncate">{msg.fileName}</p>
												<p className="text-xs text-white/50">{(msg.fileSize / 1024).toFixed(1)} KB</p>
											</div>
											<button
												onClick={(e) => {
													e.stopPropagation();
													const link = document.createElement('a');
													link.href = msg.fileData;
													link.download = msg.fileName;
													link.click();
												}}
												className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
												title="Download"
											>
												<Download className="w-4 h-4" />
											</button>
										</div>
									)}
									{msg.caption && (
										<p className="text-sm">{msg.caption}</p>
									)}
									<div className="flex items-center justify-between">
										<span className="text-xs text-white/60">
											{msg.fileName} • {(msg.fileSize / 1024).toFixed(1)} KB
										</span>
										<button
											onClick={() => handleSaveFile(msg)}
											className="p-1 rounded hover:bg-white/10 transition-colors"
											title="Save file"
										>
											<Bookmark className="w-3.5 h-3.5" />
										</button>
									</div>
								</div>
							) : (
								msg.text
							)}
							<div className="flex items-center justify-end gap-1 mt-1">
								<span className="text-[10px] text-white/60">
									{formatTime(msg.timestamp)}
								</span>
								{/* Message status icons - only show for sent messages */}
								{(msg.isMe || msg.from === username) && (
									<span className="flex items-center ml-1" title={msg.status === 'queued' ? 'Queued - will deliver when user comes online' : msg.status}>
										{msg.status === 'read' ? (
											<CheckAllIcon className="text-cyan-300" />
										) : msg.status === 'delivered' ? (
											<CheckAllIcon className="text-white/70" />
										) : msg.status === 'queued' ? (
											<Clock className="w-3.5 h-3.5 text-yellow-400" />
										) : (
											<CheckIcon className="text-white/70" />
										)}
									</span>
								)}
							</div>
						</div>
						)
					))
				)}

				{/* Typing Indicator */}
				{isPeerTyping && (
					<div className="self-start flex items-center gap-2 px-4 py-2.5 bg-surface-light rounded-2xl rounded-bl-sm max-w-[80%]">
						<div className="flex gap-1">
							<span
								className="w-2 h-2 bg-gray-400 rounded-full animate-typing-dot"
								style={{ animationDelay: "0ms" }}
							/>
							<span
								className="w-2 h-2 bg-gray-400 rounded-full animate-typing-dot"
								style={{ animationDelay: "150ms" }}
							/>
							<span
								className="w-2 h-2 bg-gray-400 rounded-full animate-typing-dot"
								style={{ animationDelay: "300ms" }}
							/>
						</div>
						<span className="text-xs text-gray-400">
							{selectedUser} is typing...
						</span>
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Input Area */}
			<div className="p-3 border-t border-[#333] bg-surface flex items-end gap-2 relative">
				{/* Attachment menu toggle */}
				<div className="relative flex-shrink-0" ref={attachMenuRef}>
					<button
						onClick={() => setShowAttachMenu((v) => !v)}
						className={clsx(
							"p-2.5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] hover:opacity-80 transition-all duration-200",
							showAttachMenu && "rotate-45"
						)}
						title="Attachments">
						<Plus className="w-5 h-5" />
					</button>

					{/* Attachment menu popup */}
					{showAttachMenu && (
						<div className="absolute bottom-14 left-0 flex flex-col gap-1.5 bg-[#252525] p-2.5 rounded-2xl shadow-2xl border border-white/10 z-50 animate-fade-in min-w-[140px]">
							<button
								onClick={() => {
									setShowEmoji((v) => !v);
									setShowAttachMenu(false);
								}}
								className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
								<div className="p-2 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500">
									<Smile className="w-4 h-4" />
								</div>
								<span className="text-sm font-medium">Emoji</span>
							</button>
							<button
								onClick={() => {
									fileInputRef.current?.click();
									setShowAttachMenu(false);
								}}
								className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
								<div className="p-2 rounded-full bg-gradient-to-br from-blue-400 to-blue-600">
									<Paperclip className="w-4 h-4" />
								</div>
								<span className="text-sm font-medium">File</span>
							</button>
							<button
								onClick={() => {
									setShowSavedFiles(true);
									setShowAttachMenu(false);
								}}
								className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 transition-colors text-left">
								<div className="p-2 rounded-full bg-gradient-to-br from-green-400 to-emerald-600">
									<FolderOpen className="w-4 h-4" />
								</div>
								<span className="text-sm font-medium">Saved</span>
							</button>
						</div>
					)}
				</div>

				<input
					ref={fileInputRef}
					type="file"
					onChange={handleFileSelect}
					className="hidden"
					accept="*/*"
				/>

				{showEmoji && (
					<div className="z-50">
						<EmojiPicker
							onSelect={handleEmojiSelect}
							onClose={() => setShowEmoji(false)}
						/>
					</div>
				)}

				<textarea
					ref={inputRef}
					value={inputValue}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					placeholder="Type a message..."
					autoComplete="off"
					spellCheck={false}
					rows={1}
					className="flex-1 min-w-0 py-3 px-4 bg-surface-light rounded-3xl text-white outline-none text-base resize-none overflow-y-auto max-h-32"
					style={{ lineHeight: '1.5' }}
				/>

				<button
					onClick={handleSubmit}
					disabled={!inputValue.trim()}
					className="p-2.5 rounded-full bg-primary hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0">
					<Send className="w-5 h-5" />
				</button>
			</div>

			{/* File Preview Modal */}
			{showFilePreview && selectedFile && (
				<FilePreviewModal
					file={selectedFile}
					onSend={handleSendFileWithCaption}
					onClose={() => {
						setShowFilePreview(false);
						setSelectedFile(null);
						if (fileInputRef.current) {
							fileInputRef.current.value = '';
						}
					}}
				/>
			)}

			{/* Media Viewer Modal */}
			{viewingMedia && (
				<MediaViewerModal
					media={viewingMedia}
					onClose={() => setViewingMedia(null)}
					onSave={handleSaveFile}
					mediaList={mediaFiles}
					currentIndex={viewingMediaIndex >= 0 ? viewingMediaIndex : 0}
					onNavigate={(index) => setViewingMedia(mediaFiles[index])}
				/>
			)}

			{/* Saved Files Modal */}
			{showSavedFiles && (
				<SavedFilesModal
					onClose={() => setShowSavedFiles(false)}
					onViewMedia={(file) => {
						setShowSavedFiles(false);
						setViewingMedia(file);
					}}
				/>
			)}

			{/* Delete Confirmation Modal */}
			{showDeleteModal && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
					<div className="bg-[#1e1e1e] rounded-2xl max-w-sm w-full mx-4 overflow-hidden shadow-2xl border border-white/10">
						<div className="p-4 border-b border-white/10">
							<h3 className="font-semibold text-lg">Delete {selectedMessages.size} message{selectedMessages.size > 1 ? 's' : ''}?</h3>
						</div>
						<div className="p-4 flex flex-col gap-2">
							{(() => {
								const { allOwn } = getSelectedMessagesInfo();
								return (
									<>
										<button
											onClick={handleDeleteForMe}
											className="w-full py-3 px-4 bg-surface-light hover:bg-white/10 rounded-xl text-left transition-colors"
										>
											Delete for me
										</button>
										{allOwn && (
											<button
												onClick={handleDeleteForEveryone}
												className="w-full py-3 px-4 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-xl text-left transition-colors"
											>
												Delete for everyone
											</button>
										)}
									</>
								);
							})()}
							<button
								onClick={() => setShowDeleteModal(false)}
								className="w-full py-3 px-4 hover:bg-white/5 rounded-xl text-gray-400 transition-colors"
							>
								Cancel
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

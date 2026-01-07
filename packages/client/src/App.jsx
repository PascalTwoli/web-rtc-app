import { useState, useEffect, useRef, useCallback } from 'react'
import LoginScreen from './components/LoginScreen'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import ToastContainer from './components/ToastContainer'
import CallEndedModal from './components/CallEndedModal'
import { useWebSocket } from './hooks/useWebSocket'
import { useWebRTC } from './hooks/useWebRTC'
import { useAudio } from './hooks/useAudio'
import { AppContext } from './context/AppContext'
import { saveMessage, getAllMessages, saveFile, deleteMessage as deleteMessageFromDB, updateMessageStatus } from './services/storageService'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [allUsers, setAllUsers] = useState([]) // All registered users with online status
  const [messages, setMessages] = useState({})
  const [toasts, setToasts] = useState([])
  const [currentView, setCurrentView] = useState('placeholder')
  const [isCallActive, setIsCallActive] = useState(false)
  const [callType, setCallType] = useState('video')
  const [incomingCall, setIncomingCall] = useState(null)
  const [isCalling, setIsCalling] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [typingUsers, setTypingUsers] = useState({}) // { username: timestamp }
  const [userFilter, setUserFilter] = useState('all') // 'all' or 'online'
  const [callEndedInfo, setCallEndedInfo] = useState(null) // { duration, caller } for call ended modal
  const [remoteVideoOff, setRemoteVideoOff] = useState(false) // Track when remote user turns off video
  const [callPeer, setCallPeer] = useState(null) // Track who we're actually in a call with (separate from selectedUser)
  const [callStartTime, setCallStartTime] = useState(null) // When the call started (for persistent timer)

  // Audio hooks for call tones and notifications
  const { playDialTone, stopDialTone, playRingtone, stopRingtone, playNotification, playCallRejectedtone, stopAll } = useAudio()

  // Play dial tone when calling
  useEffect(() => {
    if (isCalling) {
      playDialTone()
    } else {
      stopDialTone()
    }
  }, [isCalling, playDialTone, stopDialTone])

  // Play ringtone when receiving incoming call
  useEffect(() => {
    if (incomingCall) {
      playRingtone()
    } else {
      stopRingtone()
    }
  }, [incomingCall, playRingtone, stopRingtone])

  // Stop all tones when call becomes active
  useEffect(() => {
    if (isCallActive) {
      stopAll()
    }
  }, [isCallActive, stopAll])

  // Request notification permission on login
  useEffect(() => {
    if (isLoggedIn && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
  }, [isLoggedIn])

  // Show browser notification for incoming message
  const showNotification = useCallback((title, body, from) => {
    // Browser notification (when tab not focused)
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        const notification = new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: `msg-${from}-${Date.now()}`,
          requireInteraction: false,
        })
        notification.onclick = () => {
          window.focus()
          setSelectedUser(from)
          setCurrentView('chat')
          notification.close()
        }
        // Auto-close after 5 seconds
        setTimeout(() => notification.close(), 5000)
      } catch (err) {
        console.error('Failed to show notification:', err)
      }
    }
  }, [])

  // Check for persisted username and load messages
  useEffect(() => {
    const savedUser = localStorage.getItem('peers_username')
    if (savedUser) {
      setUsername(savedUser)
      setIsLoggedIn(true)
      // Load persisted messages
      getAllMessages(savedUser).then(savedMessages => {
        if (savedMessages && Object.keys(savedMessages).length > 0) {
          setMessages(savedMessages)
        }
      }).catch(err => console.error('Failed to load messages:', err))
    }
  }, [])

  const showToast = useCallback((message, type = 'info') => {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3000)
  }, [])

  const handleLogin = useCallback((name) => {
    setUsername(name)
    localStorage.setItem('peers_username', name)
    setIsLoggedIn(true)
  }, [])

  const handleLogout = useCallback(() => {
    localStorage.removeItem('peers_username')
    setIsLoggedIn(false)
    setUsername('')
    setSelectedUser(null)
    setOnlineUsers([])
    setMessages({})
    window.location.reload()
  }, [])

  // Refs to hold WebRTC handlers (set after useWebRTC is initialized)
  const handleAnswerRef = useRef(null)
  const handleIceCandidateRef = useRef(null)
  const sendMessageRef = useRef(null)
  const selectedUserRef = useRef(null)
  const currentViewRef = useRef('placeholder')
  const callTimeoutRef = useRef(null)
  const callStartTimeRef = useRef(null)
  
  // Keep refs in sync with state
  useEffect(() => {
    selectedUserRef.current = selectedUser
  }, [selectedUser])
  
  useEffect(() => {
    currentViewRef.current = currentView
  }, [currentView])

  // WebSocket connection
  const { sendMessage } = useWebSocket({
    username,
    isLoggedIn,
    onOnlineUsers: setOnlineUsers,
    onAllUsers: setAllUsers,
    onMessage: (msg) => {
      if (msg.from) {
        setMessages(prev => ({
          ...prev,
          [msg.from]: [...(prev[msg.from] || []), msg]
        }))
        // Persist received message
        saveMessage(username, msg.from, msg).catch(err => 
          console.error('Failed to save message:', err)
        )
        // Auto-save file messages to saved files
        if (msg.type === 'file' && msg.fileData) {
          saveFile({
            fileName: msg.fileName,
            fileType: msg.fileType,
            fileSize: msg.fileSize,
            fileData: msg.fileData,
            from: msg.from,
            timestamp: msg.timestamp,
          }).catch(err => console.error('Failed to auto-save file:', err))
        }
        // Show notifications
        const notificationBody = msg.type === 'file' ? `Sent a file: ${msg.fileName}` : msg.text
        const isChatOpenWithSender = selectedUserRef.current === msg.from && currentViewRef.current === 'chat'
        
        // Show in-app toast notification if chat is not open with this sender
        if (!isChatOpenWithSender) {
          showToast(`${msg.from}: ${notificationBody.substring(0, 50)}${notificationBody.length > 50 ? '...' : ''}`, 'message')
          // Play notification sound
          playNotification()
        }
        
        // Show browser notification
        showNotification(`New message from ${msg.from}`, notificationBody, msg.from)
        // Send delivery confirmation back to sender
        if (msg.messageId && sendMessageRef.current) {
          // Always send delivered confirmation
          sendMessageRef.current({
            type: 'delivered',
            to: msg.from,
            messageId: msg.messageId,
          })
          
          // If chat with this sender is currently open, also send read confirmation
          const isChatOpen = selectedUserRef.current === msg.from && currentViewRef.current === 'chat'
          if (isChatOpen) {
            // Small delay to ensure delivered is processed first
            setTimeout(() => {
              sendMessageRef.current?.({
                type: 'read',
                to: msg.from,
                messageId: msg.messageId,
              })
            }, 100)
          }
        }
      }
    },
    onOffer: (data) => {
      console.log('Received offer from', data.from, 'type:', data.callType, 'isUpgrade:', data.isUpgrade)
      
      // If this is a video upgrade during an existing call, handle it silently
      if (data.isUpgrade && isCallActive) {
        // Handle renegotiation for video upgrade without showing incoming call modal
        handleAnswerRef.current?.(data)
        setCallType('video')
        return
      }
      
      // Normal incoming call
      setIncomingCall(data)
    },
    onAnswer: (data) => {
      // Call was answered - clear timeout and record start time
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current)
        callTimeoutRef.current = null
      }
      callStartTimeRef.current = Date.now()
      handleAnswerRef.current?.(data)
    },
    onIce: (data) => handleIceCandidateRef.current?.(data),
    onHangup: (data) => {
      // Clear timeout
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current)
        callTimeoutRef.current = null
      }
      
      // Clear incoming call modal if still showing (caller hung up before we answered)
      setIncomingCall(null)
      
      // Calculate duration if call was active
      let duration = null
      if (callStartTimeRef.current) {
        duration = Math.floor((Date.now() - callStartTimeRef.current) / 1000)
      }
      
      // Log call based on state
      if (data?.from) {
        if (duration !== null && duration > 0) {
          // Completed call with duration
          const callLog = {
            type: 'call-log',
            callLogType: 'completed',
            duration,
            messageId: `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            isMe: false,
          }
          setMessages(prev => ({
            ...prev,
            [data.from]: [...(prev[data.from] || []), callLog]
          }))
          saveMessage(username, data.from, { ...callLog, from: data.from }).catch(err => 
            console.error('Failed to save call log:', err)
          )
          // Show call ended modal for completed calls
          setCallEndedInfo({ duration, caller: data.from })
        } else if (!callStartTimeRef.current) {
          // Call was hung up before being answered - missed call for receiver
          const callLog = {
            type: 'call-log',
            callLogType: 'missed',
            messageId: `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            isMe: false,
          }
          setMessages(prev => ({
            ...prev,
            [data.from]: [...(prev[data.from] || []), callLog]
          }))
          saveMessage(username, data.from, { ...callLog, from: data.from }).catch(err => 
            console.error('Failed to save call log:', err)
          )
        }
      }
      
      callStartTimeRef.current = null
      setIsCallActive(false)
      setIsCalling(false)
      setCallPeer(null)
      if (currentViewRef.current === 'video') {
        setCurrentView('chat')
      }
    },
    onTyping: (data) => {
      if (data.isTyping) {
        // Store timestamp when typing started/refreshed
        setTypingUsers(prev => ({ ...prev, [data.from]: Date.now() }))
      } else {
        setTypingUsers(prev => {
          const updated = { ...prev }
          delete updated[data.from]
          return updated
        })
      }
    },
    onDeleteMessage: (data) => {
      // Delete message from local state when receiver gets delete-for-everyone
      if (data.from && data.messageId) {
        setMessages(prev => ({
          ...prev,
          [data.from]: (prev[data.from] || []).filter(msg => msg.messageId !== data.messageId)
        }))
        // Also delete from IndexedDB
        deleteMessageFromDB(data.messageId).catch(err => 
          console.error('Failed to delete message from DB:', err)
        )
      }
    },
    onDelivered: (data) => {
      // Update message status to delivered when receiver confirms
      // Status hierarchy: sent < queued < delivered < read (only upgrade, never downgrade)
      if (data.from && data.messageId) {
        setMessages(prev => ({
          ...prev,
          [data.from]: (prev[data.from] || []).map(msg => {
            if (msg.messageId === data.messageId) {
              // Only upgrade to delivered if current status is lower
              if (msg.status === 'sent' || msg.status === 'queued' || !msg.status) {
                return { ...msg, status: 'delivered' }
              }
            }
            return msg
          })
        }))
        // Persist to IndexedDB (storage also enforces hierarchy)
        updateMessageStatus(data.messageId, 'delivered').catch(err => 
          console.error('Failed to persist delivered status:', err)
        )
      }
    },
    onRead: (data) => {
      // Update message status to read when receiver confirms
      // Read is the highest status - always applies
      if (data.from && data.messageId) {
        setMessages(prev => ({
          ...prev,
          [data.from]: (prev[data.from] || []).map(msg => 
            msg.messageId === data.messageId ? { ...msg, status: 'read' } : msg
          )
        }))
        // Persist to IndexedDB
        updateMessageStatus(data.messageId, 'read').catch(err => 
          console.error('Failed to persist read status:', err)
        )
      }
    },
    onMessageQueued: (data) => {
      // Message was queued for offline user - update status
      // Only upgrade from 'sent' to 'queued'
      if (data.to && data.messageId) {
        setMessages(prev => ({
          ...prev,
          [data.to]: (prev[data.to] || []).map(msg => {
            if (msg.messageId === data.messageId) {
              // Only set to queued if currently sent or no status
              if (msg.status === 'sent' || !msg.status) {
                return { ...msg, status: 'queued' }
              }
            }
            return msg
          })
        }))
        // Persist to IndexedDB
        updateMessageStatus(data.messageId, 'queued').catch(err => 
          console.error('Failed to persist queued status:', err)
        )
      }
    },
    onReject: (data) => {
      // Call was rejected by the other party - play rejected tone on caller's end
      playCallRejectedtone()
      
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current)
        callTimeoutRef.current = null
      }
      // Log missed call (rejected by receiver)
      if (data?.from) {
        const callLog = {
          type: 'call-log',
          callLogType: 'declined',
          messageId: `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          isMe: true,
        }
        setMessages(prev => ({
          ...prev,
          [data.from]: [...(prev[data.from] || []), callLog]
        }))
        saveMessage(username, data.from, { ...callLog, from: username }).catch(err => 
          console.error('Failed to save call log:', err)
        )
      }
      callStartTimeRef.current = null
      setIsCallActive(false)
      setIsCalling(false)
    },
    onVideoToggle: (data) => {
      // Remote user toggled their video
      if (data?.from) {
        setRemoteVideoOff(!data.enabled)
      }
    },
    showToast,
  })

  // WebRTC
  const {
    localStream,
    remoteStream,
    startCall,
    answerCall,
    endCall,
    toggleMute,
    toggleVideo,
    isMuted,
    isVideoOff,
    handleAnswer,
    handleIceCandidate,
  } = useWebRTC({
    sendMessage,
    username,
    selectedUser,
    callPeer,
    onCallConnected: () => {
      // Only set if not already active (prevent timer reset on ICE reconnection)
      if (!isCallActive) {
        setIsCallActive(true)
        setIsCalling(false)
        setCallStartTime(Date.now())
        setCurrentView('video')
      }
    },
    onCallEnded: () => {
      setIsCallActive(false)
      setIsCalling(false)
      setCallStartTime(null)
      if (selectedUser) {
        setCurrentView('chat')
      } else {
        setCurrentView('placeholder')
      }
    },
  })

  // Update refs after useWebRTC is initialized
  useEffect(() => {
    handleAnswerRef.current = handleAnswer
    handleIceCandidateRef.current = handleIceCandidate
  }, [handleAnswer, handleIceCandidate])

  // Update sendMessageRef
  useEffect(() => {
    sendMessageRef.current = sendMessage
  }, [sendMessage])

  // Cleanup stale typing indicators (if no refresh received within 4 seconds)
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setTypingUsers(prev => {
        const updated = { ...prev }
        let hasChanges = false
        for (const user in updated) {
          if (now - updated[user] > 4000) {
            delete updated[user]
            hasChanges = true
          }
        }
        return hasChanges ? updated : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Auto-dismiss call ended modal after 3 seconds
  useEffect(() => {
    if (callEndedInfo) {
      const timer = setTimeout(() => {
        setCallEndedInfo(null)
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [callEndedInfo])

  // Update message status helper
  const updateMessageStatus = useCallback((user, messageId, status) => {
    setMessages(prev => ({
      ...prev,
      [user]: (prev[user] || []).map(msg => 
        msg.messageId === messageId ? { ...msg, status } : msg
      )
    }))
  }, [])

  const handleSelectUser = useCallback((user) => {
    setSelectedUser(user)
    if (user) {
      setCurrentView('chat')
      // Send read confirmations for unread messages from this user
      const userMessages = messages[user] || []
      userMessages.forEach(msg => {
        if (!msg.isMe && msg.from !== username && msg.messageId) {
          sendMessageRef.current?.({
            type: 'read',
            to: msg.from,
            messageId: msg.messageId,
          })
        }
      })
    } else {
      setCurrentView('placeholder')
    }
    if (window.innerWidth <= 768) {
      setSidebarOpen(false)
    }
  }, [messages, username])

  // Helper to add call log to chat
  const addCallLog = useCallback((user, callLogType, duration = null) => {
    const callLog = {
      type: 'call-log',
      callLogType, // 'outgoing', 'incoming', 'missed', 'rejected'
      duration,
      messageId: `call-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      isMe: callLogType === 'outgoing' || callLogType === 'missed-outgoing',
    }
    setMessages(prev => ({
      ...prev,
      [user]: [...(prev[user] || []), callLog]
    }))
    // Persist call log
    saveMessage(username, user, { ...callLog, from: username }).catch(err => 
      console.error('Failed to save call log:', err)
    )
  }, [username])

  // Detect when call peer goes offline during a call
  useEffect(() => {
    if ((isCallActive || isCalling) && callPeer) {
      const isPeerOnline = onlineUsers.includes(callPeer)
      if (!isPeerOnline) {
        // Call peer went offline - end the call
        showToast(`${callPeer} disconnected`, 'info')
        
        // Calculate duration if call was active
        let duration = null
        if (isCallActive && callStartTimeRef.current) {
          duration = Math.floor((Date.now() - callStartTimeRef.current) / 1000)
        }
        
        // End the call
        endCall()
        
        // Clear timeout
        if (callTimeoutRef.current) {
          clearTimeout(callTimeoutRef.current)
          callTimeoutRef.current = null
        }
        
        // Show call ended modal if there was a duration
        if (duration !== null && duration > 0) {
          addCallLog(callPeer, 'completed', duration)
          setCallEndedInfo({ duration, caller: callPeer })
        }
        
        setIsCallActive(false)
        setIsCalling(false)
        setCallPeer(null)
        callStartTimeRef.current = null
        setCurrentView('chat')
      }
    }
  }, [onlineUsers, isCallActive, isCalling, callPeer, endCall, showToast, addCallLog])

  const handleStartCall = useCallback(async (type) => {
    setCallType(type)
    setIsCalling(true)
    setCallPeer(selectedUser) // Track who we're calling
    callStartTimeRef.current = Date.now()
    
    // Set 30-second timeout for unanswered calls
    callTimeoutRef.current = setTimeout(() => {
      if (callTimeoutRef.current) {
        // Call was not answered - auto hangup
        showToast('Call not answered', 'info')
        endCall()
        if (selectedUserRef.current) {
          sendMessageRef.current?.({
            type: 'hangup',
            to: selectedUserRef.current,
          })
          // Log missed call (outgoing)
          addCallLog(selectedUserRef.current, 'missed-outgoing')
        }
        setIsCalling(false)
        setIsCallActive(false)
        setCallPeer(null)
      }
    }, 30000)
    
    try {
      await startCall(selectedUser, type)
    } catch (error) {
      // Clear timeout on error
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current)
        callTimeoutRef.current = null
      }
      setIsCalling(false)
      setCallPeer(null)
      showToast(error.message || 'Failed to start call', 'danger')
    }
  }, [selectedUser, startCall, showToast, endCall, addCallLog])

  const handleAnswerCall = useCallback(async () => {
    if (incomingCall) {
      const callData = incomingCall
      // Set callPeer to track who we're in a call with
      setCallPeer(callData.from)
      // Set selectedUser to the caller so ICE candidates are sent correctly
      setSelectedUser(callData.from)
      setCallType(callData.callType || 'video')
      setIncomingCall(null)
      // Clear any existing timeout (from caller's side)
      if (callTimeoutRef.current) {
        clearTimeout(callTimeoutRef.current)
        callTimeoutRef.current = null
      }
      // Record call start time for duration tracking
      callStartTimeRef.current = Date.now()
      // Transition to video view immediately when answering
      setCurrentView('video')
      setIsCallActive(true)
      try {
        await answerCall(callData)
      } catch (error) {
        // Revert state on error
        setIsCallActive(false)
        setCallPeer(null)
        setCurrentView('chat')
        showToast(error.message || 'Failed to answer call', 'danger')
      }
    }
  }, [incomingCall, answerCall, showToast])

  const handleRejectCall = useCallback(() => {
    if (incomingCall) {
      sendMessage({
        type: 'reject',
        to: incomingCall.from,
      })
      // Log rejected call
      addCallLog(incomingCall.from, 'rejected')
    }
    setIncomingCall(null)
  }, [incomingCall, sendMessage, addCallLog])

  const handleHangup = useCallback(() => {
    // Clear timeout if call ends before timeout
    if (callTimeoutRef.current) {
      clearTimeout(callTimeoutRef.current)
      callTimeoutRef.current = null
    }
    
    // Calculate call duration if call was active
    let duration = null
    if (isCallActive && callStartTimeRef.current) {
      duration = Math.floor((Date.now() - callStartTimeRef.current) / 1000)
    }
    
    // Use callPeer (the actual call participant) instead of selectedUser
    const peer = callPeer || selectedUser
    
    endCall()
    if (peer) {
      sendMessage({
        type: 'hangup',
        to: peer,
      })
      // Log completed call with duration (only if call was connected)
      if (duration !== null && duration > 0) {
        addCallLog(peer, 'completed', duration)
        // Show call ended modal
        setCallEndedInfo({ duration, caller: peer })
      }
    }
    setIsCallActive(false)
    setIsCalling(false)
    setCallPeer(null)
    callStartTimeRef.current = null
    setCurrentView('chat')
  }, [endCall, callPeer, selectedUser, sendMessage, isCallActive, addCallLog])

  const handleSendMessage = useCallback((data) => {
    if (!selectedUser) return
    
    // Handle both text messages and file messages
    let msg
    if (typeof data === 'string') {
      // Text message
      msg = {
        type: 'chat',
        to: selectedUser,
        text: data,
        messageId: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      }
    } else if (data.type === 'file') {
      // File message
      msg = {
        type: 'file-message',
        to: selectedUser,
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        fileData: data.fileData,
        caption: data.caption || '',
        messageId: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
      }
    } else {
      return // Invalid message type
    }
    
    sendMessage(msg)
    
    const localMsg = {
      ...msg,
      from: username,
      isMe: true,
      status: 'sent',
    }
    
    // Add to local messages
    setMessages(prev => ({
      ...prev,
      [selectedUser]: [...(prev[selectedUser] || []), localMsg]
    }))
    
    // Persist sent message
    saveMessage(username, selectedUser, localMsg).catch(err => 
      console.error('Failed to save message:', err)
    )
    
    // Auto-save sent file messages to saved files
    if (data.type === 'file' && data.fileData) {
      saveFile({
        fileName: data.fileName,
        fileType: data.fileType,
        fileSize: data.fileSize,
        fileData: data.fileData,
        from: username,
        timestamp: msg.timestamp,
      }).catch(err => console.error('Failed to auto-save file:', err))
    }
  }, [selectedUser, username, sendMessage])

  const sendTypingStatus = useCallback((isTyping) => {
    if (selectedUser) {
      sendMessage({
        type: 'typing',
        to: selectedUser,
        isTyping,
      })
    }
  }, [selectedUser, sendMessage])

  // Auto-clear typing status after 3 seconds of inactivity
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setTypingUsers(prev => {
        const updated = { ...prev }
        let changed = false
        for (const user in updated) {
          if (now - updated[user] > 3000) {
            delete updated[user]
            changed = true
          }
        }
        return changed ? updated : prev
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Delete local messages
  const deleteLocalMessages = useCallback((user, messageIds) => {
    setMessages(prev => ({
      ...prev,
      [user]: (prev[user] || []).filter(msg => !messageIds.includes(msg.messageId))
    }))
  }, [])

  const contextValue = {
    username,
    selectedUser,
    callPeer,
    onlineUsers,
    allUsers,
    userFilter,
    setUserFilter,
    messages,
    typingUsers,
    currentView,
    isCallActive,
    callType,
    setCallType,
    callStartTime,
    isCalling,
    incomingCall,
    sidebarOpen,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    remoteVideoOff,
    sendMessage,
    setSelectedUser: handleSelectUser,
    setCurrentView,
    setSidebarOpen,
    handleStartCall,
    handleAnswerCall,
    handleRejectCall,
    handleHangup,
    handleSendMessage,
    sendTypingStatus,
    handleLogout,
    showToast,
    toggleMute,
    toggleVideo: () => toggleVideo(() => setCallType('video')),
    deleteLocalMessages,
  }

  if (!isLoggedIn) {
    return <LoginScreen onLogin={handleLogin} showToast={showToast} />
  }

  return (
    <AppContext.Provider value={contextValue}>
      <div className="flex h-full w-full overflow-hidden">
        <Sidebar />
        <MainContent />
        <ToastContainer toasts={toasts} />
        <CallEndedModal callEndedInfo={callEndedInfo} />
      </div>
    </AppContext.Provider>
  )
}

export default App

import { useState, useEffect, useRef, useCallback } from 'react'
import LoginScreen from './components/LoginScreen'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import ToastContainer from './components/ToastContainer'
import { useWebSocket } from './hooks/useWebSocket'
import { useWebRTC } from './hooks/useWebRTC'
import { AppContext } from './context/AppContext'
import { saveMessage, getAllMessages, saveFile, deleteMessage as deleteMessageFromDB } from './services/storageService'

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [selectedUser, setSelectedUser] = useState(null)
  const [onlineUsers, setOnlineUsers] = useState([])
  const [messages, setMessages] = useState({})
  const [toasts, setToasts] = useState([])
  const [currentView, setCurrentView] = useState('placeholder')
  const [isCallActive, setIsCallActive] = useState(false)
  const [callType, setCallType] = useState('video')
  const [incomingCall, setIncomingCall] = useState(null)
  const [isCalling, setIsCalling] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [typingUsers, setTypingUsers] = useState({}) // { username: timestamp }

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
      console.log('Received incoming call from', data.from, 'type:', data.callType)
      setIncomingCall(data)
    },
    onAnswer: (data) => handleAnswerRef.current?.(data),
    onIce: (data) => handleIceCandidateRef.current?.(data),
    onHangup: () => {
      setIsCallActive(false)
      setIsCalling(false)
      setCurrentView('chat')
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
      if (data.from && data.messageId) {
        setMessages(prev => ({
          ...prev,
          [data.from]: (prev[data.from] || []).map(msg => 
            msg.messageId === data.messageId ? { ...msg, status: 'delivered' } : msg
          )
        }))
      }
    },
    onRead: (data) => {
      // Update message status to read when receiver confirms
      if (data.from && data.messageId) {
        setMessages(prev => ({
          ...prev,
          [data.from]: (prev[data.from] || []).map(msg => 
            msg.messageId === data.messageId ? { ...msg, status: 'read' } : msg
          )
        }))
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
    onCallConnected: () => {
      setIsCallActive(true)
      setIsCalling(false)
      setCurrentView('video')
    },
    onCallEnded: () => {
      setIsCallActive(false)
      setIsCalling(false)
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

  const handleStartCall = useCallback(async (type) => {
    setCallType(type)
    setIsCalling(true)
    try {
      await startCall(selectedUser, type)
    } catch (error) {
      setIsCalling(false)
      showToast(error.message || 'Failed to start call', 'danger')
    }
  }, [selectedUser, startCall, showToast])

  const handleAnswerCall = useCallback(async () => {
    if (incomingCall) {
      const callData = incomingCall
      // Set selectedUser to the caller so ICE candidates are sent correctly
      setSelectedUser(callData.from)
      setCallType(callData.callType || 'video')
      setIncomingCall(null)
      // Transition to video view immediately when answering
      setCurrentView('video')
      setIsCallActive(true)
      try {
        await answerCall(callData)
      } catch (error) {
        // Revert state on error
        setIsCallActive(false)
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
    }
    setIncomingCall(null)
  }, [incomingCall, sendMessage])

  const handleHangup = useCallback(() => {
    endCall()
    if (selectedUser) {
      sendMessage({
        type: 'hangup',
        to: selectedUser,
      })
    }
    setIsCallActive(false)
    setIsCalling(false)
    setCurrentView('chat')
  }, [endCall, selectedUser, sendMessage])

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
    onlineUsers,
    messages,
    typingUsers,
    currentView,
    isCallActive,
    callType,
    isCalling,
    incomingCall,
    sidebarOpen,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
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
    toggleVideo,
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
      </div>
    </AppContext.Provider>
  )
}

export default App

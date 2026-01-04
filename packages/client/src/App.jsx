import { useState, useEffect, useRef, useCallback } from 'react'
import LoginScreen from './components/LoginScreen'
import Sidebar from './components/Sidebar'
import MainContent from './components/MainContent'
import ToastContainer from './components/ToastContainer'
import { useWebSocket } from './hooks/useWebSocket'
import { useWebRTC } from './hooks/useWebRTC'
import { AppContext } from './context/AppContext'

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

  // Check for persisted username
  useEffect(() => {
    const savedUser = localStorage.getItem('peers_username')
    if (savedUser) {
      setUsername(savedUser)
      setIsLoggedIn(true)
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
        setTypingUsers(prev => ({ ...prev, [data.from]: Date.now() }))
      } else {
        setTypingUsers(prev => {
          const updated = { ...prev }
          delete updated[data.from]
          return updated
        })
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

  const handleSelectUser = useCallback((user) => {
    setSelectedUser(user)
    setCurrentView('chat')
    if (window.innerWidth <= 768) {
      setSidebarOpen(false)
    }
  }, [])

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
    
    // Add to local messages
    setMessages(prev => ({
      ...prev,
      [selectedUser]: [...(prev[selectedUser] || []), {
        ...msg,
        from: username,
        isMe: true,
        status: 'sent',
      }]
    }))
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

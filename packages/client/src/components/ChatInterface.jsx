import { useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { ArrowLeft, Phone, Video, Send, Smile, Paperclip, FolderOpen } from 'lucide-react'
import clsx from 'clsx'
import EmojiPicker from './EmojiPicker'

export default function ChatInterface() {
  const {
    username,
    selectedUser,
    messages,
    typingUsers,
    isCallActive,
    setCurrentView,
    setSidebarOpen,
    handleStartCall,
    handleSendMessage,
    sendTypingStatus,
  } = useApp()

  const [inputValue, setInputValue] = useState('')
  const [showEmoji, setShowEmoji] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const isTypingRef = useRef(false)

  const userMessages = messages[selectedUser] || []
  const isPeerTyping = selectedUser && typingUsers[selectedUser]

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [userMessages])

  // Cleanup typing timeout on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      if (isTypingRef.current) {
        sendTypingStatus(false)
      }
    }
  }, [sendTypingStatus])

  const getInitials = (name) => {
    if (!name) return '??'
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2)
  }

  const getAvatarColor = (name) => {
    const hash = Array.from(name || '').reduce(
      (acc, ch) => (acc * 31 + ch.charCodeAt(0)) | 0,
      0
    )
    const hue = Math.abs(hash) % 360
    return `linear-gradient(135deg, hsl(${hue}, 70%, 48%), hsl(${(hue + 30) % 360}, 70%, 43%))`
  }

  const handleSubmit = (e) => {
    e?.preventDefault()
    if (inputValue.trim()) {
      handleSendMessage(inputValue)
      setInputValue('')
      // Clear typing status when message is sent
      if (isTypingRef.current) {
        isTypingRef.current = false
        sendTypingStatus(false)
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = null
      }
    }
  }

  const handleInputChange = useCallback((e) => {
    const value = e.target.value
    setInputValue(value)

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
      typingTimeoutRef.current = null
    }

    if (value) {
      // Always send typing status when there's input (debounced by the timeout)
      if (!isTypingRef.current) {
        isTypingRef.current = true
        sendTypingStatus(true)
      }

      // Set timeout to clear typing status after 2 seconds of no input
      typingTimeoutRef.current = setTimeout(() => {
        isTypingRef.current = false
        sendTypingStatus(false)
      }, 2000)
    } else {
      // Input is empty, stop typing immediately
      if (isTypingRef.current) {
        isTypingRef.current = false
        sendTypingStatus(false)
      }
    }
  }, [sendTypingStatus])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleEmojiSelect = (emoji) => {
    setInputValue(prev => prev + emoji)
    inputRef.current?.focus()
  }

  const formatTime = (timestamp) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="flex flex-col h-full w-full bg-bg">
      {/* Header */}
      <div className="h-16 px-4 border-b border-white/[0.08] flex items-center justify-between bg-[#1e1e1e]/80 backdrop-blur-xl flex-shrink-0">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => {
              if (isCallActive) {
                setCurrentView('video')
              } else {
                setCurrentView('placeholder')
                setSidebarOpen(true)
              }
            }}
            className="md:hidden p-1 -ml-1"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0"
            style={{ background: getAvatarColor(selectedUser) }}
          >
            {getInitials(selectedUser)}
          </div>
          
          <div className="flex flex-col min-w-0">
            <h3 className="font-semibold truncate">{selectedUser}</h3>
            <span className="text-xs text-success">Online</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isCallActive ? (
            <button
              onClick={() => setCurrentView('video')}
              className="px-3.5 py-1.5 bg-success/15 text-success border border-success/30 rounded-full text-sm font-semibold flex items-center gap-1.5 animate-pulse-green"
            >
              <Phone className="w-4 h-4" />
              <span>Return</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => handleStartCall('audio')}
                className="p-2.5 rounded-full hover:bg-white/10 transition-colors"
                title="Voice Call"
              >
                <Phone className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleStartCall('video')}
                className="p-2.5 rounded-full hover:bg-white/10 transition-colors"
                title="Video Call"
              >
                <Video className="w-5 h-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 hide-scrollbar">
        {userMessages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <p>No messages yet. Say hello! 👋</p>
          </div>
        ) : (
          userMessages.map((msg, idx) => (
            <div
              key={msg.messageId || idx}
              className={clsx(
                'max-w-[80%] px-4 py-2.5 rounded-2xl text-[15px] leading-relaxed relative break-words',
                msg.isMe || msg.from === username
                  ? 'self-end bg-primary text-white rounded-br-sm'
                  : 'self-start bg-surface-light text-white rounded-bl-sm'
              )}
              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            >
              {msg.text}
              <span className="text-[10px] text-white/60 block text-right mt-1">
                {formatTime(msg.timestamp)}
              </span>
            </div>
          ))
        )}
        
        {/* Typing Indicator */}
        {isPeerTyping && (
          <div className="self-start flex items-center gap-2 px-4 py-2.5 bg-surface-light rounded-2xl rounded-bl-sm max-w-[80%]">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-typing-dot" style={{ animationDelay: '0ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-typing-dot" style={{ animationDelay: '150ms' }} />
              <span className="w-2 h-2 bg-gray-400 rounded-full animate-typing-dot" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-gray-400">{selectedUser} is typing...</span>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-3 border-t border-[#333] bg-surface flex items-center gap-2">
        <button
          onClick={() => setShowEmoji(!showEmoji)}
          className="p-2.5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] hover:opacity-80 transition-opacity hidden md:flex"
          title="Emoji"
        >
          <Smile className="w-5 h-5" />
        </button>
        
        <button
          className="p-2.5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] hover:opacity-80 transition-opacity hidden md:flex"
          title="Upload File"
        >
          <Paperclip className="w-5 h-5" />
        </button>
        
        <button
          className="p-2.5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] hover:opacity-80 transition-opacity hidden md:flex"
          title="Saved Files"
        >
          <FolderOpen className="w-5 h-5" />
        </button>

        {showEmoji && (
          <EmojiPicker
            onSelect={handleEmojiSelect}
            onClose={() => setShowEmoji(false)}
          />
        )}

        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          autoComplete="off"
          spellCheck={false}
          className="flex-1 min-w-0 p-3 bg-surface-light rounded-3xl text-white outline-none text-base"
        />

        <button
          onClick={handleSubmit}
          disabled={!inputValue.trim()}
          className="p-2.5 rounded-full bg-primary hover:bg-primary-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Send className="w-5 h-5" />
        </button>
      </div>
    </div>
  )
}

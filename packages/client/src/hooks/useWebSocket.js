import { useEffect, useRef, useState, useCallback } from 'react'

export function useWebSocket({
  username,
  isLoggedIn,
  onOnlineUsers,
  onMessage,
  onOffer,
  onAnswer,
  onIce,
  onHangup,
  onTyping,
  showToast,
}) {
  const wsRef = useRef(null)
  const [isConnected, setIsConnected] = useState(false)
  const reconnectAttemptsRef = useRef(0)
  const reconnectTimeoutRef = useRef(null)
  const heartbeatIntervalRef = useRef(null)
  const pongTimeoutRef = useRef(null)
  const isMountedRef = useRef(true)
  
  // Store callbacks in refs to avoid effect re-runs
  const callbacksRef = useRef({
    onOnlineUsers,
    onMessage,
    onOffer,
    onAnswer,
    onIce,
    onHangup,
    onTyping,
    showToast,
  })
  
  // Update refs when callbacks change
  useEffect(() => {
    callbacksRef.current = {
      onOnlineUsers,
      onMessage,
      onOffer,
      onAnswer,
      onIce,
      onHangup,
      onTyping,
      showToast,
    }
  })

  const sendMessage = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const stopHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
    if (pongTimeoutRef.current) {
      clearTimeout(pongTimeoutRef.current)
      pongTimeoutRef.current = null
    }
  }, [])

  const startHeartbeat = useCallback(() => {
    stopHeartbeat()
    
    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }))
        
        pongTimeoutRef.current = setTimeout(() => {
          console.warn('Pong timeout - closing connection')
          wsRef.current?.close()
        }, 10000)
      }
    }, 30000)
  }, [stopHeartbeat])

  useEffect(() => {
    isMountedRef.current = true
    
    if (!isLoggedIn || !username) {
      return
    }

    // Connect to WebSocket server
    // In dev mode, use same hostname as page but with server port (4430)
    // In production, use same host as page
    const hostname = window.location.hostname
    const wsHost = import.meta.env.DEV ? `${hostname}:4430` : window.location.host
    const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${wsProtocol}://${wsHost}`

    const connect = () => {
      if (!isMountedRef.current) return
      
      // Clear any pending reconnect
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }

      console.log('Connecting to WebSocket:', wsUrl)
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close()
          return
        }
        setIsConnected(true)
        reconnectAttemptsRef.current = 0
        callbacksRef.current.showToast?.('Connected to server', 'success')
        startHeartbeat()
        
        ws.send(JSON.stringify({ type: 'join', username }))
      }

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return
        
        try {
          const data = JSON.parse(event.data)
          const cb = callbacksRef.current

          switch (data.type) {
            case 'pong':
              if (pongTimeoutRef.current) {
                clearTimeout(pongTimeoutRef.current)
              }
              break

            case 'welcome':
              console.log('WebSocket welcome received')
              break

            case 'onlineUsers':
              console.log('Received online users:', data.users)
              const filteredUsers = data.users.filter(u => u !== username)
              console.log('Filtered online users (excluding self):', filteredUsers)
              cb.onOnlineUsers?.(filteredUsers)
              break

            case 'offer':
              cb.onOffer?.(data)
              break

            case 'answer':
              cb.onAnswer?.(data)
              break

            case 'ice':
              cb.onIce?.(data)
              break

            case 'hangup':
              cb.onHangup?.(data)
              break

            case 'chat':
              cb.onMessage?.({
                text: data.text,
                from: data.from,
                messageId: data.messageId,
                timestamp: data.timestamp,
                isMe: false,
              })
              break

            case 'typing':
              cb.onTyping?.(data)
              break

            case 'reject':
              cb.showToast?.(`${data.from} declined the call`, 'info')
              cb.onHangup?.(data)
              break

            case 'video-toggle':
              break

            case 'file-message':
              cb.onMessage?.({
                type: 'file',
                fileName: data.fileName,
                fileType: data.fileType,
                fileSize: data.fileSize,
                fileData: data.fileData,
                caption: data.caption || '',
                from: data.from,
                messageId: data.messageId,
                timestamp: data.timestamp,
                isMe: false,
              })
              break

            case 'delivered':
            case 'read':
              break

            default:
              console.log('Unknown message type:', data.type)
          }
        } catch (e) {
          console.error('Failed to parse message:', e)
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        stopHeartbeat()
        
        // Only reconnect if still mounted and under retry limit
        if (isMountedRef.current && reconnectAttemptsRef.current < 5) {
          reconnectAttemptsRef.current++
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000)
          console.log(`Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttemptsRef.current})`)
          callbacksRef.current.showToast?.(`Reconnecting in ${delay / 1000}s...`, 'info')
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (isMountedRef.current) {
              connect()
            }
          }, delay)
        } else if (isMountedRef.current && reconnectAttemptsRef.current >= 5) {
          callbacksRef.current.showToast?.('Connection lost. Please refresh the page.', 'danger')
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
      }
    }

    connect()

    return () => {
      isMountedRef.current = false
      stopHeartbeat()
      
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
      
      if (wsRef.current) {
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [isLoggedIn, username, startHeartbeat, stopHeartbeat])

  return {
    ws: wsRef.current,
    isConnected,
    sendMessage,
  }
}

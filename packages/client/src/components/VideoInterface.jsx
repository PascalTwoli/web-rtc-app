import { useEffect, useRef, useState, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { Mic, MicOff, Video, VideoOff, MessageSquare, PhoneOff, Maximize2, Minimize2, SwitchCamera } from 'lucide-react'
import clsx from 'clsx'

export default function VideoInterface() {
  const {
    username,
    selectedUser,
    callPeer,
    localStream,
    remoteStream,
    callType,
    setCallType,
    callStartTime,
    isMuted,
    isVideoOff,
    remoteVideoOff,
    setCurrentView,
    handleHangup,
    toggleMute,
    toggleVideo,
    sendMessage,
  } = useApp()

  // Use callPeer (actual call participant) instead of selectedUser for display
  const peerUser = callPeer || selectedUser

  // Separate refs for main and PiP video elements
  const mainVideoRef = useRef(null)
  const pipVideoRef = useRef(null)
  const [callDuration, setCallDuration] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isSwapped, setIsSwapped] = useState(false) // For swapping main/PiP views
  const [facingMode, setFacingMode] = useState('user') // 'user' or 'environment'
  const containerRef = useRef(null)

  // Assign streams to video elements based on swap state
  useEffect(() => {
    const mainVideo = mainVideoRef.current
    const pipVideo = pipVideoRef.current
    
    if (!isSwapped) {
      // Default: Remote in main, Local in PiP
      if (mainVideo && remoteStream) mainVideo.srcObject = remoteStream
      if (pipVideo && localStream) pipVideo.srcObject = localStream
    } else {
      // Swapped: Local in main, Remote in PiP
      if (mainVideo && localStream) mainVideo.srcObject = localStream
      if (pipVideo && remoteStream) pipVideo.srcObject = remoteStream
    }
  }, [localStream, remoteStream, isSwapped])

  // Use persistent call start time from context
  useEffect(() => {
    if (!callStartTime) return
    
    const updateDuration = () => {
      setCallDuration(Math.floor((Date.now() - callStartTime) / 1000))
    }
    
    updateDuration() // Set initial value
    const interval = setInterval(updateDuration, 1000)
    return () => clearInterval(interval)
  }, [callStartTime])

  // Auto-hide controls after 3 seconds of inactivity
  useEffect(() => {
    let timeout
    const resetTimeout = () => {
      setShowControls(true)
      clearTimeout(timeout)
      timeout = setTimeout(() => setShowControls(false), 3000)
    }
    
    window.addEventListener('mousemove', resetTimeout)
    window.addEventListener('touchstart', resetTimeout)
    resetTimeout()
    
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('mousemove', resetTimeout)
      window.removeEventListener('touchstart', resetTimeout)
    }
  }, [])

  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await containerRef.current?.requestFullscreen()
      setIsFullscreen(true)
    } else {
      await document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const formatDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    const pad = (n) => n.toString().padStart(2, '0')
    
    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
    }
    return `${pad(mins)}:${pad(secs)}`
  }

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

  const isAudioOnly = callType === 'audio'

  // Flip camera (mobile only) - needs to be moved to useWebRTC for proper peer connection update
  // For now, this is a simplified version that works locally
  const flipCamera = useCallback(async () => {
    if (!localStream) return
    
    const newFacingMode = facingMode === 'user' ? 'environment' : 'user'
    
    try {
      // Get new stream with different facing mode
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: newFacingMode }
      })
      
      const newVideoTrack = newStream.getVideoTracks()[0]
      const oldVideoTrack = localStream.getVideoTracks()[0]
      
      if (oldVideoTrack) {
        // Stop old track
        oldVideoTrack.stop()
        localStream.removeTrack(oldVideoTrack)
      }
      
      // Add new track to stream
      localStream.addTrack(newVideoTrack)
      
      setFacingMode(newFacingMode)
    } catch (error) {
      console.error('Failed to flip camera:', error)
    }
  }, [localStream, facingMode])

  // Swap main and PiP views
  const swapViews = useCallback(() => {
    setIsSwapped(prev => !prev)
  }, [])

  return (
    <div 
      ref={containerRef}
      className="flex-1 relative bg-black h-full max-h-screen overflow-hidden"
    >
      {/* Call Status Bar */}
      <div className={clsx(
        'absolute top-3 md:top-5 left-1/2 -translate-x-1/2 z-20 transition-all duration-300',
        'bg-black/70 backdrop-blur-xl px-4 md:px-5 py-2 md:py-2.5 rounded-full border border-white/10 shadow-lg',
        showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
      )}>
        <div className="flex items-center gap-2 md:gap-3">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider hidden md:block">Connected</span>
            <span className="font-semibold tabular-nums text-base md:text-lg">{formatDuration(callDuration)}</span>
          </div>
        </div>
      </div>

      {/* Video Grid - constrained to viewport */}
      <div className="absolute inset-0 p-2 md:p-4">
        {/* Main Video (Full screen) - shows remote by default, or local if swapped */}
        <div className="w-full h-full rounded-xl overflow-hidden bg-black relative flex items-center justify-center">
          {/* Determine what to show in main view */}
          {(() => {
            const showingLocal = isSwapped
            const hasVideo = showingLocal 
              ? (localStream && !isVideoOff) 
              : (remoteStream && !remoteVideoOff)
            const showVideo = hasVideo && !isAudioOnly
            const displayName = showingLocal ? 'You' : peerUser
            const displayUsername = showingLocal ? username : peerUser
            
            return (
              <>
                {showVideo ? (
                  <video
                    ref={mainVideoRef}
                    autoPlay
                    muted={showingLocal}
                    playsInline
                    className="w-full h-full object-contain md:object-cover"
                    style={showingLocal ? { transform: 'scaleX(-1)' } : undefined}
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-radial from-[#2c3e50] to-[#1a1a1a]">
                    <div
                      className="w-28 h-28 md:w-36 md:h-36 rounded-full flex items-center justify-center text-4xl md:text-5xl font-bold text-white mb-4 md:mb-6 shadow-2xl border-4 border-white/10"
                      style={{ background: getAvatarColor(displayUsername) }}
                    >
                      {getInitials(displayUsername)}
                    </div>
                    <p className="text-xl md:text-2xl font-semibold">{displayName}</p>
                    <p className="text-sm text-gray-400 mt-2">
                      {isAudioOnly ? 'Audio Call' : (showingLocal ? (isVideoOff ? 'Camera Off' : '') : (remoteVideoOff ? 'Camera Off' : 'Connecting...'))}
                    </p>
                  </div>
                )}
                <span className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg text-xs z-10">
                  {displayName}
                </span>
              </>
            )
          })()}
        </div>

        {/* PiP Video - tap to swap */}
        <div 
          className="absolute bottom-20 right-2 md:right-4 w-20 h-28 sm:w-24 sm:h-32 md:w-32 md:h-24 lg:w-40 lg:h-28 rounded-xl overflow-hidden shadow-2xl border-2 border-[#333] z-10 bg-[#1a1a1a] cursor-pointer active:scale-95 transition-transform"
          onClick={swapViews}
        >
          {/* PiP shows the opposite of main view */}
          {(() => {
            const showingLocal = !isSwapped // PiP shows local when NOT swapped
            const hasVideo = showingLocal 
              ? (localStream && !isVideoOff) 
              : (remoteStream && !remoteVideoOff)
            const showVideo = hasVideo && !isAudioOnly
            const displayName = showingLocal ? 'You' : peerUser
            const displayUsername = showingLocal ? username : peerUser
            
            return (
              <>
                {showVideo ? (
                  <video
                    ref={pipVideoRef}
                    autoPlay
                    muted={showingLocal}
                    playsInline
                    className="w-full h-full object-cover"
                    style={showingLocal ? { transform: 'scaleX(-1)' } : undefined}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-radial from-[#34495e] to-[#151515]">
                    <div
                      className="w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center text-lg md:text-xl font-bold text-white"
                      style={{ background: getAvatarColor(displayUsername) }}
                    >
                      {getInitials(displayUsername)}
                    </div>
                  </div>
                )}
                <span className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px]">
                  {displayName}
                </span>
              </>
            )
          })()}
          
          {/* Muted/Video off indicators */}
          <div className="absolute top-2 right-2 flex gap-1">
            {isMuted && (
              <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center">
                <MicOff className="w-3 h-3" />
              </div>
            )}
            {isVideoOff && !isAudioOnly && (
              <div className="w-6 h-6 rounded-full bg-red-500/80 flex items-center justify-center">
                <VideoOff className="w-3 h-3" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className={clsx(
        'absolute bottom-5 left-1/2 -translate-x-1/2 z-20 transition-all duration-300',
        'flex gap-2 md:gap-4 bg-black/70 backdrop-blur-xl px-3 md:px-6 py-3 rounded-full border border-white/10 shadow-2xl',
        showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      )}>
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute() }}
          className={clsx(
            'w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95',
            isMuted ? 'bg-white text-black shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
          )}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5 md:w-6 md:h-6" /> : <Mic className="w-5 h-5 md:w-6 md:h-6" />}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); toggleVideo() }}
          className={clsx(
            'w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95',
            isVideoOff ? 'bg-white text-black shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
          )}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5 md:w-6 md:h-6" /> : <Video className="w-5 h-5 md:w-6 md:h-6" />}
        </button>

        {/* Flip camera - mobile only */}
        {!isAudioOnly && !isVideoOff && (
          <button
            onClick={(e) => { e.stopPropagation(); flipCamera() }}
            className="w-10 h-10 md:hidden rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
            title="Flip Camera"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); setCurrentView('chat') }}
          className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
          title="Chat"
        >
          <MessageSquare className="w-5 h-5 md:w-6 md:h-6" />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
          className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 hidden md:flex"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5 md:w-6 md:h-6" /> : <Maximize2 className="w-5 h-5 md:w-6 md:h-6" />}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); handleHangup() }}
          className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg shadow-red-500/30"
          title="Hang Up"
        >
          <PhoneOff className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>
    </div>
  )
}

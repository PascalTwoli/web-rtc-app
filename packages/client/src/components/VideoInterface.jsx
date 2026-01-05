import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { Mic, MicOff, Video, VideoOff, MessageSquare, PhoneOff, Maximize2, Minimize2 } from 'lucide-react'
import clsx from 'clsx'

export default function VideoInterface() {
  const {
    username,
    selectedUser,
    localStream,
    remoteStream,
    callType,
    isMuted,
    isVideoOff,
    setCurrentView,
    handleHangup,
    toggleMute,
    toggleVideo,
  } = useApp()

  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const [callDuration, setCallDuration] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
      console.log('Remote stream attached:', remoteStream.getAudioTracks().length, 'audio tracks')
    }
  }, [remoteStream])

  useEffect(() => {
    const interval = setInterval(() => {
      setCallDuration(prev => prev + 1)
    }, 1000)
    return () => clearInterval(interval)
  }, [])

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

  return (
    <div 
      ref={containerRef}
      className="flex-1 relative bg-black"
    >
      {/* Call Status Bar */}
      <div className={clsx(
        'absolute top-5 left-1/2 -translate-x-1/2 z-20 transition-all duration-300',
        'bg-black/70 backdrop-blur-xl px-5 py-2.5 rounded-full border border-white/10 shadow-lg',
        showControls ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 pointer-events-none'
      )}>
        <div className="flex items-center gap-3">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-gray-400 uppercase tracking-wider hidden md:block">Connected</span>
            <span className="font-semibold tabular-nums text-lg">{formatDuration(callDuration)}</span>
          </div>
        </div>
      </div>

      {/* Video Grid */}
      <div className="w-full h-full relative p-5">
        {/* Remote Video (Full screen) */}
        <div className="w-full h-full rounded-xl overflow-hidden bg-black relative">
          {remoteStream ? (
            <>
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className={clsx(
                  'w-full h-full',
                  isAudioOnly ? 'hidden' : 'object-cover'
                )}
              />
              {isAudioOnly && (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-radial from-[#2c3e50] to-[#1a1a1a]">
                  <div
                    className="w-36 h-36 rounded-full flex items-center justify-center text-5xl font-bold text-white mb-6 shadow-2xl border-4 border-white/10"
                    style={{ background: getAvatarColor(selectedUser) }}
                  >
                    {getInitials(selectedUser)}
                  </div>
                  <p className="text-2xl font-semibold">{selectedUser}</p>
                  <p className="text-sm text-gray-400 mt-2">Audio Call</p>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-radial from-[#2c3e50] to-[#1a1a1a]">
              <div
                className="w-36 h-36 rounded-full flex items-center justify-center text-5xl font-bold text-white mb-6 shadow-2xl border-4 border-white/10"
                style={{ background: getAvatarColor(selectedUser) }}
              >
                {getInitials(selectedUser)}
              </div>
              <p className="text-2xl font-semibold">{selectedUser}</p>
            </div>
          )}
          
          <span className="absolute bottom-3 left-3 bg-black/60 px-2 py-1 rounded text-xs z-10">
            {selectedUser}
          </span>
        </div>

        {/* Local Video (Picture-in-picture) */}
        <div className="absolute bottom-24 right-5 w-28 h-40 md:w-60 md:h-40 rounded-xl overflow-hidden shadow-2xl border-2 border-[#333] z-10">
          {localStream && !isAudioOnly && !isVideoOff ? (
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-radial from-[#34495e] to-[#151515]">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
                style={{ background: getAvatarColor(username) }}
              >
                {getInitials(username)}
              </div>
            </div>
          )}
          
          <span className="absolute bottom-2 left-2 bg-black/60 px-1.5 py-0.5 rounded text-[10px]">
            You
          </span>
        </div>
      </div>

      {/* Controls Bar */}
      <div className={clsx(
        'absolute bottom-5 left-1/2 -translate-x-1/2 z-20 transition-all duration-300',
        'flex gap-3 md:gap-4 bg-black/70 backdrop-blur-xl px-4 md:px-6 py-3 rounded-full border border-white/10 shadow-2xl',
        showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
      )}>
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute() }}
          className={clsx(
            'w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95',
            isMuted ? 'bg-white text-black shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
          )}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5 md:w-6 md:h-6" /> : <Mic className="w-5 h-5 md:w-6 md:h-6" />}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); toggleVideo() }}
          className={clsx(
            'w-11 h-11 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95',
            isVideoOff ? 'bg-white text-black shadow-lg' : 'bg-white/10 text-white hover:bg-white/20'
          )}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? <VideoOff className="w-5 h-5 md:w-6 md:h-6" /> : <Video className="w-5 h-5 md:w-6 md:h-6" />}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setCurrentView('chat') }}
          className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
          title="Chat"
        >
          <MessageSquare className="w-5 h-5 md:w-6 md:h-6" />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); toggleFullscreen() }}
          className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 hidden md:flex"
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="w-5 h-5 md:w-6 md:h-6" /> : <Maximize2 className="w-5 h-5 md:w-6 md:h-6" />}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); handleHangup() }}
          className="w-11 h-11 md:w-12 md:h-12 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg shadow-red-500/30"
          title="Hang Up"
        >
          <PhoneOff className="w-5 h-5 md:w-6 md:h-6" />
        </button>
      </div>
    </div>
  )
}

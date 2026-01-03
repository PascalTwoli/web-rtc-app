import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { Mic, MicOff, Video, VideoOff, MessageSquare, PhoneOff, RefreshCw } from 'lucide-react'
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
      className="flex-1 relative bg-black"
      onClick={() => setShowControls(prev => !prev)}
    >
      {/* Call Status Bar */}
      <div className={clsx(
        'absolute top-5 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-300',
        'bg-black/60 backdrop-blur-lg px-4 py-2 rounded-full border border-white/10',
        showControls ? 'opacity-100' : 'opacity-0'
      )}>
        <div className="flex flex-col items-center">
          <span className="text-xs text-gray-400 uppercase tracking-wider md:block hidden">Connected</span>
          <span className="font-semibold tabular-nums">{formatDuration(callDuration)}</span>
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
        'absolute bottom-5 left-1/2 -translate-x-1/2 z-20 transition-opacity duration-300',
        'flex gap-5 bg-[#1e1e1e]/80 px-6 py-3 rounded-full backdrop-blur-lg',
        showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
      )}>
        <button
          onClick={(e) => { e.stopPropagation(); toggleMute() }}
          className={clsx(
            'w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110',
            isMuted ? 'bg-white text-black' : 'bg-surface-light text-white hover:bg-[#444]'
          )}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); toggleVideo() }}
          className={clsx(
            'w-12 h-12 rounded-full flex items-center justify-center transition-all hover:scale-110',
            isVideoOff ? 'bg-white text-black' : 'bg-surface-light text-white hover:bg-[#444]'
          )}
          title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
        >
          {isVideoOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); setCurrentView('chat') }}
          className="w-12 h-12 rounded-full bg-surface-light hover:bg-[#444] flex items-center justify-center transition-all hover:scale-110"
          title="Chat"
        >
          <MessageSquare className="w-6 h-6" />
        </button>

        <button
          onClick={(e) => { e.stopPropagation(); handleHangup() }}
          className="w-12 h-12 rounded-full bg-danger hover:bg-danger-hover flex items-center justify-center transition-all hover:scale-110"
          title="Hang Up"
        >
          <PhoneOff className="w-6 h-6" />
        </button>
      </div>
    </div>
  )
}

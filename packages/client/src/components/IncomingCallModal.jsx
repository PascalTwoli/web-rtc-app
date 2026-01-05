import { useApp } from '../context/AppContext'
import { Phone, PhoneOff, Video } from 'lucide-react'

export default function IncomingCallModal() {
  const { incomingCall, handleAnswerCall, handleRejectCall } = useApp()

  if (!incomingCall) return null

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

  const isVideoCall = incomingCall.callType === 'video'
  const callTypeText = isVideoCall ? 'Video Call' : 'Voice Call'

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#1a1a2e] to-[#16213e] backdrop-blur-xl flex flex-col items-center justify-center z-[9999] animate-fade-in">
      {/* Call type indicator */}
      <div className="flex items-center gap-2 text-gray-400 mb-6">
        {isVideoCall ? <Video className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
        <span className="text-sm uppercase tracking-wider">Incoming {callTypeText}</span>
      </div>
      
      {/* Animated avatar with rings */}
      <div className="relative mb-6">
        <div className="absolute inset-0 w-32 h-32 rounded-full border-2 border-green-500/30 animate-ping" style={{ animationDuration: '1.5s' }} />
        <div className="absolute inset-0 w-32 h-32 rounded-full border-2 border-green-500/20 animate-ping" style={{ animationDuration: '2s', animationDelay: '0.3s' }} />
        <div
          className="relative w-32 h-32 rounded-full flex items-center justify-center text-5xl font-bold text-white shadow-2xl border-4 border-white/20"
          style={{ background: getAvatarColor(incomingCall.from) }}
        >
          {getInitials(incomingCall.from)}
        </div>
      </div>
      
      <p className="text-2xl font-semibold mb-1">{incomingCall.from}</p>
      <p className="text-sm text-gray-500 mb-16">is calling you...</p>

      <div className="flex gap-12">
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleRejectCall}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg shadow-red-500/30"
            title="Decline"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
          <span className="text-xs text-gray-400">Decline</span>
        </div>

        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleAnswerCall}
            className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg shadow-green-500/30"
            title="Answer"
          >
            <Phone className="w-7 h-7" />
          </button>
          <span className="text-xs text-gray-400">Accept</span>
        </div>
      </div>
    </div>
  )
}

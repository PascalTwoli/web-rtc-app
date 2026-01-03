import { useApp } from '../context/AppContext'
import { Phone, X } from 'lucide-react'

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

  const callTypeText = incomingCall.callType === 'video' ? 'Video Call' : 'Voice Call'

  return (
    <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center z-[9999] animate-fade-in">
      <h3 className="text-2xl font-light opacity-80 mb-2">Incoming {callTypeText}</h3>
      
      <div
        className="w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold text-white my-6 animate-pulse-avatar"
        style={{ background: getAvatarColor(incomingCall.from) }}
      >
        {getInitials(incomingCall.from)}
      </div>
      
      <p className="text-3xl font-bold mb-16">{incomingCall.from}</p>

      <div className="flex gap-10">
        <button
          onClick={handleAnswerCall}
          className="w-16 h-16 md:w-[70px] md:h-[70px] rounded-full bg-success flex items-center justify-center hover:scale-110 transition-transform"
          title="Answer"
        >
          <Phone className="w-8 h-8" />
        </button>

        <button
          onClick={handleRejectCall}
          className="w-16 h-16 md:w-[70px] md:h-[70px] rounded-full bg-danger flex items-center justify-center hover:scale-110 transition-transform"
          title="Decline"
        >
          <X className="w-8 h-8" />
        </button>
      </div>
    </div>
  )
}

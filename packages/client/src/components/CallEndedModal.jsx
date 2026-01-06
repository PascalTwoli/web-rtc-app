import { PhoneOff } from 'lucide-react'

export default function CallEndedModal({ callEndedInfo }) {
  if (!callEndedInfo) return null

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00'
    const hrs = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`
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

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-[#0a1a0a] via-[#0f2d0f] to-[#0a1a0a] animate-fade-in">
      {/* Pulsing background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[400px] h-[400px] rounded-full bg-green-500/10 blur-3xl animate-pulse" />
      </div>
      
      {/* Content */}
      <div className="relative flex flex-col items-center gap-6 animate-scale-in">
        {/* Caller avatar */}
        {callEndedInfo.caller && (
          <div
            className="w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center text-3xl md:text-4xl font-bold text-white shadow-2xl border-4 border-white/20"
            style={{ background: getAvatarColor(callEndedInfo.caller) }}
          >
            {getInitials(callEndedInfo.caller)}
          </div>
        )}
        
        {/* Call ended icon */}
        <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center shadow-xl">
          <PhoneOff className="w-8 h-8 md:w-10 md:h-10 text-white" />
        </div>
        
        {/* Text */}
        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Call Ended</h2>
          {callEndedInfo.caller && (
            <p className="text-lg text-gray-400 mb-3">with {callEndedInfo.caller}</p>
          )}
          <div className="flex items-center justify-center gap-2 text-xl md:text-2xl">
            <span className="text-gray-400">Duration:</span>
            <span className="font-semibold text-white tabular-nums">{formatDuration(callEndedInfo.duration)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

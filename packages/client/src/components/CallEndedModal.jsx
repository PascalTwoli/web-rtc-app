import { PhoneOff } from 'lucide-react'

export default function CallEndedModal({ callEndedInfo }) {
  if (!callEndedInfo) return null

  const formatDuration = (seconds) => {
    if (!seconds) return '0:00'
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-b from-[#1a0a0a] via-[#2d0f0f] to-[#1a0a0a] animate-fade-in">
      {/* Pulsing background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[400px] h-[400px] rounded-full bg-red-500/10 blur-3xl animate-pulse" />
      </div>
      
      {/* Content */}
      <div className="relative flex flex-col items-center gap-8 animate-scale-in">
        {/* Large red icon */}
        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-red-500 to-red-700 flex items-center justify-center shadow-2xl shadow-red-500/40 animate-bounce-slow">
          <PhoneOff className="w-16 h-16 md:w-20 md:h-20 text-white" />
        </div>
        
        {/* Text */}
        <div className="text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-3">Call Ended</h2>
          <p className="text-xl md:text-2xl text-gray-300">
            Duration: <span className="font-semibold text-white">{formatDuration(callEndedInfo.duration)}</span>
          </p>
        </div>
      </div>
    </div>
  )
}

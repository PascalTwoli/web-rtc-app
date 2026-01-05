import { useApp } from '../context/AppContext'
import { PhoneOff } from 'lucide-react'

export default function CallingOverlay() {
  const { selectedUser, handleHangup, callType } = useApp()

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

  const callTypeText = callType === 'video' ? 'Video' : 'Voice'

  return (
    <div className="fixed inset-0 bg-gradient-to-b from-[#1a1a2e] to-[#16213e] flex flex-col items-center justify-center z-[200] animate-fade-in">
      {/* Animated rings */}
      <div className="relative mb-8">
        <div className="absolute inset-0 w-32 h-32 rounded-full border-2 border-white/10 animate-ping" style={{ animationDuration: '2s' }} />
        <div className="absolute inset-0 w-32 h-32 rounded-full border-2 border-white/5 animate-ping" style={{ animationDuration: '2.5s', animationDelay: '0.5s' }} />
        <div
          className="relative w-32 h-32 rounded-full flex items-center justify-center text-5xl font-bold text-white shadow-2xl border-4 border-white/20"
          style={{ background: getAvatarColor(selectedUser) }}
        >
          {getInitials(selectedUser)}
        </div>
      </div>
      
      <h3 className="text-lg text-gray-400 mb-1">{callTypeText} Call</h3>
      <p className="text-2xl font-semibold mb-2">{selectedUser}</p>
      <p className="text-sm text-gray-500 mb-16">Ringing...</p>

      <button
        onClick={handleHangup}
        className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95 shadow-lg shadow-red-500/30"
        title="Cancel"
      >
        <PhoneOff className="w-7 h-7" />
      </button>
    </div>
  )
}

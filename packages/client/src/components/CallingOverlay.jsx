import { useApp } from '../context/AppContext'
import { Phone, X } from 'lucide-react'

export default function CallingOverlay() {
  const { selectedUser, handleHangup } = useApp()

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
    <div className="fixed inset-0 bg-bg flex flex-col items-center justify-center z-[200]">
      <div
        className="w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold text-white mb-10 animate-pulse-avatar"
        style={{ background: getAvatarColor(selectedUser) }}
      >
        {getInitials(selectedUser)}
      </div>
      
      <h3 className="text-2xl font-light mb-2">Calling...</h3>
      <p className="text-xl text-gray-400 mb-16">{selectedUser}</p>

      <button
        onClick={handleHangup}
        className="w-14 h-14 rounded-full bg-danger hover:bg-danger-hover flex items-center justify-center transition-all hover:scale-110"
        title="Cancel"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  )
}

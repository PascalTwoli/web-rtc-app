import clsx from 'clsx'
import { MessageCircle } from 'lucide-react'

export default function ToastContainer({ toasts }) {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 z-[2000] pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            'bg-[#1e1e1e]/95 backdrop-blur-xl text-white px-5 py-2.5 rounded-2xl',
            'shadow-xl border font-medium text-sm animate-slide-down',
            'max-w-[90vw] pointer-events-auto',
            'flex items-center gap-2',
            toast.type === 'success' && 'border-success/50',
            toast.type === 'danger' && 'border-danger/50',
            toast.type === 'info' && 'border-primary/50',
            toast.type === 'message' && 'border-cyan-500/50 bg-cyan-950/80',
            !toast.type && 'border-white/10'
          )}
        >
          {toast.type === 'message' && (
            <MessageCircle className="w-4 h-4 text-cyan-400 flex-shrink-0" />
          )}
          <span className="truncate">{toast.message}</span>
        </div>
      ))}
    </div>
  )
}

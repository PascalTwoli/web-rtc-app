import clsx from 'clsx'

export default function ToastContainer({ toasts }) {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 z-[2000] pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            'bg-[#1e1e1e]/95 backdrop-blur-xl text-white px-5 py-2 rounded-full',
            'shadow-xl border font-medium text-sm animate-slide-down',
            'min-w-max max-w-[90vw] whitespace-nowrap pointer-events-auto',
            'flex items-center justify-center',
            toast.type === 'success' && 'border-success/50',
            toast.type === 'danger' && 'border-danger/50',
            toast.type === 'info' && 'border-primary/50',
            !toast.type && 'border-white/10'
          )}
        >
          {toast.message}
        </div>
      ))}
    </div>
  )
}

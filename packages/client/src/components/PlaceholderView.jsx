import { useApp } from '../context/AppContext'
import { Users } from 'lucide-react'

export default function PlaceholderView() {
  const { setSidebarOpen } = useApp()

  return (
    <div className="flex-1 flex items-center justify-center bg-bg">
      <div className="text-center text-gray-400 max-w-xs">
        <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-surface-light flex items-center justify-center">
          <Users className="w-10 h-10 text-gray-500" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">Welcome to Peers</h3>
        <p className="mb-6">Select a user from the sidebar to start chatting or calling.</p>
        
        <button
          onClick={() => setSidebarOpen(true)}
          className="md:hidden px-5 py-2.5 bg-primary hover:bg-primary-hover rounded-full text-white font-semibold transition-colors"
        >
          View Peers
        </button>
      </div>
    </div>
  )
}

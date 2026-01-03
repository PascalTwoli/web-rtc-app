import { useApp } from '../context/AppContext'
import { LogOut } from 'lucide-react'
import clsx from 'clsx'

export default function Sidebar() {
  const {
    username,
    onlineUsers,
    selectedUser,
    setSelectedUser,
    sidebarOpen,
    setSidebarOpen,
    handleLogout,
  } = useApp()

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
    <aside
      className={clsx(
        'w-80 bg-[#181818] border-r border-white/[0.08] flex flex-col flex-shrink-0 z-50',
        'md:relative md:translate-x-0',
        'absolute top-0 left-0 h-full transition-transform duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
      )}
    >
      {/* Header */}
      <div className="h-16 px-5 border-b border-white/[0.08] flex items-center justify-between bg-[#1e1e1e]/40">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Peers</h2>
          <div className="flex items-center text-xs text-gray-400 mt-0.5 font-medium">
            <span className="w-2 h-2 bg-success rounded-full mr-1.5" />
            <span>{username}</span>
          </div>
        </div>
        
        <button
          onClick={handleLogout}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-3">
        {onlineUsers.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            <p>No other users online</p>
            <p className="text-sm mt-2">Share the link to invite others</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {onlineUsers.map((user) => (
              <li
                key={user}
                onClick={() => setSelectedUser(user)}
                className={clsx(
                  'p-2.5 rounded-xl cursor-pointer transition-all flex items-center gap-3',
                  'hover:bg-white/5 active:scale-[0.98]',
                  selectedUser === user && 'bg-primary/15'
                )}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm text-white flex-shrink-0 shadow-lg"
                  style={{ background: getAvatarColor(user) }}
                >
                  {getInitials(user)}
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-medium truncate">{user}</span>
                  <span className="text-xs text-gray-400 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-success rounded-full" />
                    Online
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  )
}

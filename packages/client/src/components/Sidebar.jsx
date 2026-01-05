import { useApp } from '../context/AppContext'
import { LogOut, X, Users, Wifi } from 'lucide-react'
import clsx from 'clsx'

export default function Sidebar() {
  const {
    username,
    onlineUsers,
    allUsers,
    userFilter,
    setUserFilter,
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

  // Get users to display based on filter
  const displayUsers = userFilter === 'online' 
    ? onlineUsers.map(u => ({ username: u, isOnline: true }))
    : allUsers.length > 0 
      ? allUsers 
      : onlineUsers.map(u => ({ username: u, isOnline: true }))

  const onlineCount = allUsers.filter(u => u.isOnline).length || onlineUsers.length

  return (
    <>
      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      <aside
        className={clsx(
          'bg-[#181818] border-r border-white/[0.08] flex flex-col flex-shrink-0 z-50',
          // Mobile: full screen overlay
          'fixed inset-0 md:relative md:inset-auto',
          'md:w-80',
          'transition-transform duration-300',
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
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="p-2 rounded-full hover:bg-white/10 transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
          
          {/* Close button for mobile */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-full hover:bg-white/10 transition-colors md:hidden"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 py-2 border-b border-white/[0.08]">
        <div className="flex gap-1 bg-[#252525] rounded-lg p-1">
          <button
            onClick={() => setUserFilter('all')}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
              userFilter === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            )}
          >
            <Users className="w-3.5 h-3.5" />
            <span>All</span>
            <span className="text-xs opacity-70">({allUsers.length || onlineUsers.length})</span>
          </button>
          <button
            onClick={() => setUserFilter('online')}
            className={clsx(
              'flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
              userFilter === 'online'
                ? 'bg-green-500 text-white shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            )}
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Online</span>
            <span className="text-xs opacity-70">({onlineCount})</span>
          </button>
        </div>
      </div>

      {/* Users List */}
      <div className="flex-1 overflow-y-auto hide-scrollbar p-3">
        {displayUsers.length === 0 ? (
          <div className="text-center text-gray-500 mt-10">
            <p>{userFilter === 'online' ? 'No users online' : 'No users yet'}</p>
            <p className="text-sm mt-2">Share the link to invite others</p>
          </div>
        ) : (
          <ul className="space-y-1">
            {displayUsers.map((userObj) => {
              const user = typeof userObj === 'string' ? userObj : userObj.username
              const isOnline = typeof userObj === 'string' ? true : userObj.isOnline
              
              return (
                <li
                  key={user}
                  onClick={() => {
                    setSelectedUser(user)
                    setSidebarOpen(false) // Close sidebar on mobile after selecting user
                  }}
                  className={clsx(
                    'p-3 rounded-xl cursor-pointer transition-all duration-200 flex items-center gap-3',
                    'hover:bg-white/[0.06] active:scale-[0.98]',
                    selectedUser === user && 'bg-gradient-to-r from-primary/20 to-primary/10 border-l-2 border-primary'
                  )}
                >
                  <div className="relative">
                    <div
                      className={clsx(
                        "w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm text-white flex-shrink-0 shadow-lg",
                        !isOnline && "opacity-60"
                      )}
                      style={{ background: getAvatarColor(user) }}
                    >
                      {getInitials(user)}
                    </div>
                    {/* Online/Offline indicator */}
                    <span 
                      className={clsx(
                        "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#181818]",
                        isOnline ? "bg-green-500" : "bg-gray-500"
                      )}
                    />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className={clsx("font-medium truncate", !isOnline && "text-gray-400")}>{user}</span>
                    <span className={clsx(
                      "text-xs flex items-center gap-1",
                      isOnline ? "text-green-400" : "text-gray-500"
                    )}>
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </aside>
    </>
  )
}

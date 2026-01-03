import { useApp } from '../context/AppContext'
import PlaceholderView from './PlaceholderView'
import ChatInterface from './ChatInterface'
import VideoInterface from './VideoInterface'
import IncomingCallModal from './IncomingCallModal'
import CallingOverlay from './CallingOverlay'

export default function MainContent() {
  const { currentView, incomingCall, isCalling } = useApp()

  return (
    <main className="flex-1 relative flex flex-col bg-black overflow-hidden">
      {currentView === 'placeholder' && <PlaceholderView />}
      {currentView === 'chat' && <ChatInterface />}
      {currentView === 'video' && <VideoInterface />}
      
      {/* Modals and Overlays */}
      {incomingCall && <IncomingCallModal />}
      {isCalling && <CallingOverlay />}
    </main>
  )
}

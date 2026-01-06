import { useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import PlaceholderView from './PlaceholderView'
import ChatInterface from './ChatInterface'
import VideoInterface from './VideoInterface'
import IncomingCallModal from './IncomingCallModal'
import CallingOverlay from './CallingOverlay'

export default function MainContent() {
  const { currentView, incomingCall, isCalling, remoteStream, isCallActive } = useApp()
  const audioRef = useRef(null)

  // Keep remote audio playing even when VideoInterface is not mounted
  // This ensures audio continues when user switches to chat view during a call
  useEffect(() => {
    const audioElement = audioRef.current
    if (audioElement && remoteStream) {
      // Only set srcObject if it's different to avoid re-triggering
      if (audioElement.srcObject !== remoteStream) {
        audioElement.srcObject = remoteStream
      }
      // Ensure audio is playing
      if (audioElement.paused) {
        audioElement.play().catch(err => {
          console.log('Audio autoplay prevented:', err)
        })
      }
    }
  }, [remoteStream, isCallActive, currentView]) // Re-run when view changes to ensure audio continues

  // Cleanup only when call ends, not on every view change
  useEffect(() => {
    if (!isCallActive && audioRef.current) {
      audioRef.current.srcObject = null
    }
  }, [isCallActive])

  return (
    <main className="flex-1 relative flex flex-col bg-black overflow-hidden">
      {/* Hidden audio element for remote stream - ALWAYS rendered to persist across view changes */}
      <audio 
        ref={audioRef} 
        autoPlay 
        playsInline
        style={{ display: 'none' }}
      />
      
      {currentView === 'placeholder' && <PlaceholderView />}
      {currentView === 'chat' && <ChatInterface />}
      {currentView === 'video' && <VideoInterface />}
      
      {/* Modals and Overlays */}
      {incomingCall && <IncomingCallModal />}
      {isCalling && <CallingOverlay />}
    </main>
  )
}

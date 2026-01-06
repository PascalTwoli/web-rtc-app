import { useEffect, useRef, useState, useCallback } from 'react'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

export function useWebRTC({
  sendMessage,
  username,
  selectedUser,
  callPeer,
  onCallConnected,
  onCallEnded,
}) {
  const [localStream, setLocalStream] = useState(null)
  const [remoteStream, setRemoteStream] = useState(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  
  const peerConnectionRef = useRef(null)
  const pendingCandidatesRef = useRef([])
  const dataChannelRef = useRef(null)
  
  // Use callPeer for signaling if available, otherwise fall back to selectedUser
  const targetPeer = callPeer || selectedUser

  const createPeerConnection = useCallback((targetUser) => {
    const pc = new RTCPeerConnection(ICE_SERVERS)

    pc.onicecandidate = (event) => {
      if (event.candidate && targetUser) {
        sendMessage({
          type: 'ice',
          to: targetUser,
          ice: event.candidate,
        })
      }
    }

    pc.ontrack = (event) => {
      console.log('Received remote stream:', event.streams[0])
      console.log('Audio tracks:', event.streams[0].getAudioTracks().length)
      console.log('Video tracks:', event.streams[0].getVideoTracks().length)
      setRemoteStream(event.streams[0])
    }

    pc.oniceconnectionstatechange = () => {
      console.log('ICE connection state:', pc.iceConnectionState)
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        onCallConnected?.()
      } else if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        // Only end call on failed/closed, not on 'disconnected' as it can recover
        onCallEnded?.()
      }
    }

    pc.onconnectionstatechange = () => {
      console.log('Connection state:', pc.connectionState)
      if (pc.connectionState === 'connected') {
        onCallConnected?.()
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        onCallEnded?.()
      }
    }

    // Data channel for peer-to-peer messaging
    pc.ondatachannel = (event) => {
      dataChannelRef.current = event.channel
    }

    peerConnectionRef.current = pc
    return pc
  }, [sendMessage, onCallConnected, onCallEnded])

  const getMediaStream = useCallback(async (type) => {
    try {
      // Check if mediaDevices is available (requires HTTPS or localhost)
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error(
          'Camera/microphone access requires HTTPS. Please use localhost or enable HTTPS.'
        )
      }
      
      const constraints = {
        audio: true,
        video: type === 'video' ? { facingMode: 'user' } : false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      console.log('Local stream obtained:', stream.getAudioTracks().length, 'audio tracks,', stream.getVideoTracks().length, 'video tracks')
      setLocalStream(stream)
      return stream
    } catch (error) {
      console.error('Failed to get media:', error)
      throw error
    }
  }, [])

  const startCall = useCallback(async (targetUser, callType = 'video') => {
    try {
      console.log('Starting call to', targetUser, 'type:', callType)
      const stream = await getMediaStream(callType)
      const pc = createPeerConnection(targetUser)

      stream.getTracks().forEach(track => {
        console.log('Adding track to peer connection (caller):', track.kind, track.label)
        pc.addTrack(track, stream)
      })

      // Create data channel
      dataChannelRef.current = pc.createDataChannel('chat')

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      console.log('Sending offer to', targetUser)
      sendMessage({
        type: 'offer',
        to: targetUser,
        offer: offer,
        callType,
      })
    } catch (error) {
      console.error('Failed to start call:', error)
      throw error
    }
  }, [sendMessage, getMediaStream, createPeerConnection])

  const answerCall = useCallback(async (callData) => {
    try {
      console.log('Answering call from', callData.from, 'type:', callData.callType)
      const stream = await getMediaStream(callData.callType || 'video')
      const pc = createPeerConnection(callData.from)

      stream.getTracks().forEach(track => {
        console.log('Adding track to peer connection (callee):', track.kind, track.label)
        pc.addTrack(track, stream)
      })

      await pc.setRemoteDescription(new RTCSessionDescription(callData.offer))

      // Process pending ICE candidates
      for (const candidate of pendingCandidatesRef.current) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate))
      }
      pendingCandidatesRef.current = []

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      console.log('Sending answer to', callData.from)
      sendMessage({
        type: 'answer',
        to: callData.from,
        answer: answer,
      })
    } catch (error) {
      console.error('Failed to answer call:', error)
      throw error
    }
  }, [sendMessage, getMediaStream, createPeerConnection])

  const handleAnswer = useCallback(async (data) => {
    console.log('Received answer from', data.from)
    const pc = peerConnectionRef.current
    if (pc) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer))
        console.log('Remote description set, processing', pendingCandidatesRef.current.length, 'pending ICE candidates')
        
        // Process pending ICE candidates
        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate))
        }
        pendingCandidatesRef.current = []
      } catch (error) {
        console.error('Failed to handle answer:', error)
      }
    } else {
      console.warn('No peer connection when handling answer')
    }
  }, [])

  const handleIceCandidate = useCallback(async (data) => {
    const pc = peerConnectionRef.current
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.ice))
      } catch (error) {
        console.error('Failed to add ICE candidate:', error)
      }
    } else {
      pendingCandidatesRef.current.push(data.ice)
    }
  }, [])

  const endCall = useCallback(() => {
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop())
      setLocalStream(null)
    }
    
    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }
    
    setRemoteStream(null)
    setIsMuted(false)
    setIsVideoOff(false)
    pendingCandidatesRef.current = []
  }, [localStream])

  const toggleMute = useCallback(() => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setIsMuted(!audioTrack.enabled)
      }
    }
  }, [localStream])

  const toggleVideo = useCallback(async () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0]
      
      if (videoTrack) {
        // Has video track - toggle it
        videoTrack.enabled = !videoTrack.enabled
        setIsVideoOff(!videoTrack.enabled)
        
        // Notify remote peer
        if (targetPeer) {
          sendMessage({
            type: 'video-toggle',
            to: targetPeer,
            enabled: videoTrack.enabled,
          })
        }
      } else {
        // No video track (audio-only call) - add video
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user' }
          })
          const newVideoTrack = videoStream.getVideoTracks()[0]
          
          // Add to local stream
          localStream.addTrack(newVideoTrack)
          
          // Add to peer connection
          const pc = peerConnectionRef.current
          if (pc) {
            pc.addTrack(newVideoTrack, localStream)
            
            // Renegotiate
            const offer = await pc.createOffer()
            await pc.setLocalDescription(offer)
            
            if (targetPeer) {
              sendMessage({
                type: 'offer',
                to: targetPeer,
                offer: offer,
                callType: 'video',
                isUpgrade: true,
              })
            }
          }
          
          setIsVideoOff(false)
          
          // Notify remote peer
          if (targetPeer) {
            sendMessage({
              type: 'video-toggle',
              to: targetPeer,
              enabled: true,
            })
          }
        } catch (error) {
          console.error('Failed to add video:', error)
        }
      }
    }
  }, [localStream, sendMessage, targetPeer])

  return {
    localStream,
    remoteStream,
    startCall,
    answerCall,
    endCall,
    toggleMute,
    toggleVideo,
    isMuted,
    isVideoOff,
    handleAnswer,
    handleIceCandidate,
  }
}

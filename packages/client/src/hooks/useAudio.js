import { useRef, useCallback } from 'react'
import dialtone1 from '../assets/dialtone1.mp3'
import dialtone3 from '../assets/dialtone3.mp3'
import ringtone from '../assets/ringtone5.mp3'
import notification from '../assets/sms1.mp3'
import call_rejected_tone from '../assets/call_rejected_tone.mp3'

// Detect if device is mobile
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)

export function useAudio() {
  const dialToneRef = useRef(null)
  const ringtoneRef = useRef(null)
  const notificationRef = useRef(null)
  const rejectedToneRef = useRef(null)

  // Initialize audio elements lazily
  const getDialTone = useCallback(() => {
    if (!dialToneRef.current) {
      // Desktop uses dialtone1, Mobile uses dialtone3
      const dialtoneSrc = isMobile ? dialtone3 : dialtone1
      dialToneRef.current = new Audio(dialtoneSrc)
      dialToneRef.current.loop = true
    }
    return dialToneRef.current
  }, [])

  const getRingtone = useCallback(() => {
    if (!ringtoneRef.current) {
      ringtoneRef.current = new Audio(ringtone)
      ringtoneRef.current.loop = true
    }
    return ringtoneRef.current
  }, [])

  const getNotification = useCallback(() => {
    if (!notificationRef.current) {
      notificationRef.current = new Audio(notification)
      notificationRef.current.loop = false
    }
    return notificationRef.current
  }, [])

  const getCallRejectedtone = useCallback (() => {
    if (!rejectedToneRef.current) {
      rejectedToneRef.current = new Audio(call_rejected_tone)
      rejectedToneRef.current.loop = false
    }
    return rejectedToneRef.current
  }, []) 

  const playDialTone = useCallback(() => {
    const audio = getDialTone()
    audio.currentTime = 0
    audio.play().catch(err => console.log('Could not play dial tone:', err))
  }, [getDialTone])

  const stopDialTone = useCallback(() => {
    const audio = dialToneRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
  }, [])

  const playRingtone = useCallback(() => {
    const audio = getRingtone()
    audio.currentTime = 0
    audio.play().catch(err => console.log('Could not play ringtone:', err))
  }, [getRingtone])

  const stopRingtone = useCallback(() => {
    const audio = ringtoneRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
  }, [])

  const playNotification = useCallback(() => {
    const audio = getNotification()
    audio.currentTime = 0
    audio.play().catch(err => console.log('Could not play notification:', err))
  }, [getNotification])

  const playCallRejectedtone = useCallback(() => {
    const audio = getCallRejectedtone()
    audio.currentTime = 0
    audio.play().catch(err => console.log('Could not play call rejected tone:', err))
  }, [getCallRejectedtone])

  const stopAll = useCallback(() => {
    stopDialTone()
    stopRingtone()

  }, [stopDialTone, stopRingtone])

  return {
    playDialTone,
    stopDialTone,
    playRingtone,
    stopRingtone,
    playNotification,
    playCallRejectedtone,
    stopAll,
  }
}

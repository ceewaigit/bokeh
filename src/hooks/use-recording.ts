"use client"

import { useEffect } from 'react'
import { useRecordingSessionStore } from '@/stores/recording-session-store'
import { useTimer } from './use-timer'
import { useRecordingLifecycle } from './use-recording-lifecycle'

export function useRecording() {
  const {
    isRecording,
    isPaused,
    setDuration,
  } = useRecordingSessionStore()

  // Use the simplified timer hook
  const timer = useTimer((elapsedMs) => {
    setDuration(elapsedMs)
  })

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      timer.stop()
    }
  }, [])

  const lifecycle = useRecordingLifecycle({
    onDurationUpdate: setDuration,
    onTimerStart: (start) => timer.start(start),
    onTimerStop: () => timer.stop(),
    onTimerPause: () => timer.pause(),
    onTimerResume: () => timer.resume()
  })

  return {
    ...lifecycle,
    isRecording,
    isPaused,
    screenRecorder: lifecycle.screenRecorder,
    isSupported: typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function',
    duration: 0 // Duration is managed by the store, this is kept for compatibility if needed or removed
  }
}

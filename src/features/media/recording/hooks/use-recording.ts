"use client"

import { useRef, useCallback, useEffect, useState } from 'react'
import { RecordingService } from '@/features/media/recording'
import { useRecordingSessionStore } from '@/features/media/recording/store/session-store'
import { useProjectStore } from '@/features/core/stores/project-store'
import { logger } from '@/shared/utils/logger'
import { RecordingError, RecordingErrorCode, PermissionError, ElectronError } from '@/shared/errors'
import { buildRecordingSettings } from '@/features/media/recording/logic/settings-builder'
import { DEFAULT_PROJECT_SETTINGS } from '@/features/core/settings/defaults'
import { useTimer } from '@/features/ui/timeline/hooks/use-timeline-timer'
import { saveRecordingResult } from '@/features/media/recording/services/recording-save-service'

export function useRecording() {
  const recorderRef = useRef<RecordingService | null>(null)
  const [isStartingRecording, setIsStartingRecording] = useState(false)

  const {
    isRecording,
    isPaused,
    setRecording,
    setPaused,
    setDuration,
  } = useRecordingSessionStore()

  // Use the simplified timer hook
  const timer = useTimer((elapsedMs) => {
    setDuration(elapsedMs)
  })

  // Initialize recorder
  useEffect(() => {
    if (!recorderRef.current) {
      try {
        recorderRef.current = new RecordingService()
        logger.info('Recording service initialized')
      } catch (error) {
        logger.error('Failed to initialize recording service:', error)
        recorderRef.current = null
      }
    }
  }, [])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      timer.stop()
    }
  }, [timer])

  // Error handling
  const handleRecordingError = useCallback((error: unknown) => {
    logger.error('Recording error:', error)

    let userMessage = 'Failed to start recording'

    if (error instanceof PermissionError) {
      switch (error.code) {
        case RecordingErrorCode.PERMISSION_WAITING:
          userMessage = `⏳ Waiting for Permission\n\n${error.message}`
          break
        case RecordingErrorCode.PERMISSION_TIMEOUT:
          userMessage = `⏱️ Permission Timeout\n\n${error.message}`
          break
        default:
          userMessage = `🔓 Screen Recording Permission\n\n${error.message}`
      }
    } else if (error instanceof ElectronError) {
      userMessage = 'Recording Not Available\n\nBokeh cannot record itself directly. Please use "Record Area" or "Record Window" to capture specific content.'
    } else if (error instanceof RecordingError) {
      userMessage = `Recording Error: ${error.message}`
    } else if (error instanceof Error) {
      userMessage = `Failed to start recording: ${error.message}`
    }

    alert(userMessage)
  }, [])

  const startRecording = useCallback(async () => {
    if (!recorderRef.current || isRecording || isStartingRecording) {
      if (isRecording) {
        logger.debug('Recording already in progress')
      }
      if (isStartingRecording) {
        logger.debug('Recording is starting, please wait')
      }
      return
    }

    setIsStartingRecording(true)

    try {
      // Get settings from both stores
      const sessionSettings = useRecordingSessionStore.getState().settings
      const project = useProjectStore.getState().currentProject
      const uiSettings = useProjectStore.getState().settings
      const projectSettings = project?.settings ?? DEFAULT_PROJECT_SETTINGS

      const recordingSettings = buildRecordingSettings(sessionSettings, projectSettings, uiSettings)

      // Start recording - wait for native module confirmation
      await recorderRef.current.start(recordingSettings)

      // Only update UI state AFTER native module confirms recording started
      setRecording(true)
      setDuration(0)
      timer.start(0)

      // Mark recording as globally active
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = true
      }

      logger.info('Recording started successfully')

    } catch (error) {
      handleRecordingError(error)
      // Clear global recording flag on error
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = false
      }
    } finally {
      setIsStartingRecording(false)
    }
  }, [isRecording, isStartingRecording, setRecording, handleRecordingError, setDuration, timer])

  const stopRecording = useCallback(async () => {
    logger.debug('useRecording.stopRecording called')

    // Check store state first to prevent double-stops
    const currentState = useRecordingSessionStore.getState()
    if (!currentState.isRecording) {
      logger.debug('useRecording: Not currently recording according to store - ignoring stop call')
      return null
    }

    const recorder = recorderRef.current
    if (!recorder?.isRecording()) {
      logger.debug('useRecording: Recorder not in recording state - ignoring stop call')
      return null
    }

    try {
      logger.info('Stopping recording...')

      // Immediately update state to prevent double-stops
      setRecording(false)

      timer.stop()

      // Stop recording and get result
      const result = await recorder.stop()
      if (!result || !result.videoPath) {
        throw new Error('Invalid recording result')
      }

      logger.info(`Recording complete: ${result.duration}ms, path: ${result.videoPath}, ${result.metadata.length} events`)

      // Reset remaining state
      setPaused(false)

      // Clear global recording state
      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = false
      }

      // Save recording and update project store
      await saveRecordingResult(result)

      return result
    } catch (error) {
      logger.error('Failed to stop recording:', error)

      // Reset state on error - ensure complete cleanup
      timer.stop()
      setDuration(0)
      setRecording(false)
      setPaused(false)

      if (typeof window !== 'undefined') {
        (window as any).__screenRecorderActive = false
      }

      return null
    }
  }, [setRecording, setPaused, setDuration, timer])

  const pauseRecording = useCallback(() => {
    if (recorderRef.current && isRecording && !isPaused) {
      if (!recorderRef.current.canPause()) {
        logger.warn('Current recorder does not support pause')
        return
      }

      try {
        recorderRef.current.pause()
        setPaused(true)
        timer.pause()
        logger.info('Recording paused')
      } catch (error) {
        logger.error('Failed to pause recording:', error)
      }
    }
  }, [isRecording, isPaused, setPaused, timer])

  const resumeRecording = useCallback(() => {
    if (recorderRef.current && isPaused && isRecording) {
      if (!recorderRef.current.canResume()) {
        logger.warn('Current recorder does not support resume')
        return
      }

      try {
        recorderRef.current.resume()
        setPaused(false)
        timer.resume()
        logger.info('Recording resumed')
      } catch (error) {
        logger.error('Failed to resume recording:', error)
        setPaused(true)
      }
    }
  }, [isPaused, isRecording, setPaused, timer])

  const canPause = useCallback(() => {
    return recorderRef.current?.canPause() ?? false
  }, [])

  const canResume = useCallback(() => {
    return recorderRef.current?.canResume() ?? false
  }, [])

  // Toggle webcam capture on/off (creates segments)
  const toggleWebcamCapture = useCallback(async () => {
    if (!recorderRef.current || !isRecording) return
    try {
      await recorderRef.current.toggleWebcamCapture()
      logger.info(`Webcam toggled ${recorderRef.current.isWebcamToggledOff() ? 'OFF' : 'ON'}`)
    } catch (error) {
      logger.error('Failed to toggle webcam:', error)
    }
  }, [isRecording])

  // Toggle microphone capture on/off (creates segments)
  const toggleMicrophoneCapture = useCallback(async () => {
    if (!recorderRef.current || !isRecording) return
    try {
      await recorderRef.current.toggleMicrophoneCapture()
      logger.info(`Microphone toggled ${recorderRef.current.isMicrophoneToggledOff() ? 'OFF' : 'ON'}`)
    } catch (error) {
      logger.error('Failed to toggle microphone:', error)
    }
  }, [isRecording])

  // Check toggle states
  const isWebcamToggledOff = useCallback(() => {
    return recorderRef.current?.isWebcamToggledOff() ?? false
  }, [])

  const isMicrophoneToggledOff = useCallback(() => {
    return recorderRef.current?.isMicrophoneToggledOff() ?? false
  }, [])

  // Check if toggles are available
  const canToggleWebcam = useCallback(() => {
    return recorderRef.current?.canToggleWebcam() ?? false
  }, [])

  const canToggleMicrophone = useCallback(() => {
    return recorderRef.current?.canToggleMicrophone() ?? false
  }, [])

  // Check if services are recording
  const isWebcamRecording = useCallback(() => {
    return recorderRef.current?.isWebcamRecording() ?? false
  }, [])

  const isMicrophoneRecording = useCallback(() => {
    return recorderRef.current?.isMicrophoneRecording() ?? false
  }, [])

  return {
    // Core controls
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    canPause,
    canResume,

    // State - Note: Most state is in useRecordingSessionStore for reactivity
    isStartingRecording,

    // Webcam capture toggle (creates segments during recording)
    webcam: {
      toggle: toggleWebcamCapture,
      isToggledOff: isWebcamToggledOff,
      canToggle: canToggleWebcam,
      isRecording: isWebcamRecording,
    },

    // Microphone capture toggle (creates segments during recording)
    microphone: {
      toggle: toggleMicrophoneCapture,
      isToggledOff: isMicrophoneToggledOff,
      canToggle: canToggleMicrophone,
      isRecording: isMicrophoneRecording,
    },
  }
}

"use client"

import { useRef, useCallback, useEffect, useState } from 'react'
import { ElectronRecorder } from '@/features/media/recording'
import { useRecordingSessionStore } from '@/features/media/recording/store/session-store'
import { useProjectStore } from '@/features/core/stores/project-store'
import { ProjectStorage } from '@/features/core/storage/project-storage'
import { logger } from '@/shared/utils/logger'
import { RecordingError, RecordingErrorCode, PermissionError, ElectronError } from '@/shared/errors'
import { buildRecordingSettings } from '@/features/media/recording/logic/settings-builder'
import { DEFAULT_PROJECT_SETTINGS } from '@/features/core/settings/defaults'
import { useTimer } from '@/features/ui/timeline/hooks/use-timeline-timer'

export function useRecording() {
  const recorderRef = useRef<ElectronRecorder | null>(null)
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
        recorderRef.current = new ElectronRecorder()
        logger.info('Screen recorder initialized')
      } catch (error) {
        logger.error('Failed to initialize screen recorder:', error)
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
      await recorderRef.current.startRecording(recordingSettings)

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
    if (!recorder?.isCurrentlyRecording()) {
      logger.debug('useRecording: Recorder not in recording state - ignoring stop call')
      return null
    }

    try {
      logger.info('Stopping recording...')

      // Immediately update state to prevent double-stops
      setRecording(false)

      timer.stop()

      // Stop recording and get result
      const result = await recorder.stopRecording()
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

      // Use consolidated project saving
      if (result.videoPath) {
        // Create a safe filename without slashes or colons
        const now = new Date()
        const year = now.getFullYear()
        const month = String(now.getMonth() + 1).padStart(2, '0')
        const day = String(now.getDate()).padStart(2, '0')
        const hours = String(now.getHours()).padStart(2, '0')
        const minutes = String(now.getMinutes()).padStart(2, '0')
        const seconds = String(now.getSeconds()).padStart(2, '0')
        const projectName = `Recording_${year}-${month}-${day}_${hours}-${minutes}-${seconds}`

        // Save recording with project using consolidated function
        const saved = await ProjectStorage.saveRecordingWithProject(
          result.videoPath,
          result.metadata,
          projectName,
          result.captureArea,
          result.hasAudio,
          result.duration,
          result.webcam,
          result.microphoneAudio
        )

        if (saved) {
          logger.info(`Recording saved: video=${saved.videoPath}, project=${saved.projectPath}`)

          // Update the project store
          const projectStore = useProjectStore.getState()
          // Always set the full project since it was saved to disk
          projectStore.setProject(saved.project)

          // Create video URL from file path for preview
          const recordingId = saved.project.recordings[0].id
          if (window.electronAPI?.getVideoUrl) {
            const videoUrl = await window.electronAPI.getVideoUrl(result.videoPath)
            if (videoUrl) {
              ProjectStorage.setBlobUrl(recordingId, videoUrl)
            }
          }

          // Cache webcam video URLs if present (supports multiple segments)
          const webcamRecordings = saved.project.recordings.filter(r => r.id.startsWith('webcam-'))
          for (const webcamRecording of webcamRecordings) {
            if (webcamRecording.folderPath && webcamRecording.filePath && window.electronAPI?.getVideoUrl) {
              const webcamPath = `${webcamRecording.folderPath}/${webcamRecording.filePath.split('/').pop()}`
              const webcamUrl = await window.electronAPI.getVideoUrl(webcamPath)
              if (webcamUrl) {
                ProjectStorage.setBlobUrl(webcamRecording.id, webcamUrl)
              }
            }
          }

          // Cache microphone audio URL if present
          if (saved.audioPath) {
            const audioRecording = saved.project.recordings.find(r => r.id.startsWith('audio-'))
            if (audioRecording && window.electronAPI?.getVideoUrl) {
              const audioUrl = await window.electronAPI.getVideoUrl(saved.audioPath)
              if (audioUrl) {
                ProjectStorage.setBlobUrl(audioRecording.id, audioUrl)
              }
            }
          }
        }
      }

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
        recorderRef.current.pauseRecording()
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
        recorderRef.current.resumeRecording()
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

  // Independent webcam pause/resume (creates segments)
  const pauseWebcam = useCallback(async () => {
    if (!recorderRef.current || !isRecording) return
    try {
      await recorderRef.current.pauseWebcam()
      logger.info('Webcam paused independently')
    } catch (error) {
      logger.error('Failed to pause webcam:', error)
    }
  }, [isRecording])

  const resumeWebcam = useCallback(async () => {
    if (!recorderRef.current || !isRecording) return
    try {
      await recorderRef.current.resumeWebcam()
      logger.info('Webcam resumed as new segment')
    } catch (error) {
      logger.error('Failed to resume webcam:', error)
    }
  }, [isRecording])

  const isWebcamPaused = useCallback(() => {
    return recorderRef.current?.isWebcamPaused() ?? false
  }, [])

  const isWebcamRecording = useCallback(() => {
    return recorderRef.current?.isWebcamRecording() ?? false
  }, [])

  // Independent microphone pause/resume
  const pauseMicrophone = useCallback(() => {
    if (!recorderRef.current || !isRecording) return
    try {
      recorderRef.current.pauseMicrophone()
      logger.info('Microphone paused independently')
    } catch (error) {
      logger.error('Failed to pause microphone:', error)
    }
  }, [isRecording])

  const resumeMicrophone = useCallback(() => {
    if (!recorderRef.current || !isRecording) return
    try {
      recorderRef.current.resumeMicrophone()
      logger.info('Microphone resumed')
    } catch (error) {
      logger.error('Failed to resume microphone:', error)
    }
  }, [isRecording])

  const isMicrophonePaused = useCallback(() => {
    return recorderRef.current?.isMicrophonePaused() ?? false
  }, [])

  const isMicrophoneRecording = useCallback(() => {
    return recorderRef.current?.isMicrophoneRecording() ?? false
  }, [])

  return {
    startRecording,
    stopRecording,
    pauseRecording,
    resumeRecording,
    canPause,
    canResume,
    // Independent webcam controls
    pauseWebcam,
    resumeWebcam,
    isWebcamPaused,
    isWebcamRecording,
    // Independent microphone controls
    pauseMicrophone,
    resumeMicrophone,
    isMicrophonePaused,
    isMicrophoneRecording,
    // Legacy
    screenRecorder: recorderRef.current,
    isRecording,
    isPaused,
    isStartingRecording,
    isSupported: typeof navigator !== 'undefined' &&
      typeof navigator.mediaDevices !== 'undefined' &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function',
    duration: 0 // Duration is managed by the store, this is kept for compatibility if needed or removed
  }
}

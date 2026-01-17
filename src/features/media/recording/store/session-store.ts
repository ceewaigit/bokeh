import { create } from 'zustand'
import type { RecordingState, SessionSettings } from '@/types'
import { RecordingArea, AudioInput } from '@/types'
import { useProjectStore } from '@/features/core/stores/project-store'
import { logger } from '@/shared/utils/logger'
import { StreamWarmer, PrewarmedStreams } from '../services/stream-warmer'

/**
 * Device settings for optional stream pre-warming during countdown.
 * Pre-warming provides ~100-300ms faster recording start but adds complexity.
 * The 3-second countdown is usually sufficient for stream acquisition.
 */
export interface CountdownDeviceSettings {
  enablePrewarming?: boolean // Default: false - opt-in optimization
  webcam: {
    enabled: boolean
    deviceId?: string
    resolution?: '720p' | '1080p' | '4k'
  }
  microphone: {
    enabled: boolean
    deviceId?: string
    echoCancellation?: boolean
    noiseSuppression?: boolean
  }
}

interface RecordingStore extends RecordingState {
  settings: SessionSettings
  countdownActive: boolean
  countdownValue: number // Current countdown value (3, 2, 1, 0)
  selectedDisplayId?: number

  // Core state setters
  setRecording: (isRecording: boolean) => void
  setPaused: (isPaused: boolean) => void
  setDuration: (duration: number) => void

  // Settings management
  updateSettings: (settings: Partial<SessionSettings>) => void

  // Countdown management with stream pre-warming
  startCountdown: (onComplete: () => void, displayId?: number, deviceSettings?: CountdownDeviceSettings) => void
  abortCountdown: () => Promise<void> // Cancel countdown and restore dock

  // Pre-warmed streams access
  getPrewarmedStreams: () => PrewarmedStreams | null
  clearPrewarmedStreams: () => void

  // Recording workflow
  prepareRecording: (sourceId: string, displayId?: number) => void

  // Recovery - sync state from main process
  syncFromMain: () => Promise<void>

  // Reset
  reset: () => void
}

const defaultSettings: SessionSettings = {
  area: RecordingArea.Fullscreen,
  audioInput: AudioInput.System,
  sourceId: undefined
}

let countdownInterval: NodeJS.Timeout | null = null
let streamWarmer: StreamWarmer | null = null

const clearCountdownInterval = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
}

const releaseStreamWarmer = () => {
  if (streamWarmer) {
    streamWarmer.releaseAll()
    streamWarmer = null
  }
}

/**
 * Clean up any active countdown interval.
 * Call this from component cleanup to prevent interval leaks.
 */
export const cleanupCountdownInterval = clearCountdownInterval

export const useRecordingSessionStore = create<RecordingStore>((set, get) => ({
  isRecording: false,
  isPaused: false,
  duration: 0,
  settings: defaultSettings,
  countdownActive: false,
  countdownValue: 0,
  selectedDisplayId: undefined,

  setRecording: (isRecording) => set({ isRecording }),

  setPaused: (isPaused) => set({ isPaused }),

  setDuration: (duration) => set({ duration }),

  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings }
    })),

  startCountdown: (onComplete, displayId, deviceSettings) => {
    clearCountdownInterval()
    releaseStreamWarmer() // Clean up any previous warmer
    let count = 3
    set({ countdownActive: true, countdownValue: count })

    logger.debug('[session-store] Starting countdown', { displayId, enablePrewarming: deviceSettings?.enablePrewarming })

    // Optional pre-warming optimization (opt-in via enablePrewarming flag)
    // The 3-second countdown is usually sufficient for stream acquisition
    if (deviceSettings?.enablePrewarming) {
      streamWarmer = new StreamWarmer()
      const resolutions = { '720p': { width: 1280, height: 720 }, '1080p': { width: 1920, height: 1080 }, '4k': { width: 3840, height: 2160 } }

      if (deviceSettings.webcam.enabled && deviceSettings.webcam.deviceId) {
        const dims = resolutions[deviceSettings.webcam.resolution ?? '1080p']
        void streamWarmer.warmWebcam({ deviceId: deviceSettings.webcam.deviceId, width: dims.width, height: dims.height })
      }
      if (deviceSettings.microphone.enabled && deviceSettings.microphone.deviceId) {
        void streamWarmer.warmMicrophone({ deviceId: deviceSettings.microphone.deviceId, echoCancellation: deviceSettings.microphone.echoCancellation, noiseSuppression: deviceSettings.microphone.noiseSuppression })
      }
    }

    // Hide the dock during countdown for cleaner experience
    // Start interval AFTER async sequence completes to ensure proper timing
    const startCountdownSequence = async () => {
      try {
        await window.electronAPI?.minimizeRecordButton?.()
        await window.electronAPI?.showCountdown?.(count, displayId)

        // Start interval only after dock is minimized and countdown is shown
        countdownInterval = setInterval(async () => {
          // Check if we were aborted - capture state at start of tick
          if (!get().countdownActive) {
            clearCountdownInterval()
            return
          }

          count--
          set({ countdownValue: count })

          if (count <= 0) {
            clearCountdownInterval()
            set({ countdownActive: false, countdownValue: 0 })

            try {
              // Hide countdown and show dock again
              await window.electronAPI?.hideCountdown?.()

              // Re-check abort state after await (prevents race with abortCountdown)
              if (!get().countdownActive && count > 0) {
                logger.debug('[session-store] Countdown was aborted during completion')
                return
              }

              // If recording self, keep workspace open. Otherwise show dock.
              const includeAppWindows = useProjectStore.getState().settings.recording?.includeAppWindows ?? false
              await window.electronAPI?.showRecordButton?.({ hideMainWindow: includeAppWindows ? false : undefined })

              logger.debug('[session-store] Countdown complete, calling onComplete')
              onComplete()
            } catch (error) {
              logger.error('[session-store] Error completing countdown:', error)
              // Still try to show the dock on error
              window.electronAPI?.showRecordButton?.()
            }
          } else {
            // Re-check abort state before updating display (prevents race with abortCountdown)
            if (!get().countdownActive) {
              logger.debug('[session-store] Countdown was aborted, skipping display update')
              return
            }

            // Update countdown display on the correct monitor
            try {
              await window.electronAPI?.showCountdown?.(count, displayId)
            } catch (error) {
              logger.error('[session-store] Failed to update countdown:', error)
            }
          }
        }, 1000)
      } catch (error) {
        logger.error('[session-store] Failed to start countdown sequence:', error)
        // Abort on error - restore dock
        get().abortCountdown()
      }
    }

    void startCountdownSequence()
  },

  abortCountdown: async () => {
    logger.debug('[session-store] Aborting countdown')
    clearCountdownInterval()
    releaseStreamWarmer() // Release pre-warmed streams on abort

    const wasActive = get().countdownActive
    set({ countdownActive: false, countdownValue: 0 })

    if (wasActive) {
      try {
        // Hide countdown window and restore dock
        await window.electronAPI?.hideCountdown?.()
        await window.electronAPI?.showRecordButton?.()
        logger.debug('[session-store] Countdown aborted, dock restored')
      } catch (error) {
        logger.error('[session-store] Error during countdown abort:', error)
      }
    }
  },

  getPrewarmedStreams: () => {
    return streamWarmer?.getPrewarmedStreams() ?? null
  },

  clearPrewarmedStreams: () => {
    if (streamWarmer) {
      // Hand off streams (don't stop tracks - recording services will use them)
      streamWarmer.handOff()
      streamWarmer = null
    }
  },

  prepareRecording: (sourceId, displayId) => {
    const { updateSettings } = get()

    // Store the selected display ID
    set({ selectedDisplayId: displayId })

    // Determine recording area based on source ID
    if (sourceId.startsWith('area:')) {
      updateSettings({ area: RecordingArea.Region, sourceId })
    } else if (sourceId.startsWith('screen:')) {
      updateSettings({ area: RecordingArea.Fullscreen, sourceId })
    } else {
      updateSettings({ area: RecordingArea.Window, sourceId })
    }

    logger.debug('Recording prepared with source:', sourceId, 'displayId:', displayId)
  },

  syncFromMain: async () => {
    // Sync recording state from main process
    // This is called on dock mount to recover from any stuck state
    try {
      const isMainRecording = await window.electronAPI?.nativeRecorder?.isRecording?.()
      const currentState = get()

      logger.debug('[session-store] Syncing from main:', { isMainRecording, currentState: { isRecording: currentState.isRecording, countdownActive: currentState.countdownActive } })

      // If main says not recording but we think we are (or countdown active), reset
      if (!isMainRecording && (currentState.isRecording || currentState.countdownActive)) {
        logger.warn('[session-store] State desync detected - resetting to match main process')
        clearCountdownInterval()
        set({
          isRecording: false,
          isPaused: false,
          countdownActive: false,
          countdownValue: 0
        })
        // Ensure dock is visible
        await window.electronAPI?.hideCountdown?.()
        await window.electronAPI?.showRecordButton?.()
      }
    } catch (error) {
      logger.error('[session-store] Failed to sync from main:', error)
    }
  },

  reset: () => {
    clearCountdownInterval()
    releaseStreamWarmer()
    set({
      isRecording: false,
      isPaused: false,
      duration: 0,
      settings: defaultSettings,
      countdownActive: false,
      countdownValue: 0,
      selectedDisplayId: undefined
    })
  }
}))

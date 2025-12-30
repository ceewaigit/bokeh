import { create } from 'zustand'
import type { RecordingState, SessionSettings } from '@/types'
import { RecordingArea, AudioInput } from '@/types'
import { useProjectStore } from './project-store'
import { logger } from '@/shared/utils/logger'

interface RecordingStore extends RecordingState {
  settings: SessionSettings
  countdownActive: boolean
  selectedDisplayId?: number

  // Core state setters
  setRecording: (isRecording: boolean) => void
  setPaused: (isPaused: boolean) => void
  setDuration: (duration: number) => void

  // Settings management
  updateSettings: (settings: Partial<SessionSettings>) => void

  // Countdown management
  startCountdown: (onComplete: () => void, displayId?: number) => void

  // Recording workflow
  prepareRecording: (sourceId: string, displayId?: number) => void

  // Reset
  reset: () => void
}

const defaultSettings: SessionSettings = {
  area: RecordingArea.Fullscreen,
  audioInput: AudioInput.System,
  sourceId: undefined
}

let countdownInterval: NodeJS.Timeout | null = null

const clearCountdownInterval = () => {
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
}

export const useRecordingSessionStore = create<RecordingStore>((set, get) => ({
  isRecording: false,
  isPaused: false,
  duration: 0,
  settings: defaultSettings,
  countdownActive: false,
  selectedDisplayId: undefined,

  setRecording: (isRecording) =>
    set(() => ({
      isRecording
    })),

  setPaused: (isPaused) =>
    set(() => ({
      isPaused
    })),

  setDuration: (duration) => set({ duration }),



  updateSettings: (newSettings) =>
    set((state) => ({
      settings: { ...state.settings, ...newSettings }
    })),


  startCountdown: (onComplete, displayId) => {
    clearCountdownInterval()
    set({ countdownActive: true })
    let count = 3

    // Hide the dock during countdown for cleaner experience
    window.electronAPI?.minimizeRecordButton?.()
    // Pass displayId to show countdown on the correct monitor
    window.electronAPI?.showCountdown?.(count, displayId)

    countdownInterval = setInterval(() => {
      count--

      if (count <= 0) {
        clearCountdownInterval()
        set({ countdownActive: false })

        // Hide countdown and show dock again
        window.electronAPI?.hideCountdown?.()

        // If recording self, keep workspace open. Otherwise show dock.
        const includeAppWindows = useProjectStore.getState().settings.recording?.includeAppWindows ?? false
        window.electronAPI?.showRecordButton?.({ hideMainWindow: includeAppWindows ? false : undefined })
        onComplete()
      } else {
        // Update countdown display on the correct monitor
        window.electronAPI?.showCountdown?.(count, displayId)
      }
    }, 1000)
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

  reset: () => {
    clearCountdownInterval()
    set({
      isRecording: false,
      isPaused: false,
      duration: 0,
      settings: defaultSettings,
      countdownActive: false,
      selectedDisplayId: undefined
    })
  }
}))

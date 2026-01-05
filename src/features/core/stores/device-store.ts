/**
 * Device Store
 *
 * Manages media device state (webcams, microphones) and user preferences.
 * Permissions are handled separately by usePermissions hook.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import type { MediaDeviceInfo, DeviceState } from '@/features/media/recording/services/device-manager'
import { getDeviceManager } from '@/features/media/recording/services/device-manager'
import { logger } from '@/shared/utils/logger'

export interface DeviceSettings {
  webcam: {
    enabled: boolean
    deviceId: string | null
    resolution: '720p' | '1080p' | '4k'
  }
  microphone: {
    enabled: boolean
    deviceId: string | null
    echoCancellation: boolean
    noiseSuppression: boolean
    autoGainControl: boolean
  }
}

interface DeviceStoreState {
  webcams: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  speakers: MediaDeviceInfo[]
  settings: DeviceSettings
  isPreviewActive: boolean
  isInitialized: boolean
  isLoading: boolean
  error: string | null
}

interface DeviceStoreActions {
  initialize: () => Promise<void>
  refreshDevices: () => Promise<void>
  setDevices: (state: DeviceState) => void
  selectWebcam: (deviceId: string | null) => void
  selectMicrophone: (deviceId: string | null) => void
  toggleWebcam: (enabled?: boolean) => void
  toggleMicrophone: (enabled?: boolean) => void
  setWebcamResolution: (resolution: '720p' | '1080p' | '4k') => void
  setMicrophoneSettings: (settings: Partial<DeviceSettings['microphone']>) => void
  startPreview: (deviceId?: string) => Promise<MediaStream | null>
  stopPreview: () => void
  cleanup: () => void
}

type DeviceStore = DeviceStoreState & DeviceStoreActions

const DEFAULT_SETTINGS: DeviceSettings = {
  webcam: {
    enabled: false,
    deviceId: null,
    resolution: '1080p'
  },
  microphone: {
    enabled: false,
    deviceId: null,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
}

export const useDeviceStore = create<DeviceStore>()(
  persist(
    immer((set, get) => ({
      webcams: [],
      microphones: [],
      speakers: [],
      settings: DEFAULT_SETTINGS,
      isPreviewActive: false,
      isInitialized: false,
      isLoading: false,
      error: null,

      initialize: async () => {
        if (get().isInitialized) return

        set(state => {
          state.isLoading = true
          state.error = null
        })

        try {
          const manager = getDeviceManager()
          await manager.initialize()

          manager.onDevicesChanged((deviceState) => {
            get().setDevices(deviceState)
          })

          const deviceState = manager.getDeviceState()
          get().setDevices(deviceState)

          // Auto-select defaults if none selected
          const currentSettings = get().settings
          if (!currentSettings.webcam.deviceId && deviceState.webcams.length > 0) {
            set(state => {
              state.settings.webcam.deviceId = deviceState.webcams[0].deviceId
            })
          }
          if (!currentSettings.microphone.deviceId && deviceState.microphones.length > 0) {
            const defaultMic = deviceState.microphones.find(m => m.deviceId === 'default') ?? deviceState.microphones[0]
            set(state => {
              state.settings.microphone.deviceId = defaultMic.deviceId
            })
          }

          set(state => {
            state.isInitialized = true
            state.isLoading = false
          })

          logger.info('[DeviceStore] Initialized')
        } catch (error) {
          set(state => {
            state.error = error instanceof Error ? error.message : 'Failed to initialize devices'
            state.isLoading = false
          })
          logger.error('[DeviceStore] Initialization failed:', error)
        }
      },

      refreshDevices: async () => {
        set(state => { state.isLoading = true })
        try {
          const manager = getDeviceManager()
          await manager.enumerateDevices()
        } finally {
          set(state => { state.isLoading = false })
        }
      },

      setDevices: (deviceState: DeviceState) => {
        set(state => {
          state.webcams = deviceState.webcams
          state.microphones = deviceState.microphones
          state.speakers = deviceState.speakers

          // Validate selected devices still exist
          const webcamExists = deviceState.webcams.some(w => w.deviceId === state.settings.webcam.deviceId)
          if (state.settings.webcam.deviceId && !webcamExists) {
            state.settings.webcam.deviceId = deviceState.webcams[0]?.deviceId ?? null
          }

          const micExists = deviceState.microphones.some(m => m.deviceId === state.settings.microphone.deviceId)
          if (state.settings.microphone.deviceId && !micExists) {
            const defaultMic = deviceState.microphones.find(m => m.deviceId === 'default') ?? deviceState.microphones[0]
            state.settings.microphone.deviceId = defaultMic?.deviceId ?? null
          }
        })
      },

      selectWebcam: (deviceId) => {
        set(state => { state.settings.webcam.deviceId = deviceId })
      },

      selectMicrophone: (deviceId) => {
        set(state => { state.settings.microphone.deviceId = deviceId })
      },

      toggleWebcam: (enabled) => {
        set(state => { state.settings.webcam.enabled = enabled ?? !state.settings.webcam.enabled })
      },

      toggleMicrophone: (enabled) => {
        set(state => { state.settings.microphone.enabled = enabled ?? !state.settings.microphone.enabled })
      },

      setWebcamResolution: (resolution) => {
        set(state => { state.settings.webcam.resolution = resolution })
      },

      setMicrophoneSettings: (settings) => {
        set(state => { Object.assign(state.settings.microphone, settings) })
      },

      startPreview: async (deviceId) => {
        const manager = getDeviceManager()
        const targetDeviceId = deviceId ?? get().settings.webcam.deviceId

        if (!targetDeviceId) {
          logger.warn('[DeviceStore] No webcam device selected for preview')
          return null
        }

        try {
          const resolution = get().settings.webcam.resolution
          const dimensions = {
            '720p': { width: 1280, height: 720 },
            '1080p': { width: 1920, height: 1080 },
            '4k': { width: 3840, height: 2160 }
          }[resolution]

          const stream = await manager.startPreview(targetDeviceId, dimensions)
          set(state => { state.isPreviewActive = true })
          return stream
        } catch (error) {
          logger.error('[DeviceStore] Failed to start preview:', error)
          return null
        }
      },

      stopPreview: () => {
        const manager = getDeviceManager()
        manager.stopPreview()
        set(state => { state.isPreviewActive = false })
      },

      cleanup: () => {
        const manager = getDeviceManager()
        manager.destroy()
        set(state => {
          state.isInitialized = false
          state.isPreviewActive = false
        })
      }
    })),
    {
      name: 'bokeh-device-settings',
      partialize: (state) => ({ settings: state.settings })
    }
  )
)

// Simple selectors
export const useWebcamSettings = () => useDeviceStore(state => state.settings.webcam)
export const useMicrophoneSettings = () => useDeviceStore(state => state.settings.microphone)
export const useAvailableWebcams = () => useDeviceStore(state => state.webcams)
export const useAvailableMicrophones = () => useDeviceStore(state => state.microphones)

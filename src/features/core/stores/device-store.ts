/**
 * Device Store
 *
 * Manages media device state (webcams, microphones) and user preferences.
 * Permissions are handled separately by usePermissions hook.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { persist } from 'zustand/middleware'
import { logger } from '@/shared/utils/logger'

export interface MediaDeviceInfo {
  deviceId: string
  label: string
  kind: 'videoinput' | 'audioinput' | 'audiooutput'
  groupId: string
}

export interface DeviceState {
  webcams: MediaDeviceInfo[]
  microphones: MediaDeviceInfo[]
  speakers: MediaDeviceInfo[]
}

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
  previewStream: MediaStream | null
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

// Helper to enumerate devices
const enumerateDevicesInternal = async (): Promise<DeviceState> => {
  if (!navigator.mediaDevices?.enumerateDevices) {
    logger.warn('[DeviceStore] enumerateDevices not supported')
    return { webcams: [], microphones: [], speakers: [] }
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices()

    const webcams = devices
      .filter(d => d.kind === 'videoinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
        kind: d.kind as 'videoinput',
        groupId: d.groupId
      }))

    const microphones = devices
      .filter(d => d.kind === 'audioinput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Microphone ${i + 1}`,
        kind: d.kind as 'audioinput',
        groupId: d.groupId
      }))

    const speakers = devices
      .filter(d => d.kind === 'audiooutput')
      .map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Speaker ${i + 1}`,
        kind: d.kind as 'audiooutput',
        groupId: d.groupId
      }))

    return { webcams, microphones, speakers }
  } catch (error) {
    logger.error('[DeviceStore] Device enumeration failed:', error)
    throw error
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
      previewStream: null,
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
          const deviceState = await enumerateDevicesInternal()
          get().setDevices(deviceState)

          if (navigator.mediaDevices?.addEventListener) {
            navigator.mediaDevices.addEventListener('devicechange', async () => {
              logger.info('[DeviceStore] Device change detected')
              await get().refreshDevices()
            })
          }

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
        try {
          const deviceState = await enumerateDevicesInternal()
          get().setDevices(deviceState)
        } catch (error) {
          logger.error('[DeviceStore] Refresh failed', error)
        }
      },

      setDevices: (deviceState: DeviceState) => {
        set(state => {
          state.webcams = deviceState.webcams
          state.microphones = deviceState.microphones
          state.speakers = deviceState.speakers

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
        get().stopPreview()

        const targetDeviceId = deviceId ?? get().settings.webcam.deviceId
        if (!targetDeviceId) {
          logger.warn('[DeviceStore] No webcam device selected for preview')
          return null
        }

        const resolution = get().settings.webcam.resolution
        const dimensions = {
          '720p': { width: 1280, height: 720 },
          '1080p': { width: 1920, height: 1080 },
          '4k': { width: 3840, height: 2160 }
        }[resolution]

        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: { exact: targetDeviceId },
            width: dimensions?.width ? { ideal: dimensions.width } : { ideal: 1280 },
            height: dimensions?.height ? { ideal: dimensions.height } : { ideal: 720 }
          },
          audio: false
        }

        try {
          const stream = await navigator.mediaDevices.getUserMedia(constraints)
          logger.info('[DeviceStore] Preview started for device:', targetDeviceId)
          
          set(state => { 
            state.isPreviewActive = true
            state.previewStream = stream 
          })
          return stream
        } catch (error) {
          logger.error('[DeviceStore] Failed to start preview:', error)
          return null
        }
      },

      stopPreview: () => {
        const stream = get().previewStream
        if (stream) {
          stream.getTracks().forEach(track => track.stop())
        }
        set(state => { 
          state.isPreviewActive = false 
          state.previewStream = null
        })
      },

      cleanup: () => {
        get().stopPreview()
        set(state => {
          state.isInitialized = false
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

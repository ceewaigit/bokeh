/**
 * Device Manager Service
 *
 * Handles webcam/microphone device enumeration and preview streams.
 * Permissions are handled separately by usePermissions hook.
 */

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

type DeviceChangeCallback = (state: DeviceState) => void

class DeviceManager {
  private static instance: DeviceManager | null = null
  private deviceState: DeviceState = {
    webcams: [],
    microphones: [],
    speakers: []
  }
  private previewStream: MediaStream | null = null
  private listeners: Set<DeviceChangeCallback> = new Set()
  private isInitialized = false

  private constructor() {}

  static getInstance(): DeviceManager {
    if (!DeviceManager.instance) {
      DeviceManager.instance = new DeviceManager()
    }
    return DeviceManager.instance
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return

    try {
      await this.enumerateDevices()

      if (navigator.mediaDevices?.addEventListener) {
        navigator.mediaDevices.addEventListener('devicechange', this.handleDeviceChange)
      }

      this.isInitialized = true
      logger.info('[DeviceManager] Initialized')
    } catch (error) {
      logger.error('[DeviceManager] Initialization failed:', error)
      throw error
    }
  }

  destroy(): void {
    this.stopPreview()
    this.listeners.clear()

    if (navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', this.handleDeviceChange)
    }

    this.isInitialized = false
    DeviceManager.instance = null
    logger.info('[DeviceManager] Destroyed')
  }

  async enumerateDevices(): Promise<DeviceState> {
    if (!navigator.mediaDevices?.enumerateDevices) {
      logger.warn('[DeviceManager] enumerateDevices not supported')
      return this.deviceState
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()

      this.deviceState.webcams = devices
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
          kind: d.kind as 'videoinput',
          groupId: d.groupId
        }))

      this.deviceState.microphones = devices
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${i + 1}`,
          kind: d.kind as 'audioinput',
          groupId: d.groupId
        }))

      this.deviceState.speakers = devices
        .filter(d => d.kind === 'audiooutput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Speaker ${i + 1}`,
          kind: d.kind as 'audiooutput',
          groupId: d.groupId
        }))

      logger.info(`[DeviceManager] Found ${this.deviceState.webcams.length} webcams, ${this.deviceState.microphones.length} microphones`)
      this.notifyListeners()
      return this.deviceState
    } catch (error) {
      logger.error('[DeviceManager] Device enumeration failed:', error)
      return this.deviceState
    }
  }

  getDeviceState(): DeviceState {
    return { ...this.deviceState }
  }

  async startPreview(deviceId: string, options?: { width?: number; height?: number }): Promise<MediaStream> {
    this.stopPreview()

    const constraints: MediaStreamConstraints = {
      video: {
        deviceId: { exact: deviceId },
        width: options?.width ?? { ideal: 1280 },
        height: options?.height ?? { ideal: 720 }
      },
      audio: false
    }

    try {
      this.previewStream = await navigator.mediaDevices.getUserMedia(constraints)
      logger.info('[DeviceManager] Preview started for device:', deviceId)
      return this.previewStream
    } catch (error) {
      logger.error('[DeviceManager] Failed to start preview:', error)
      throw error
    }
  }

  stopPreview(): void {
    if (this.previewStream) {
      this.previewStream.getTracks().forEach(track => track.stop())
      this.previewStream = null
    }
  }

  getPreviewStream(): MediaStream | null {
    return this.previewStream
  }

  onDevicesChanged(callback: DeviceChangeCallback): () => void {
    this.listeners.add(callback)
    return () => this.listeners.delete(callback)
  }

  getDefaultWebcam(): string | null {
    return this.deviceState.webcams[0]?.deviceId ?? null
  }

  getDefaultMicrophone(): string | null {
    const defaultMic = this.deviceState.microphones.find(m => m.deviceId === 'default')
    return defaultMic?.deviceId ?? this.deviceState.microphones[0]?.deviceId ?? null
  }

  private handleDeviceChange = async (): Promise<void> => {
    logger.info('[DeviceManager] Device change detected')
    await this.enumerateDevices()
  }

  private notifyListeners(): void {
    const state = this.getDeviceState()
    this.listeners.forEach(callback => {
      try {
        callback(state)
      } catch (error) {
        logger.error('[DeviceManager] Listener callback error:', error)
      }
    })
  }
}

export function getDeviceManager(): DeviceManager {
  return DeviceManager.getInstance()
}

export { DeviceManager }

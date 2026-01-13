/**
 * Hook for monitoring audio level from a microphone device.
 *
 * Performance optimizations:
 * - Throttled to ~15Hz (every 4th frame) instead of 60Hz
 * - Peak decay integrated into RAF loop (no separate setInterval)
 * - Reuses Uint8Array buffer instead of allocating each frame
 * - Only updates state when level changes significantly
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getAudioInputService } from '@/features/media/recording/services/audio-input-service'
import { getSharedAudioContext } from '@/shared/contexts/audio-context'
import { logger } from '@/shared/utils/logger'

// Performance constants
const FRAME_SKIP = 3 // Process every 4th frame (~15Hz at 60fps)
const LEVEL_CHANGE_THRESHOLD = 0.01 // Only update state if level changed by this much
const PEAK_DECAY_RATE = 0.008 // Decay per frame (adjusted for 15Hz: 0.02 * 4 / 10)

interface UseAudioLevelOptions {
  deviceId: string | null
  enabled?: boolean
  smoothing?: number
  mode?: 'monitor' | 'recording'
}

interface AudioLevelState {
  level: number
  peak: number
  isMonitoring: boolean
  error: string | null
}

export function useAudioLevel(options: UseAudioLevelOptions): AudioLevelState {
  const { deviceId, enabled = true, smoothing = 0.8, mode = 'monitor' } = options

  const [state, setState] = useState<AudioLevelState>({
    level: 0,
    peak: 0,
    isMonitoring: false,
    error: null
  })

  const peakRef = useRef(0)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const frameCountRef = useRef(0)
  const dataArrayRef = useRef<Uint8Array | null>(null) // Reusable buffer
  const lastLevelRef = useRef(0) // Track last reported level for change detection
  const audioInputService = getAudioInputService()

  const stopMonitoring = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (sourceRef.current) {
      sourceRef.current.disconnect()
      sourceRef.current = null
    }
    audioContextRef.current = null

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }

    analyserRef.current = null
    dataArrayRef.current = null
    peakRef.current = 0
    frameCountRef.current = 0
    lastLevelRef.current = 0

    setState(prev => ({
      ...prev,
      level: 0,
      peak: 0,
      isMonitoring: false
    }))
  }, [])

  const startMonitoring = useCallback(async () => {
    if (mode !== 'monitor') return
    if (!deviceId) return

    stopMonitoring()

    try {
      // Get audio stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: { exact: deviceId } },
        video: false
      })
      streamRef.current = stream

      // Set up audio analysis
      const audioContext = getSharedAudioContext()
      if (!audioContext) {
        throw new Error('AudioContext unavailable')
      }
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = smoothing
      source.connect(analyser)
      analyserRef.current = analyser
      sourceRef.current = source

      setState(prev => ({ ...prev, isMonitoring: true, error: null }))

      // Initialize reusable buffer
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount)

      // Throttled update loop - runs at ~15Hz instead of 60Hz
      const updateLevel = () => {
        if (!analyserRef.current || !dataArrayRef.current) return

        frameCountRef.current++

        // Skip frames for throttling (process every 4th frame = ~15Hz)
        if (frameCountRef.current <= FRAME_SKIP) {
          rafRef.current = requestAnimationFrame(updateLevel)
          return
        }
        frameCountRef.current = 0

        // Reuse buffer instead of allocating new one
        analyserRef.current.getByteFrequencyData(dataArrayRef.current)

        // Calculate RMS
        let sum = 0
        const data = dataArrayRef.current
        for (let i = 0; i < data.length; i++) {
          sum += data[i] * data[i]
        }
        const rms = Math.sqrt(sum / data.length)
        const level = Math.min(1, rms / 128)

        // Apply peak decay (integrated into RAF loop, no separate timer)
        peakRef.current = Math.max(0, peakRef.current - PEAK_DECAY_RATE)

        // Update peak if current level exceeds it
        if (level > peakRef.current) {
          peakRef.current = level
        }

        // Only update state if level changed significantly (reduces re-renders)
        const levelChanged = Math.abs(level - lastLevelRef.current) > LEVEL_CHANGE_THRESHOLD
        if (levelChanged) {
          lastLevelRef.current = level
          setState(prev => ({
            ...prev,
            level,
            peak: peakRef.current
          }))
        }

        rafRef.current = requestAnimationFrame(updateLevel)
      }

      rafRef.current = requestAnimationFrame(updateLevel)
    } catch (error) {
      logger.error('[useAudioLevel] Failed to start monitoring:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to start audio monitoring',
        isMonitoring: false
      }))
    }
  }, [deviceId, mode, smoothing, stopMonitoring])

  // Start/stop monitoring based on enabled state and deviceId
  useEffect(() => {
    if (mode !== 'monitor') return
    if (enabled && deviceId) {
      startMonitoring()
    } else {
      stopMonitoring()
    }

    return () => {
      stopMonitoring()
    }
  }, [enabled, deviceId, mode, startMonitoring, stopMonitoring])

  useEffect(() => {
    if (mode !== 'recording') return
    if (!enabled) {
      setState(prev => ({
        ...prev,
        level: 0,
        peak: 0,
        isMonitoring: false,
        error: null
      }))
      return
    }

    setState(prev => ({
      ...prev,
      isMonitoring: audioInputService.isRecording(),
      error: null
    }))

    // Track last update time for throttled peak decay
    let lastDecayTime = 0
    const DECAY_INTERVAL = 67 // ~15Hz (1000ms / 15)

    const unsubscribe = audioInputService.onAudioLevel((level) => {
      // Apply throttled peak decay on each level update
      const now = performance.now()
      if (now - lastDecayTime > DECAY_INTERVAL) {
        peakRef.current = Math.max(0, peakRef.current - 0.02)
        lastDecayTime = now
      }

      if (level > peakRef.current) {
        peakRef.current = level
      }

      // Only update state if level changed significantly
      const levelChanged = Math.abs(level - lastLevelRef.current) > LEVEL_CHANGE_THRESHOLD
      if (levelChanged) {
        lastLevelRef.current = level
        setState(prev => ({
          ...prev,
          level,
          peak: peakRef.current,
          isMonitoring: audioInputService.isRecording()
        }))
      }
    })

    return () => {
      unsubscribe()
    }
  }, [audioInputService, enabled, mode])

  return state
}

/**
 * Hook for getting audio level during recording.
 * Deprecated: prefer useAudioLevel({ mode: 'recording' }).
 */
export function useRecordingAudioLevel(): number {
  const { level } = useAudioLevel({ deviceId: null, enabled: true, mode: 'recording' })
  return level
}

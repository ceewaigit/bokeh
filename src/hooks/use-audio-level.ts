/**
 * Hook for monitoring audio level from a microphone device.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getAudioInputService } from '@/features/recording/services/audio-input-service'
import { getSharedAudioContext } from '@/shared/contexts/audio-context'
import { logger } from '@/shared/utils/logger'

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
  const peakDecayRef = useRef<NodeJS.Timeout | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const audioInputService = getAudioInputService()

  const stopMonitoring = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (peakDecayRef.current) {
      clearInterval(peakDecayRef.current)
      peakDecayRef.current = null
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
    peakRef.current = 0

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

      // Start peak decay timer
      peakDecayRef.current = setInterval(() => {
        peakRef.current = Math.max(0, peakRef.current - 0.02)
      }, 50)

      // Update loop
      const updateLevel = () => {
        if (!analyserRef.current) return

        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)

        // Calculate RMS
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / dataArray.length)
        const level = Math.min(1, rms / 128)

        // Update peak
        if (level > peakRef.current) {
          peakRef.current = level
        }

        setState(prev => ({
          ...prev,
          level,
          peak: peakRef.current
        }))

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

    const unsubscribe = audioInputService.onAudioLevel((level) => {
      if (level > peakRef.current) {
        peakRef.current = level
      }

      setState(prev => ({
        ...prev,
        level,
        peak: peakRef.current,
        isMonitoring: audioInputService.isRecording()
      }))
    })

    if (peakDecayRef.current) {
      clearInterval(peakDecayRef.current)
    }
    peakDecayRef.current = setInterval(() => {
      peakRef.current = Math.max(0, peakRef.current - 0.02)
    }, 50)

    return () => {
      unsubscribe()
      if (peakDecayRef.current) {
        clearInterval(peakDecayRef.current)
        peakDecayRef.current = null
      }
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

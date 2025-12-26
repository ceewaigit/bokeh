/**
 * Hook for monitoring audio level from a microphone device.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { getAudioInputService } from '@/lib/recording/services/audio-input-service'
import { logger } from '@/lib/utils/logger'

interface UseAudioLevelOptions {
  deviceId: string | null
  enabled?: boolean
  smoothing?: number
}

interface AudioLevelState {
  level: number
  peak: number
  isMonitoring: boolean
  error: string | null
}

export function useAudioLevel(options: UseAudioLevelOptions): AudioLevelState {
  const { deviceId, enabled = true, smoothing = 0.8 } = options

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
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)

  const stopMonitoring = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    if (peakDecayRef.current) {
      clearInterval(peakDecayRef.current)
      peakDecayRef.current = null
    }

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => { })
      audioContextRef.current = null
    }

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
      const audioContext = new AudioContext()
      audioContextRef.current = audioContext

      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = smoothing
      source.connect(analyser)
      analyserRef.current = analyser

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
  }, [deviceId, smoothing, stopMonitoring])

  // Start/stop monitoring based on enabled state and deviceId
  useEffect(() => {
    if (enabled && deviceId) {
      startMonitoring()
    } else {
      stopMonitoring()
    }

    return () => {
      stopMonitoring()
    }
  }, [enabled, deviceId, startMonitoring, stopMonitoring])

  return state
}

/**
 * Hook for getting audio level during recording.
 * Uses the AudioInputService if recording, otherwise monitors directly.
 */
export function useRecordingAudioLevel(): number {
  const [level, setLevel] = useState(0)
  const audioInputService = getAudioInputService()

  useEffect(() => {
    const unsubscribe = audioInputService.onAudioLevel(setLevel)
    return unsubscribe
  }, [])

  return audioInputService.isRecording() ? level : 0
}

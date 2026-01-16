/**
 * Media Recorder Utilities
 *
 * Shared utilities for WebcamService and AudioInputService.
 * Eliminates code duplication between recording services.
 */

import { logger } from '@/shared/utils/logger'

/**
 * Recording timing state - common state for duration calculation.
 */
export interface RecordingTimingState {
  startTime: number
  isRecording: boolean
  isPaused: boolean
  pauseStartTime: number
  totalPausedDuration: number
}

/**
 * Options for setting up a MediaRecorder.
 */
export interface SetupMediaRecorderOptions {
  stream: MediaStream
  mimeType: string
  videoBitsPerSecond?: number
  audioBitsPerSecond?: number
}

/**
 * MediaRecorder handle returned after setup.
 */
export interface MediaRecorderHandle {
  mediaRecorder: MediaRecorder
  dataRequestInterval: NodeJS.Timeout
}

// ============================================================================
// MIME Type Selection
// ============================================================================

/**
 * Select the best supported video MIME type.
 * @param hasAudio Whether to include audio codecs in the selection
 */
export function selectVideoMimeType(hasAudio: boolean): string {
  const candidates = hasAudio
    ? ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8']
    : ['video/webm;codecs=vp8', 'video/webm;codecs=vp9']

  return candidates.find(mime => MediaRecorder.isTypeSupported(mime)) || 'video/webm'
}

/**
 * Select the best supported audio MIME type.
 */
export function selectAudioMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus'
  ]

  return candidates.find(mime => MediaRecorder.isTypeSupported(mime)) || 'audio/webm'
}

// ============================================================================
// Duration Calculation
// ============================================================================

/**
 * Calculate recording duration accounting for pauses.
 * @param state The current timing state
 * @returns Duration in milliseconds
 */
export function calculateDuration(state: RecordingTimingState): number {
  if (!state.isRecording || state.startTime === 0) return 0

  const elapsed = Date.now() - state.startTime
  const pausedNow = state.isPaused ? (Date.now() - state.pauseStartTime) : 0
  return elapsed - state.totalPausedDuration - pausedNow
}

/**
 * Calculate effective duration using coordinated stop time.
 * Used during finishRecording to get accurate final duration.
 */
export function calculateFinalDuration(
  startTime: number,
  coordinatedStopTime: number,
  totalPausedDuration: number
): number {
  const effectiveStopTime = coordinatedStopTime > 0 ? coordinatedStopTime : Date.now()
  const wallClockDuration = startTime > 0 ? effectiveStopTime - startTime : 0
  const calculatedDuration = wallClockDuration - totalPausedDuration

  // Use wall-clock duration if calculated duration seems wrong (< 100ms for a real recording)
  return calculatedDuration > 100 ? calculatedDuration : wallClockDuration
}

// ============================================================================
// Stream Management
// ============================================================================

/**
 * Clean up a media stream by stopping all tracks.
 */
export function cleanupStream(stream: MediaStream | null): void {
  if (stream) {
    stream.getTracks().forEach(track => track.stop())
  }
}

// ============================================================================
// Data Interval Management
// ============================================================================

/**
 * Clear a data request interval.
 */
export function clearDataInterval(interval: NodeJS.Timeout | null): null {
  if (interval) {
    clearInterval(interval)
  }
  return null
}

// ============================================================================
// Total Duration Calculation
// ============================================================================

/**
 * Calculate total duration from an array of segments.
 */
export function calculateTotalSegmentDuration<T extends { durationMs: number }>(
  segments: T[]
): number {
  return segments.reduce((sum, seg) => sum + seg.durationMs, 0)
}

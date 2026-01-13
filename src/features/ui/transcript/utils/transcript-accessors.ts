/**
 * Transcript Accessors
 *
 * Type-safe accessor functions for transcript-related data.
 * These replace raw ?? fallbacks to:
 * - Warn in dev mode when data is unexpectedly missing
 * - Provide type-safe defaults
 * - Document expected data shapes
 */

import type { Recording, Clip, Transcript } from '@/types/project'
import { TranscriptionStatus } from '@/types/project'
import { getSourceDuration } from '@/features/ui/timeline/time/time-space-converter'

const isDev = process.env.NODE_ENV === 'development'

/**
 * Get recording duration with dev warning if missing
 */
export function getRecordingDuration(recording: Recording): number {
  if (recording.duration === undefined || recording.duration === null) {
    if (isDev) {
      console.warn(`[transcript-accessors] Recording ${recording.id} has no duration`)
    }
    return 0
  }
  return recording.duration
}

/**
 * Get recording transcript (may legitimately be null)
 */
export function getRecordingTranscript(recording: Recording): Transcript | null {
  return recording.metadata?.transcript ?? null
}

/**
 * Get transcription status with default
 */
export function getTranscriptionStatus(recording: Recording): TranscriptionStatus {
  return recording.metadata?.transcriptionStatus ?? TranscriptionStatus.None
}

/**
 * Get clip source in time with dev warning if missing
 */
export function getClipSourceIn(clip: Clip): number {
  if (clip.sourceIn === undefined || clip.sourceIn === null) {
    if (isDev) {
      console.warn(`[transcript-accessors] Clip ${clip.id} has no sourceIn - using 0`)
    }
    return 0
  }
  return clip.sourceIn
}

/**
 * Get clip source out time with computed fallback
 */
export function getClipSourceOut(clip: Clip): number {
  if (clip.sourceOut !== undefined && clip.sourceOut !== null) {
    return clip.sourceOut
  }
  // Compute from sourceIn + duration
  const sourceIn = getClipSourceIn(clip)
  return sourceIn + getSourceDuration(clip)
}

/**
 * Get value from map with fallback, warning if missing in dev
 */
export function getMapValue<K, V>(
  map: Map<K, V>,
  key: K,
  fallback: V,
  context?: string
): V {
  const value = map.get(key)
  if (value === undefined) {
    if (isDev && context) {
      console.warn(`[transcript-accessors] ${context}: key ${String(key)} not found in map`)
    }
    return fallback
  }
  return value
}

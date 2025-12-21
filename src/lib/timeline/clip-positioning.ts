import type { Clip } from '@/types/project'
import { TimelineConfig } from './config'

export interface OverlapCheckResult {
  hasOverlap: boolean
  overlappingClips?: Clip[]
}

export interface PositionValidation {
  isValid: boolean
  finalPosition: number  // The final validated position
  suggestedPosition?: number  // Alternative position if current is invalid
  reason?: string
}

export interface SnapPoint {
  time: number
  type: 'start' | 'end' | 'playhead'
  clipId?: string
}

/**
 * Unified service for clip positioning, overlap detection, and snapping
 */
export class ClipPositioning {
  private static SNAP_THRESHOLD_MS = TimelineConfig.SNAP_INTERVAL_MS
  private static MIN_GAP_MS = 0 // No forced gaps by default

  /**
   * Check if a clip would overlap with others at a given position
   */
  static checkOverlap(
    startTime: number,
    duration: number,
    otherClips: Clip[],
    excludeClipId?: string
  ): OverlapCheckResult {
    const overlappingClips: Clip[] = []

    for (const clip of otherClips) {
      // Skip self
      if (excludeClipId && clip.id === excludeClipId) continue

      const clipEnd = clip.startTime + clip.duration
      const proposedEnd = startTime + duration

      // Check for overlap
      if (startTime < clipEnd && proposedEnd > clip.startTime) {
        overlappingClips.push(clip)
      }
    }

    return {
      hasOverlap: overlappingClips.length > 0,
      overlappingClips
    }
  }

  /**
   * Find the next valid position for a clip (no overlaps)
   */
  static findNextValidPosition(
    desiredStart: number,
    duration: number,
    otherClips: Clip[],
    excludeClipId?: string
  ): number {
    // Sort clips by start time
    const sortedClips = otherClips
      .filter(c => !excludeClipId || c.id !== excludeClipId)
      .sort((a, b) => a.startTime - b.startTime)

    let position = desiredStart

    // Keep checking until we find a gap
    for (const clip of sortedClips) {
      const clipEnd = clip.startTime + clip.duration

      // If our position would overlap with this clip
      if (position < clipEnd && (position + duration) > clip.startTime) {
        // Move to after this clip
        position = clipEnd + this.MIN_GAP_MS
      }
    }

    return Math.max(0, position)
  }

  /**
   * Get snap points from clips
   */
  static getSnapPoints(
    clips: Clip[],
    currentTime?: number,
    excludeClipId?: string
  ): SnapPoint[] {
    const points: SnapPoint[] = []

    // Add timeline start
    points.push({ time: 0, type: 'start' })

    // Add clip edges
    for (const clip of clips) {
      if (excludeClipId && clip.id === excludeClipId) continue

      points.push({
        time: clip.startTime,
        type: 'start',
        clipId: clip.id
      })

      points.push({
        time: clip.startTime + clip.duration,
        type: 'end',
        clipId: clip.id
      })
    }

    // Add playhead position if provided
    if (currentTime !== undefined && currentTime > 0) {
      points.push({
        time: currentTime,
        type: 'playhead'
      })
    }

    // Remove duplicates and sort
    const uniqueTimes = new Set(points.map(p => p.time))
    return Array.from(uniqueTimes)
      .sort((a, b) => a - b)
      .map(time => points.find(p => p.time === time)!)
  }

  /**
   * Find the nearest snap point to a given time
   */
  static findNearestSnapPoint(
    time: number,
    snapPoints: SnapPoint[],
    threshold: number = this.SNAP_THRESHOLD_MS
  ): SnapPoint | null {
    let nearest: SnapPoint | null = null
    let minDistance = threshold

    for (const point of snapPoints) {
      const distance = Math.abs(time - point.time)
      if (distance < minDistance) {
        minDistance = distance
        nearest = point
      }
    }

    return nearest
  }

  /**
   * Get reorder target - determines where a clip should be inserted based on drag position
   * Used for contiguous timeline where clips cannot have gaps
   */
  static getReorderTarget(
    proposedTime: number,
    clips: Clip[],
    excludeClipId?: string
  ): { insertBeforeClipId: string | null; insertIndex: number } {
    const sorted = clips
      .filter(c => c.id !== excludeClipId)
      .sort((a, b) => a.startTime - b.startTime)

    // Find insertion point based on where the clip center would be
    for (let i = 0; i < sorted.length; i++) {
      const clip = sorted[i]
      const clipMidpoint = clip.startTime + clip.duration / 2
      if (proposedTime < clipMidpoint) {
        return { insertBeforeClipId: clip.id, insertIndex: i }
      }
    }

    // Insert at end
    return { insertBeforeClipId: null, insertIndex: sorted.length }
  }

  /**
   * Apply magnetic snapping to a position
   * In contiguous mode, clips snap to adjacent positions and cannot create gaps
   */
  static applyMagneticSnap(
    proposedTime: number,
    duration: number,
    clips: Clip[],
    excludeClipId?: string,
    currentTime?: number
  ): { time: number; snappedTo?: SnapPoint } {
    const sorted = clips
      .filter(c => !excludeClipId || c.id !== excludeClipId)
      .sort((a, b) => a.startTime - b.startTime)

    // If there are no other clips, must start at 0
    if (sorted.length === 0) {
      return { time: 0 }
    }

    // Find the clip immediately before and after the proposed position
    let prevClip: Clip | undefined
    let nextClip: Clip | undefined

    for (const clip of sorted) {
      const clipEnd = clip.startTime + clip.duration
      if (clipEnd <= proposedTime) {
        prevClip = clip
      }
      if (!nextClip && clip.startTime >= proposedTime) {
        nextClip = clip
      }
    }

    // In contiguous mode: clips must be adjacent, no gaps allowed
    // The first clip must always start at 0
    // If no prevClip found, this clip must go to position 0
    if (!prevClip) {
      return { time: 0, snappedTo: { type: 'start', time: 0 } }
    }

    // Snap to end of previous clip (contiguous)
    const prevEnd = prevClip.startTime + prevClip.duration
    return {
      time: prevEnd,
      snappedTo: { type: 'end', time: prevEnd, clipId: prevClip.id }
    }
  }

  /**
   * Validate a clip position (combines overlap check and snapping)
   */
  static validatePosition(
    proposedTime: number,
    duration: number,
    clips: Clip[],
    excludeClipId?: string,
    options: {
      allowOverlap?: boolean
      snapToGrid?: boolean
      currentTime?: number
      enforceLeftmostConstraint?: boolean
      findAlternativeIfInvalid?: boolean
    } = {}
  ): PositionValidation {
    // Apply snapping if requested
    let finalTime = proposedTime
    if (options.snapToGrid) {
      const snapResult = this.applyMagneticSnap(
        proposedTime,
        duration,
        clips,
        excludeClipId,
        options.currentTime
      )
      finalTime = snapResult.time
    }

    // Enforce leftmost constraint if requested
    if (options.enforceLeftmostConstraint) {
      const minAllowedTime = this.getLeftmostClipEnd(clips, excludeClipId)
      if (finalTime < minAllowedTime) {
        if (options.findAlternativeIfInvalid) {
          finalTime = minAllowedTime
        } else {
          return {
            isValid: false,
            finalPosition: finalTime,
            suggestedPosition: minAllowedTime,
            reason: `Must be positioned after leftmost clip`
          }
        }
      }
    }

    // Check for overlaps unless explicitly allowed
    if (!options.allowOverlap) {
      const overlapCheck = this.checkOverlap(
        finalTime,
        duration,
        clips,
        excludeClipId
      )

      if (overlapCheck.hasOverlap) {
        // Find next valid position
        const validPosition = this.findNextValidPosition(
          finalTime,
          duration,
          clips,
          excludeClipId
        )

        return {
          isValid: false,
          finalPosition: finalTime,
          suggestedPosition: validPosition,
          reason: 'Would overlap with existing clips'
        }
      }
    }

    return {
      isValid: true,
      finalPosition: finalTime
    }
  }

  /**
   * Get the end position of the leftmost clip
   */
  static getLeftmostClipEnd(clips: Clip[], excludeClipId?: string): number {
    const filteredClips = clips.filter(c => !excludeClipId || c.id !== excludeClipId)
    if (filteredClips.length === 0) return 0

    const leftmostClip = filteredClips.reduce((leftmost, current) => {
      if (!leftmost || current.startTime < leftmost.startTime) {
        return current
      }
      return leftmost
    }, null as Clip | null)

    return leftmostClip ? leftmostClip.startTime + leftmostClip.duration : 0
  }

  /**
   * Find the best position for auto-placement
   */
  static findBestAutoPosition(
    duration: number,
    clips: Clip[],
    preferredStrategy: 'end' | 'first-gap' | 'after-playhead' = 'end',
    currentTime?: number
  ): number {
    const sortedClips = [...clips].sort((a, b) => a.startTime - b.startTime)

    switch (preferredStrategy) {
      case 'after-playhead':
        if (currentTime !== undefined) {
          // Try to place after current playhead position
          const position = this.findNextValidPosition(
            currentTime,
            duration,
            clips
          )
          return position
        }
      // Fall through to 'end' if no currentTime

      case 'first-gap':
        // Find first gap that fits
        let lastEnd = 0
        for (const clip of sortedClips) {
          const gap = clip.startTime - lastEnd
          if (gap >= duration) {
            return lastEnd
          }
          lastEnd = clip.startTime + clip.duration
        }
        // No gap found, place at end
        return lastEnd

      case 'end':
      default:
        // Place at the end of all clips
        if (sortedClips.length === 0) return 0
        const lastClip = sortedClips[sortedClips.length - 1]
        return lastClip.startTime + lastClip.duration
    }
  }
}
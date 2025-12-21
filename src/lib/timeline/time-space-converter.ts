/**
 * Time Space Converter - Centralized utilities for converting between different time coordinate systems
 * 
 * THREE TIME COORDINATE SYSTEMS:
 * 
 * 1. SOURCE SPACE (Recording Metadata)
 *    - Original timestamps from recording (milliseconds from recording start)
 *    - Stored in recording.metadata.keyboardEvents/mouseEvents/etc
 *    - NEVER MODIFIED - this is the source of truth
 *    - Example: A keypress at 5000ms in the original recording
 * 
 * 2. TIMELINE SPACE (UI Position)
 *    - Position on the timeline UI that the user sees
 *    - Represents the actual playback time in the final video
 *    - Affected by clip position and playback rate
 *    - Example: A clip starting at timeline position 10000ms
 * 
 * 3. CLIP-RELATIVE SPACE (Internal Clip Time)
 *    - Time relative to the start of a clip
 *    - Accounts for playback rate and time remapping
 *    - Used for internal clip calculations
 *    - Example: 1000ms into a clip (regardless of where clip is on timeline)
 * 
 * CRITICAL RULES:
 * - Effects should ALWAYS use TIMELINE SPACE (when to show the effect in final video)
 * - Metadata should ALWAYS remain in SOURCE SPACE (original recording data)
 * - UI operations (split, trim) work in TIMELINE SPACE (what user sees)
 * - Internal clip operations use CLIP-RELATIVE SPACE
 */

import type { Clip } from '@/types/project'

/**
 * Convert source recording time to timeline position
 * @param sourceMs - Time in milliseconds from recording start (source space)
 * @param clip - The clip containing this source time
 * @returns Timeline position in milliseconds
 */
export function sourceToTimeline(sourceMs: number, clip: Clip): number {
  // First convert source to clip-relative
  const clipRelativeMs = sourceToClipRelative(sourceMs, clip)

  // Then add clip's position on timeline
  return clip.startTime + clipRelativeMs
}

/**
 * Convert timeline position to source recording time
 * @param timelineMs - Position on timeline in milliseconds
 * @param clip - The clip at this timeline position
 * @returns Source recording time in milliseconds
 */
export function timelineToSource(timelineMs: number, clip: Clip): number {
  // First get clip-relative time
  const clipRelativeMs = timelineMs - clip.startTime

  // Then convert to source
  return clipRelativeToSource(clipRelativeMs, clip)
}

/**
 * Convert source recording time to clip-relative time
 * This accounts for playback rate and time remapping
 * @param sourceMs - Time in milliseconds from recording start
 * @param clip - The clip to convert for
 * @returns Time relative to clip start in milliseconds
 */
export function sourceToClipRelative(sourceMs: number, clip: Clip): number {
  const playbackRate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1
  const sourceIn = clip.sourceIn || 0

  if (!isFinite(sourceMs)) {
    return 0
  }

  // Guard against timestamps before the clip starts
  if (sourceMs <= sourceIn) {
    return 0
  }

  // Guard against timestamps after the clip ends
  const sourceOut = clip.sourceOut || (sourceIn + clip.duration * playbackRate)
  if (sourceMs >= sourceOut) {
    return clip.duration
  }

  // Handle time remapping if present
  const rawPeriods = clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0
    ? [...clip.timeRemapPeriods].sort((a, b) => a.sourceStartTime - b.sourceStartTime)
    : null

  // Fast path when no time remapping
  if (!rawPeriods) {
    return (sourceMs - sourceIn) / playbackRate
  }

  // Complex path with time remapping
  let playbackTime = 0
  let currentSource = sourceIn

  for (const period of rawPeriods) {
    const periodStart = Math.max(period.sourceStartTime, sourceIn)
    const periodEnd = Math.max(periodStart, period.sourceEndTime)

    // Handle gap before this period at base playback rate
    if (currentSource < periodStart) {
      if (sourceMs <= periodStart) {
        return playbackTime + Math.max(0, sourceMs - currentSource) / playbackRate
      }

      playbackTime += (periodStart - currentSource) / playbackRate
      currentSource = periodStart
    }

    // If timestamp falls within this period, map using period's speed
    if (sourceMs <= periodEnd) {
      return playbackTime + Math.max(0, sourceMs - currentSource) / Math.max(0.0001, period.speedMultiplier)
    }

    // Otherwise, consume entire period and continue
    playbackTime += (periodEnd - currentSource) / Math.max(0.0001, period.speedMultiplier)
    currentSource = periodEnd
  }

  // Remaining tail after last remap period
  if (sourceMs > currentSource) {
    playbackTime += (sourceMs - currentSource) / playbackRate
  }

  return playbackTime
}

/**
 * Convert clip-relative time to source recording time
 * Inverse of sourceToClipRelative
 * @param clipRelativeMs - Time relative to clip start in milliseconds
 * @param clip - The clip to convert for
 * @returns Source recording time in milliseconds
 */
export function clipRelativeToSource(clipRelativeMs: number, clip: Clip): number {
  const sourceIn = clip.sourceIn || 0
  const baseRate = clip.playbackRate && clip.playbackRate > 0 ? clip.playbackRate : 1

  // Handle time remapping if present
  const periods = clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0
    ? [...clip.timeRemapPeriods].sort((a, b) => a.sourceStartTime - b.sourceStartTime)
    : null

  // Fast path when no time remapping
  if (!periods) {
    // Use SIMPLE multiplication by playback rate (matches old working behavior)
    // This correctly maps timeline time to source time accounting for speed changes
    const sourceTime = sourceIn + (clipRelativeMs * baseRate);

    // Calculate sourceOut for clamping
    const sourceOut = clip.sourceOut ?? (sourceIn + getSourceDuration(clip));

    // Clamp to source range
    return Math.max(sourceIn, Math.min(sourceOut, sourceTime));
  }

  // Complex path with time remapping
  let remainingTimeline = clipRelativeMs
  let currentSource = sourceIn

  for (const period of periods) {
    const periodStart = Math.max(period.sourceStartTime, sourceIn)
    const periodEnd = Math.max(periodStart, period.sourceEndTime)

    // Handle gap before this period
    if (currentSource < periodStart) {
      const gapDurationSource = periodStart - currentSource
      const gapTimelineDuration = gapDurationSource / baseRate

      if (remainingTimeline <= gapTimelineDuration) {
        const result = currentSource + remainingTimeline * baseRate
        const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
        return Math.max(sourceIn, Math.min(sourceOut, result))
      }

      remainingTimeline -= gapTimelineDuration
      currentSource = periodStart
    }

    // Handle this period
    const effectiveSpeed = Math.max(0.0001, period.speedMultiplier)
    const periodDurationSource = periodEnd - periodStart
    const periodTimelineDuration = periodDurationSource / effectiveSpeed

    if (remainingTimeline <= periodTimelineDuration) {
      const result = periodStart + remainingTimeline * effectiveSpeed
      const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
      return Math.max(sourceIn, Math.min(sourceOut, result))
    }

    remainingTimeline -= periodTimelineDuration
    currentSource = periodEnd
  }

  // Handle remaining tail
  const sourceOut = clip.sourceOut ?? (sourceIn + (clip.duration || 0) * baseRate)
  const result = currentSource + remainingTimeline * baseRate
  return Math.max(sourceIn, Math.min(sourceOut, result))
}

/**
 * Convert timeline position to clip-relative time
 * @param timelineMs - Position on timeline in milliseconds
 * @param clip - The clip at this timeline position
 * @returns Time relative to clip start in milliseconds
 */
export function timelineToClipRelative(timelineMs: number, clip: Clip): number {
  const clipRelativeMs = timelineMs - clip.startTime

  // Clamp to clip bounds
  if (clipRelativeMs < 0) return 0
  if (clipRelativeMs > clip.duration) return clip.duration

  return clipRelativeMs
}

/**
 * Convert clip-relative time to timeline position
 * @param clipRelativeMs - Time relative to clip start in milliseconds
 * @param clip - The clip to convert for
 * @returns Timeline position in milliseconds
 */
export function clipRelativeToTimeline(clipRelativeMs: number, clip: Clip): number {
  return clip.startTime + clipRelativeMs
}

/**
 * Get the actual source duration accounting for playback rate
 * @param clip - The clip to get source duration for
 * @returns Source duration in milliseconds
 */
export function getSourceDuration(clip: Clip): number {
  const sourceIn = clip.sourceIn || 0

  if (clip.sourceOut != null && clip.sourceOut >= sourceIn) {
    return clip.sourceOut - sourceIn
  }

  // Fallback: If sourceOut not set, assume current clip duration represents source
  const playbackRate = clip.playbackRate || 1
  return clip.duration * playbackRate
}

/**
 * Calculate effective timeline duration for a given playback rate
 * @param clip - The clip to calculate for
 * @param rate - Optional playback rate override
 * @returns Effective duration in milliseconds
 */
export function computeEffectiveDuration(clip: Clip, rate?: number): number {
  // If explicit rate provided, use simple calculation (legacy/preview behavior)
  if (rate != null) {
    const base = getSourceDuration(clip)
    return Math.max(0, base / rate)
  }

  // If time remapping exists, calculate exact duration using the periods
  if (clip.timeRemapPeriods && clip.timeRemapPeriods.length > 0) {
    const sourceIn = clip.sourceIn || 0
    const sourceDuration = getSourceDuration(clip)
    const sourceOut = sourceIn + sourceDuration
    const baseRate = clip.playbackRate || 1

    const periods = [...clip.timeRemapPeriods].sort((a, b) => a.sourceStartTime - b.sourceStartTime)
    let duration = 0
    let currentSource = sourceIn

    for (const period of periods) {
      const periodStart = Math.max(period.sourceStartTime, sourceIn)
      const periodEnd = Math.min(Math.max(periodStart, period.sourceEndTime), sourceOut)

      // Skip if period is outside our range
      if (periodEnd <= periodStart) continue

      // Gap before this period
      if (currentSource < periodStart) {
        duration += (periodStart - currentSource) / baseRate
        currentSource = periodStart
      }

      // Period duration
      duration += (periodEnd - currentSource) / Math.max(0.0001, period.speedMultiplier)
      currentSource = periodEnd
    }

    // Remaining tail
    if (currentSource < sourceOut) {
      duration += (sourceOut - currentSource) / baseRate
    }

    return Math.max(0, duration)
  }

  const playback = (clip.playbackRate ?? 1) || 1
  const base = getSourceDuration(clip)
  const effective = base / playback
  // Return precise float duration - rounding causes gaps/overlaps in frame-based rendering
  return Math.max(0, effective)
}

/**
 * Validate that a timeline position falls within a clip
 * @param timelineMs - Position on timeline
 * @param clip - The clip to check
 * @returns True if position is within clip bounds
 */
export function isTimelinePositionInClip(timelineMs: number, clip: Clip): boolean {
  return timelineMs >= clip.startTime && timelineMs < clip.startTime + clip.duration
}

/**
 * Validate that a source time falls within a clip's source range
 * @param sourceMs - Source recording time
 * @param clip - The clip to check
 * @returns True if source time is within clip's source range
 */
export function isSourceTimeInClip(sourceMs: number, clip: Clip): boolean {
  const sourceIn = clip.sourceIn || 0
  const sourceOut = clip.sourceOut || (sourceIn + getSourceDuration(clip))
  return sourceMs >= sourceIn && sourceMs <= sourceOut
}

/**
 * Find the clip that contains a given timeline position
 * CRITICAL for cross-clip lookups: When calculating previous frame state,
 * the previous timeline position might fall in a different clip than the current one.
 *
 * At exact boundaries, this function prioritizes the NEXT clip (the one starting at that position)
 * rather than the ending clip, which matches typical frame rendering expectations.
 *
 * @param timelineMs - Position on timeline in milliseconds
 * @param clips - Array of clips to search (should be sorted by startTime)
 * @returns The clip containing this timeline position, or null if not found
 */
export function findClipAtTimelinePosition(timelineMs: number, clips: Clip[]): Clip | null {
  if (!clips || clips.length === 0) return null

  // Use minimal epsilon for floating-point precision only (not to expand boundaries)
  const EPSILON = 0.001 // 1 microsecond - handles rounding, not timeline expansion

  // First pass: Check if we're exactly at (or within floating-point error of) any clip's start
  // This handles exact boundaries correctly by prioritizing the starting clip
  for (const clip of clips) {
    if (Math.abs(timelineMs - clip.startTime) < EPSILON) {
      return clip
    }
  }

  // Second pass: Normal range check [startTime, startTime + duration)
  for (const clip of clips) {
    const clipEnd = clip.startTime + clip.duration

    // Use inclusive start, exclusive end (standard interval notation)
    if (timelineMs >= clip.startTime && timelineMs < clipEnd) {
      return clip
    }
  }

  return null
}

/**
 * PIXEL CONVERSION FUNCTIONS
 * Convert between timeline time (ms) and UI pixel positions
 */

/**
 * Calculate pixels per millisecond for a given zoom level
 * @param stageWidth - Width of the timeline stage in pixels
 * @param zoom - Zoom level (1 = default, 2 = 2x zoom, etc)
 * @returns Pixels per millisecond
 */
export function calculatePixelsPerMs(stageWidth: number, zoom: number): number {
  const basePixelsPerMs = 0.1 // Base scale: 0.1 pixel per ms
  return basePixelsPerMs * zoom
}

/**
 * Calculate total timeline width based on duration and zoom
 * @param duration - Duration in milliseconds
 * @param pixelsPerMs - Pixels per millisecond (from calculatePixelsPerMs)
 * @param minWidth - Minimum width in pixels
 * @returns Total timeline width in pixels
 */
export function calculateTimelineWidth(duration: number, pixelsPerMs: number, minWidth: number): number {
  return Math.max(duration * pixelsPerMs, minWidth)
}

/**
 * Convert milliseconds to pixel position on timeline
 * @param timeMs - Time in milliseconds
 * @param pixelsPerMs - Pixels per millisecond
 * @returns Pixel position
 */
export function msToPixels(timeMs: number, pixelsPerMs: number): number {
  return timeMs * pixelsPerMs
}

/**
 * Convert pixel position to milliseconds on timeline
 * @param pixels - Pixel position
 * @param pixelsPerMs - Pixels per millisecond
 * @returns Time in milliseconds
 */
export function pixelsToMs(pixels: number, pixelsPerMs: number): number {
  return pixels / pixelsPerMs
}

/**
 * Calculate optimal zoom level for a given duration and viewport
 * @param duration - Duration in milliseconds
 * @param viewportWidth - Width of the viewport in pixels
 * @returns Optimal zoom level
 */
export function calculateOptimalZoom(duration: number, viewportWidth: number): number {
  if (duration === 0) return 1

  // We want the timeline to fit comfortably in the viewport
  // Leave some padding (80% of viewport)
  const targetWidth = viewportWidth * 0.8
  const basePixelsPerMs = 0.1

  // Calculate zoom needed to fit duration in target width
  const requiredZoom = targetWidth / (duration * basePixelsPerMs)

  // Clamp between reasonable zoom levels
  return Math.max(0.1, Math.min(10, requiredZoom))
}

/**
 * Get ruler intervals for timeline based on zoom level
 * @param zoom - Current zoom level
 * @returns Object with major and minor interval in milliseconds
 */
export function getRulerIntervals(zoom: number): { major: number; minor: number } {
  // Adjust intervals based on zoom level
  if (zoom < 0.5) {
    return { major: 10000, minor: 5000 } // 10s major, 5s minor
  } else if (zoom < 1) {
    return { major: 5000, minor: 1000 } // 5s major, 1s minor
  } else if (zoom < 2) {
    return { major: 1000, minor: 500 } // 1s major, 500ms minor
  } else if (zoom < 5) {
    return { major: 500, minor: 100 } // 500ms major, 100ms minor
  } else {
    return { major: 100, minor: 50 } // 100ms major, 50ms minor
  }
}

/**
 * Calculate adaptive zoom limits based on video duration and zoom blocks
 * This ensures all zoom blocks remain visible and usable at any zoom level
 *
 * @param duration - Total timeline duration in milliseconds
 * @param viewportWidth - Width of the viewport in pixels
 * @param zoomBlocks - Array of zoom blocks with startTime and endTime
 * @param minBlockWidthPx - Minimum visual width for blocks in pixels (default: 24)
 * @returns Object with min and max zoom levels
 */
export function calculateAdaptiveZoomLimits(
  duration: number,
  viewportWidth: number,
  zoomBlocks: { startTime: number; endTime: number }[],
  minBlockWidthPx: number = 24
): { min: number; max: number } {
  const basePixelsPerMs = 0.1
  const trackLabelWidth = 42 // TimelineConfig.TRACK_LABEL_WIDTH
  const effectiveViewportWidth = viewportWidth - trackLabelWidth

  // Default limits
  let minZoom = 0.05
  let maxZoom = 10

  if (duration <= 0 || effectiveViewportWidth <= 0) {
    return { min: minZoom, max: maxZoom }
  }

  // Calculate minimum zoom to fit entire timeline in viewport
  const fitToViewZoom = effectiveViewportWidth / (duration * basePixelsPerMs)

  // If we have zoom blocks, calculate minimum zoom to keep them from overlapping
  if (zoomBlocks.length > 0) {
    // Sort blocks by start time
    const sortedBlocks = [...zoomBlocks].sort((a, b) => a.startTime - b.startTime)

    // Find the densest region (smallest gap between blocks)
    // The minimum zoom must ensure blocks don't visually overlap
    let minRequiredZoom = 0

    for (let i = 0; i < sortedBlocks.length; i++) {
      const block = sortedBlocks[i]
      const blockDuration = block.endTime - block.startTime

      // Calculate zoom needed to display this block at minimum width
      // At this zoom, blockDuration * basePixelsPerMs * zoom = minBlockWidthPx
      const zoomForThisBlock = minBlockWidthPx / (blockDuration * basePixelsPerMs)

      // Check gap to next block if exists
      if (i < sortedBlocks.length - 1) {
        const nextBlock = sortedBlocks[i + 1]
        const gap = nextBlock.startTime - block.endTime

        // If gap is too small, we need higher zoom to keep blocks separate
        if (gap > 0 && gap < 500) { // Only consider small gaps
          // At minimum zoom, both blocks need minimum width + some separation
          const totalNeeded = minBlockWidthPx * 2 + 4 // 4px gap between blocks
          const totalDuration = (nextBlock.endTime - block.startTime)
          const zoomForGap = totalNeeded / (totalDuration * basePixelsPerMs)
          minRequiredZoom = Math.max(minRequiredZoom, zoomForGap)
        }
      }

      minRequiredZoom = Math.max(minRequiredZoom, zoomForThisBlock)
    }

    // The minimum zoom should be the greater of:
    // 1. Zoom needed to display all blocks at minimum width
    // 2. Zoom needed to fit timeline in viewport (but not smaller than blocks allow)
    minZoom = Math.max(0.01, Math.min(fitToViewZoom, minRequiredZoom))

    // If even fit-to-view is too small for blocks, use block requirement
    if (fitToViewZoom < minRequiredZoom) {
      minZoom = Math.max(0.01, fitToViewZoom * 0.8) // Allow some zoom out
    }
  } else {
    // No blocks, just fit to view
    minZoom = Math.max(0.01, fitToViewZoom * 0.5)
  }

  // Calculate max zoom based on shortest block (don't zoom in too much)
  if (zoomBlocks.length > 0) {
    const shortestBlockDuration = Math.min(
      ...zoomBlocks.map(b => b.endTime - b.startTime)
    )
    // At max zoom, shortest block should take about 1/4 of viewport
    const maxZoomForBlock = (effectiveViewportWidth * 0.25) / (shortestBlockDuration * basePixelsPerMs)
    maxZoom = Math.min(10, Math.max(2, maxZoomForBlock))
  }

  // Ensure min < max
  if (minZoom >= maxZoom) {
    minZoom = maxZoom * 0.1
  }

  return {
    min: Math.max(0.01, minZoom),
    max: Math.min(10, maxZoom)
  }
}

/**
 * TimeConverter namespace - groups all time conversion functions.
 */
export const TimeConverter = {
  // Time coordinate conversions
  sourceToTimeline,
  timelineToSource,
  sourceToClipRelative,
  clipRelativeToSource,
  timelineToClipRelative,
  clipRelativeToTimeline,
  getSourceDuration,
  computeEffectiveDuration,
  isTimelinePositionInClip,
  isSourceTimeInClip,
  findClipAtTimelinePosition,

  // Pixel conversions
  calculatePixelsPerMs,
  calculateTimelineWidth,
  msToPixels,
  pixelsToMs,
  calculateOptimalZoom,
  getRulerIntervals,
  calculateAdaptiveZoomLimits
}

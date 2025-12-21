/**
 * Time Coordinate Hooks - Abstracts time calculations using Remotion's useCurrentFrame
 *
 * These hooks provide clean access to time in different coordinate systems without
 * requiring manual calculations or prop drilling.
 */

import { useCurrentFrame } from 'remotion';
import { useTimeContext } from '../context/TimeContext';
import { useClipContext } from '../context/ClipContext';
import { clipRelativeToSource, timelineToSource } from '@/lib/timeline/time-space-converter';
import { useMemo } from 'react';

/**
 * Get the current source time (recording timestamp) for the current frame
 *
 * This is the primary hook for time-based calculations. It handles all the
 * complexity of converting from Remotion's frame counter to source time.
 *
 * @returns Source time in milliseconds
 */
export function useSourceTime(): number {
  const frame = useCurrentFrame();
  const { fps } = useTimeContext();
  const { clip } = useClipContext();

  return useMemo(() => {
    // Convert frame to clip-relative milliseconds
    const clipRelativeMs = (frame / fps) * 1000;

    // Convert to source time
    return clipRelativeToSource(clipRelativeMs, clip);
  }, [frame, fps, clip]);
}

/**
 * Get the current timeline position (final video timestamp) for the current frame
 *
 * @returns Timeline position in milliseconds
 */
export function useTimelinePosition(): number {
  const frame = useCurrentFrame();
  const { fps } = useTimeContext();
  const { clip } = useClipContext();

  return useMemo(() => {
    // Convert frame to clip-relative milliseconds
    const clipRelativeMs = (frame / fps) * 1000;

    // Add clip's start time to get timeline position
    return clip.startTime + clipRelativeMs;
  }, [frame, fps, clip]);
}

/**
 * Get the previous frame's source time
 *
 * This is critical for smooth state transitions (zoom, cursor) at clip boundaries.
 * It correctly handles the case where the previous frame is in a different clip.
 *
 * @returns Previous frame's source time, or 0 if at start
 */
export function usePreviousSourceTime(): number {
  const frame = useCurrentFrame();
  const { fps, getClipAtTimelinePosition } = useTimeContext();
  const { clip } = useClipContext();

  return useMemo(() => {
    // Calculate current timeline position
    const clipRelativeMs = (frame / fps) * 1000;
    const currentTimelineMs = clip.startTime + clipRelativeMs;

    // Calculate previous frame's timeline position
    const frameDurationMs = 1000 / fps;
    const prevTimelineMs = Math.max(0, currentTimelineMs - frameDurationMs);

    // If at start, return 0
    if (prevTimelineMs === 0) {
      return 0;
    }

    // Find which clip contains the previous timeline position
    // This might be the current clip OR the previous clip!
    const prevClip = getClipAtTimelinePosition(prevTimelineMs);

    if (!prevClip) {
      // Shouldn't happen, but return 0 as fallback
      return 0;
    }

    // Convert using the CORRECT clip
    return timelineToSource(prevTimelineMs, prevClip);
  }, [frame, fps, clip, getClipAtTimelinePosition]);
}

/**
 * Get the clip-relative time (time since clip start)
 *
 * @returns Clip-relative time in milliseconds
 */
export function useClipRelativeTime(): number {
  const frame = useCurrentFrame();
  const { fps } = useTimeContext();

  return useMemo(() => {
    return (frame / fps) * 1000;
  }, [frame, fps]);
}

/**
 * Get the absolute frame number (for frame-specific calculations)
 *
 * @returns Absolute frame number
 */
export function useAbsoluteFrame(): number {
  const frame = useCurrentFrame();
  const { clip } = useClipContext();
  const { fps } = useTimeContext();

  return useMemo(() => {
    // Calculate absolute frame from timeline position
    const clipRelativeMs = (frame / fps) * 1000;
    const timelineMs = clip.startTime + clipRelativeMs;
    return Math.round((timelineMs / 1000) * fps);
  }, [frame, fps, clip]);
}
